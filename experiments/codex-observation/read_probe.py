"""Disposable Spike probe. Read-only RPC allowlist; no production Adapter.

Raw messages and stderr stay in memory. Evidence contains counts, aliases and
fixed error labels only. Does not create/resume/subscribe/control a Thread.
"""
import argparse
import collections
import json
import os
from pathlib import Path
import queue
import subprocess
import threading
import time

ALLOWED = {"initialize", "thread/list", "thread/read", "thread/loaded/list"}
ITEM_TYPES = {"userMessage", "agentMessage", "plan", "reasoning", "commandExecution",
              "fileChange", "mcpToolCall", "dynamicToolCall", "collabAgentToolCall",
              "webSearch", "imageView", "imageGeneration", "enteredReviewMode",
              "exitedReviewMode", "compaction"}


def error_label(value):
    text = str(value).lower()
    if "10013" in text:
        return "socket_access_denied_os10013"
    if "access is denied" in text or "os error 5" in text or "permission denied" in text:
        return "permission_denied"
    if "requires experimentalapi" in text:
        return "experimental_api_required"
    return "redacted_error"


def summarize_thread(thread, root, alias):
    turns = thread.get("turns", [])
    counts = collections.Counter()
    finals = 0
    for turn in turns:
        for item in turn.get("items", []):
            kind = item.get("type", "unknown")
            counts[kind if kind in ITEM_TYPES else "other"] += 1
            finals += int(kind == "agentMessage" and item.get("phase") == "final_answer")
    status = thread.get("status", {})
    kind = status.get("type") if isinstance(status, dict) else None
    return {
        "thread_alias": alias,
        "cwd_exact_match": os.path.normcase(os.path.normpath(thread.get("cwd", "")))
                           == os.path.normcase(os.path.normpath(root)),
        "status_type": kind if kind in {"notLoaded", "idle", "systemError", "active"} else "other",
        "session_id_present": bool(thread.get("sessionId")),
        "turn_count_in_response": len(turns),
        "item_type_counts": dict(counts),
        "final_agent_message_count": finals,
        "task_completion_attribution": "not_established",
    }


def run(args):
    result = {"probe": "standalone_stdio_history", "requests": [], "notifications": {},
              "projects": [], "created_threads": 0, "control_requests": 0}
    messages = queue.Queue()
    stderr_labels = collections.Counter()
    command = [args.node, args.cli_js, "app-server", "--listen", "stdio://"]
    proc = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True, encoding="utf-8", errors="replace")

    def stdout_reader():
        for line in proc.stdout:
            try:
                messages.put(json.loads(line))
            except (ValueError, TypeError):
                messages.put({"probe_invalid_json": True})
        messages.put({"probe_eof": True})

    def stderr_reader():
        for line in proc.stderr:
            stderr_labels[error_label(line)] += 1

    readers = [threading.Thread(target=stdout_reader, daemon=True),
               threading.Thread(target=stderr_reader, daemon=True)]
    for reader in readers:
        reader.start()
    notifications = collections.Counter()
    next_id = 0

    def rpc(method, params):
        nonlocal next_id
        assert method in ALLOWED
        next_id += 1
        entry = {"method": method, "parameter_keys": sorted(params)}
        result["requests"].append(entry)
        start = time.monotonic()
        try:
            proc.stdin.write(json.dumps({"id": next_id, "method": method, "params": params}) + "\n")
            proc.stdin.flush()
            while True:
                remaining = args.timeout - (time.monotonic() - start)
                if remaining <= 0:
                    raise TimeoutError()
                msg = messages.get(timeout=remaining)
                if msg.get("probe_eof"):
                    entry["outcome"] = "process_eof"
                    return None
                if "method" in msg:
                    if "id" in msg:
                        entry["outcome"] = "unexpected_server_request_not_answered"
                        return None
                    method_name = msg["method"]
                    notifications[method_name if method_name in {
                        "turn/plan/updated", "thread/status/changed", "turn/completed",
                        "thread/started", "item/completed"} else "other"] += 1
                if msg.get("id") == next_id and "method" not in msg:
                    if "error" in msg:
                        entry["outcome"] = error_label(msg["error"])
                        entry["rpc_error_code"] = msg["error"].get("code")
                        return None
                    entry["outcome"] = "response"
                    return msg.get("result", {})
        except (queue.Empty, TimeoutError):
            entry["outcome"] = "timeout"
            return None
        except (OSError, ValueError):
            entry["outcome"] = "pipe_unavailable"
            return None
        finally:
            entry["response_latency_ms"] = round((time.monotonic() - start) * 1000, 1)

    try:
        init = rpc("initialize", {"clientInfo": {"name": "visualizer_spike_readonly",
                                                 "title": "Disposable observation Spike", "version": "0.0.0"}})
        if init is None:
            result["outcome"] = "initialization_unavailable"
        else:
            proc.stdin.write(json.dumps({"method": "initialized", "params": {}}) + "\n")
            proc.stdin.flush()
            for index, root in enumerate(args.project, 1):
                page = rpc("thread/list", {"cwd": root, "limit": 10, "useStateDbOnly": True})
                project = {"project_alias": f"project-{index}", "list_available": page is not None,
                           "threads": []}
                result["projects"].append(project)
                if page is None:
                    continue
                data = page.get("data", [])
                project["returned_count"] = len(data)
                project["next_cursor_present"] = bool(page.get("nextCursor"))
                for number, thread in enumerate(data[:2], 1):
                    alias = f"p{index}-thread-{number}"
                    summary = summarize_thread(thread, root, alias)
                    read = rpc("thread/read", {"threadId": thread["id"], "includeTurns": True})
                    summary["history_read_available"] = read is not None
                    if read:
                        summary.update(summarize_thread(read.get("thread", {}), root, alias))
                    project["threads"].append(summary)
            loaded = rpc("thread/loaded/list", {})
            result["own_server_loaded_count"] = len(loaded.get("data", [])) if loaded is not None else None
            result["outcome"] = "read_probe_finished"
    finally:
        if proc.poll() is None:
            proc.terminate()  # Only our disposable server process, never the existing daemon.
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)
        for reader in readers:
            reader.join(timeout=2)
        result["process_exit_code"] = proc.returncode
        result["stderr_fixed_label_counts"] = dict(stderr_labels)
        result["notifications"] = dict(notifications)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--node", required=True)
    parser.add_argument("--cli-js", required=True)
    parser.add_argument("--project", action="append", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--timeout", type=float, default=15)
    options = parser.parse_args()
    evidence = run(options)
    Path(options.out).parent.mkdir(parents=True, exist_ok=True)
    Path(options.out).write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"outcome": evidence["outcome"], "evidence_written": True}))
