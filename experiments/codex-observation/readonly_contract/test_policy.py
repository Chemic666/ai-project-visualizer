"""Synthetic-only tests; never start Codex or contact a socket."""
import importlib.util
import json
from pathlib import Path
import unittest

HERE = Path(__file__).resolve().parent


def load_policy():
    assert (HERE / "policy.py").is_file(), "The project-scoped observer policy is not implemented"
    spec = importlib.util.spec_from_file_location("observer_policy_tests", HERE / "policy.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ROOT = r"D:\Synthetic\apv-fixture"


def listing(cursor=None):
    params = {"cwd": ROOT, "limit": 10, "useStateDbOnly": True}
    if cursor is not None:
        params["cursor"] = cursor
    return {"id": 1, "method": "thread/list", "params": params}


def thread(identity="PRIVATE_THREAD_ID", cwd=ROOT):
    return {"id": identity, "cwd": cwd, "sessionId": "PRIVATE_SESSION_ID",
            "status": {"type": "active"}, "preview": "PRIVATE_PROMPT", "name": "PRIVATE_NAME",
            "turns": [{"items": [{"text": "PRIVATE_TOOL_OUTPUT"}]}], "token": "PRIVATE_TOKEN"}


def page(items, cursor=None):
    return {"id": 1, "result": {"data": items, "nextCursor": cursor}}


def read(identity="PRIVATE_THREAD_ID", **extra):
    return {"id": 2, "method": "thread/read", "params": {"threadId": identity, "includeTurns": False, **extra}}


class ObserverPolicyTests(unittest.TestCase):
    def setUp(self):
        self.module = load_policy()
        self.policy = self.module.ReadOnlyObserverPolicy(ROOT, "0.160.0")

    def test_only_project_scoped_state_db_list_is_allowed(self):
        self.assertTrue(self.policy.check_request(listing())["allowed"])
        for params in ({"limit": 10}, {"cwd": r"D:\Synthetic\other", "limit": 10, "useStateDbOnly": True},
                       {"cwd": ROOT, "limit": 10, "useStateDbOnly": False},
                       {"cwd": [ROOT], "limit": 10, "useStateDbOnly": True},
                       {"cwd": ROOT, "limit": True, "useStateDbOnly": True},
                       {"cwd": ROOT, "limit": 10, "useStateDbOnly": True, "instructions": "PRIVATE"}):
            self.assertFalse(self.policy.check_request({"id": 1, "method": "thread/list", "params": params})["allowed"])

    def test_control_and_unscoped_endpoints_remain_denied(self):
        for method in ("thread/start", "thread/resume", "thread/fork", "turn/start", "turn/steer",
                       "thread/goal/set", "thread/archive", "thread/unsubscribe", "command/exec",
                       "thread/loaded/list", "thread/items/list", "thread/subscribe", "PRIVATE_UNKNOWN"):
            self.assertFalse(self.policy.check_request({"id": 1, "method": method, "params": {}})["allowed"])

    def test_foreign_thread_in_page_never_authorizes_a_read(self):
        result = self.policy.accept_thread_page(listing(), page([thread(cwd=r"D:\Synthetic\other")]))
        self.assertEqual(result["status"], "rejected")
        self.assertFalse(self.policy.check_request(read())["allowed"])

    def test_mixed_page_is_atomic_and_does_not_bind_even_the_good_row(self):
        result = self.policy.accept_thread_page(listing(), page([thread(), thread("FOREIGN", r"D:\Synthetic\other")]))
        self.assertEqual(result["status"], "rejected")
        self.assertFalse(self.policy.check_request(read())["allowed"])

    def test_known_thread_reads_are_metadata_only(self):
        result = self.policy.accept_thread_page(listing(), page([thread()]))
        self.assertEqual(result["status"], "accepted")
        self.assertTrue(self.policy.check_request(read())["allowed"])
        self.assertFalse(self.policy.check_request(read("UNBOUND"))["allowed"])
        self.assertFalse(self.policy.check_request(read(includeTurns=True))["allowed"])
        self.assertFalse(self.policy.check_request(read(model="anything"))["allowed"])

    def test_private_payload_is_never_in_summaries_or_decisions(self):
        decisions = [self.policy.accept_thread_page(listing(), page([thread()])), self.policy.check_request(read())]
        decisions.append(self.policy.summarize_thread_read(read(), {"id": 2, "result": {"thread": thread()}}))
        self.assertEqual(decisions[-1]["status"], "available")
        output = json.dumps(decisions)
        for sentinel in ("PRIVATE_", ROOT, "threadId", "turns", "preview"):
            self.assertNotIn(sentinel, output)

    def test_bad_response_id_errors_and_oversized_pages_do_not_create_bindings(self):
        cases = [{"id": 99, "result": {"data": [thread()]}}, {"id": True, "result": {"data": [thread()]}},
                 {"id": 1, "error": {"message": "PRIVATE_TOKEN"}}, page([thread(str(i)) for i in range(11)]),
                 page([thread(), thread()])]
        for response in cases:
            self.assertNotEqual(self.policy.accept_thread_page(listing(), response)["status"], "accepted")
        self.assertFalse(self.policy.check_request(read())["allowed"])

    def test_read_scope_change_revokes_the_prior_binding(self):
        self.policy.accept_thread_page(listing(), page([thread()]))
        result = self.policy.summarize_thread_read(read(), {"id": 2, "result": {"thread": thread(cwd=r"D:\Synthetic\other")}})
        self.assertEqual(result["status"], "rejected")
        self.assertFalse(self.policy.check_request(read())["allowed"])

    def test_contradictory_later_page_revokes_old_binding(self):
        self.policy.accept_thread_page(listing(), page([thread()]))
        self.policy.accept_thread_page(listing(), page([thread(cwd=None)]))
        self.assertFalse(self.policy.check_request(read())["allowed"])

    def test_cursor_must_come_from_an_accepted_page(self):
        self.assertFalse(self.policy.check_request(listing("UNBOUND_CURSOR"))["allowed"])
        result = self.policy.accept_thread_page(listing(), page([thread()], "PRIVATE_CURSOR"))
        self.assertEqual(result["status"], "accepted")
        self.assertTrue(self.policy.check_request(listing("PRIVATE_CURSOR"))["allowed"])
        self.assertNotIn("PRIVATE_CURSOR", json.dumps(result))

    def test_request_and_root_validation_are_fail_closed(self):
        for root in (r"relative\path", r"D:\Synthetic\..\other", r"\\server\share", r"\\?\D:\Synthetic\apv-fixture"):
            with self.assertRaises(ValueError):
                self.module.ReadOnlyObserverPolicy(root, "0.160.0")
        with self.assertRaises(ValueError):
            self.module.ReadOnlyObserverPolicy(ROOT, "unknown")
        for request in (None, [], {"id": True, "method": "thread/list", "params": listing()["params"]},
                        {**listing(), "instructions": "PRIVATE"}):
            self.assertFalse(self.policy.check_request(request)["allowed"])

    def test_case_and_separator_variants_are_syntactic_only(self):
        row = thread(cwd="d:/synthetic/apv-fixture/")
        self.assertEqual(self.policy.accept_thread_page(listing(), page([row]))["status"], "accepted")
        self.assertTrue(self.policy.check_request(read())["allowed"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
