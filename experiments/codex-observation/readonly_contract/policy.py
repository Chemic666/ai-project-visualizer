"""Offline scope policy for the retained 0.160.0 contract; contains no transport."""
import ntpath
import re


def _root(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z]:[\\/].*", value):
        raise ValueError("unsupported_project_root")
    if any(ord(char) < 32 for char in value):
        raise ValueError("unsupported_project_root")
    parts = re.split(r"[\\/]", value[3:])
    if any(part in (".", "..") or any(char in part for char in ':*?"<>|')
           or part.endswith((".", " ")) for part in parts):
        raise ValueError("unsupported_project_root")
    return ntpath.normcase(ntpath.normpath(value))


def _text(value):
    return isinstance(value, str) and bool(value.strip())


class ReadOnlyObserverPolicy:
    """Evaluates supplied objects only; caller owns response authenticity/correlation.

    Raw IDs and pagination cursors are retained in memory, never returned in summaries.
    This is not a physical-path, handshake, transport, or live-observation proof.
    """

    def __init__(self, project_root, contract_version):
        if contract_version != "0.160.0":
            raise ValueError("unsupported_contract_version")
        self._project_root = _root(project_root)
        self._bindings = {}
        self._cursors = set()
        self._next_alias = 1

    def _same_root(self, value):
        try:
            return _root(value) == self._project_root
        except ValueError:
            return False

    def check_request(self, request):
        allowed = False
        if not isinstance(request, dict) or set(request) - {"id", "method", "params"}:
            return {"allowed": False, "reason": "invalid_request"}
        method, params = request.get("method"), request.get("params")
        if method == "initialized":
            allowed = "id" not in request and params == {}
        elif type(request.get("id")) is not int or request["id"] < 1 or not isinstance(params, dict):
            return {"allowed": False, "reason": "invalid_request"}
        elif method == "initialize":
            client = params.get("clientInfo")
            allowed = (set(params) == {"clientInfo"} and isinstance(client, dict)
                       and {"name", "version"} <= set(client) <= {"name", "version", "title"}
                       and all(_text(value) for value in client.values()))
        elif method == "thread/list":
            cursor = params.get("cursor")
            allowed = (not set(params) - {"cwd", "limit", "useStateDbOnly", "archived", "cursor"}
                       and self._same_root(params.get("cwd"))
                       and type(params.get("limit")) is int and 1 <= params["limit"] <= 20
                       and params.get("useStateDbOnly") is True
                       and params.get("archived", False) is False
                       and (cursor is None or (isinstance(cursor, str) and cursor in self._cursors)))
        elif method == "thread/read":
            identity = params.get("threadId")
            allowed = (set(params) == {"threadId", "includeTurns"}
                       and isinstance(identity, str) and identity in self._bindings
                       and params["includeTurns"] is False)
        return {"allowed": bool(allowed), "reason": "allowed" if allowed else "outside_contract"}

    def _result(self, request, response, expected_method):
        if not self.check_request(request)["allowed"] or request.get("method") != expected_method:
            return None, {"status": "rejected", "reason": "request_denied"}
        if (not isinstance(response, dict) or "method" in response
                or type(response.get("id")) is not int or response["id"] != request["id"]
                or ("result" in response) == ("error" in response)):
            return None, {"status": "rejected", "reason": "invalid_response"}
        if "error" in response:
            return None, {"status": "unavailable", "reason": "rpc_unavailable"}
        if not isinstance(response["result"], dict):
            return None, {"status": "rejected", "reason": "invalid_response"}
        return response["result"], None

    def accept_thread_page(self, request, response):
        result, failure = self._result(request, response, "thread/list")
        if failure:
            return failure
        rows, cursor = result.get("data"), result.get("nextCursor")
        if not isinstance(rows, list):
            return {"status": "rejected", "reason": "invalid_page"}
        # Revoke contradictory known identities even if another row invalidates this page.
        invalid = len(rows) > request["params"]["limit"] or not (cursor is None or _text(cursor))
        identities = set()
        for row in rows:
            if not isinstance(row, dict):
                invalid = True
                continue
            identity = row.get("id")
            if not _text(identity):
                invalid = True
                continue
            if not self._same_root(row.get("cwd")):
                self._bindings.pop(identity, None)
                invalid = True
            if identity in identities:
                invalid = True
            identities.add(identity)
        if invalid:
            return {"status": "rejected", "reason": "invalid_page_scope"}
        # All rows have passed before any new identity or cursor becomes trusted.
        for row in rows:
            identity = row["id"]
            if identity not in self._bindings:
                self._bindings[identity] = f"thread-{self._next_alias}"
                self._next_alias += 1
        if cursor is not None:
            self._cursors.add(cursor)
        return {"status": "accepted", "thread_count": len(rows), "cursor_present": cursor is not None}

    def summarize_thread_read(self, request, response):
        result, failure = self._result(request, response, "thread/read")
        if failure:
            return failure
        identity = request["params"]["threadId"]
        row = result.get("thread")
        if (not isinstance(row, dict) or row.get("id") != identity
                or not self._same_root(row.get("cwd"))):
            self._bindings.pop(identity, None)
            return {"status": "rejected", "reason": "invalid_read_scope"}
        state = row.get("status")
        state = state.get("type") if isinstance(state, dict) else None
        if state not in ("notLoaded", "idle", "systemError", "active"):
            state = "unknown"
        return {"status": "available", "thread_alias": self._bindings[identity],
                "thread_status": state, "session_id_present": _text(row.get("sessionId"))}
