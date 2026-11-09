"""Audit synthetic stdin JSON only. No RPC transport, Codex process, or output files."""
import importlib.util
import json
from pathlib import Path
import sys

# Keep the offline entry point from creating policy.pyc even without caller -B.
sys.dont_write_bytecode = True

MAX_BYTES = 1048576
MAX_EXCHANGES = 100


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate_key")
        result[key] = value
    return result


def _reject_constant(value):
    raise ValueError("invalid_json_constant")


def audit(fixture):
    if (not isinstance(fixture, dict)
            or set(fixture) != {"project_root", "contract_version", "exchanges"}
            or not isinstance(fixture["exchanges"], list)
            or len(fixture["exchanges"]) > MAX_EXCHANGES
            or any(not isinstance(item, dict) or set(item) != {"request", "response"}
                   for item in fixture["exchanges"])):
        raise ValueError("invalid_fixture")
    spec = importlib.util.spec_from_file_location("observer_policy", Path(__file__).with_name("policy.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    policy = module.ReadOnlyObserverPolicy(fixture["project_root"], fixture["contract_version"])
    summaries = []
    denied = 0
    for item in fixture["exchanges"]:
        request = item["request"]
        decision = policy.check_request(request)
        if not decision["allowed"]:
            denied += 1
            summaries.append({"status": "denied", "reason": decision["reason"]})
        elif request["method"] == "thread/list":
            summaries.append(policy.accept_thread_page(request, item["response"]))
        elif request["method"] == "thread/read":
            summaries.append(policy.summarize_thread_read(request, item["response"]))
        else:
            # A handshake-shaped fixture proves policy shape only, not a handshake.
            summaries.append({"status": "request_shape_allowed"})
    return {"status": "audited", "evidence_kind": "synthetic_rpc_fixture_not_observed_events",
            "runtime_requests_sent": 0, "real_session_observed": False,
            "plan_capture": "not_established", "denied_requests": denied, "exchanges": summaries}


def main():
    try:
        raw = sys.stdin.buffer.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise ValueError("oversized_fixture")
        fixture = json.loads(raw, object_pairs_hook=_unique_object, parse_constant=_reject_constant)
        result = audit(fixture)
    except (ValueError, RecursionError):
        print('{"status":"invalid_fixture"}')
        return 1
    print(json.dumps(result, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
