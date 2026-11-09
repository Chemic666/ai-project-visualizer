"""End-to-end offline fixture checks. Starts Python only, never Codex."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import unittest

HERE = Path(__file__).resolve().parent


class OfflineAuditTests(unittest.TestCase):
    def run_audit(self, payload):
        self.assertTrue((HERE / "audit_fixture.py").is_file(), "Offline audit entry point missing")
        return subprocess.run([sys.executable, "-I", "-S", "-B", str(HERE / "audit_fixture.py")],
                              input=payload, capture_output=True, timeout=10)

    def test_synthetic_fixture_is_sanitized_and_never_sent(self):
        fixture = (HERE / "fixtures" / "synthetic.json").read_bytes()
        process = self.run_audit(fixture)
        self.assertEqual(process.returncode, 0, process.stderr)
        result = json.loads(process.stdout)
        self.assertEqual(result["runtime_requests_sent"], 0)
        self.assertFalse(result["real_session_observed"])
        self.assertEqual(result["plan_capture"], "not_established")
        self.assertEqual(result["denied_requests"], 2)
        self.assertEqual([row["status"] for row in result["exchanges"]],
                         ["accepted", "available", "rejected", "denied", "denied"])
        for sentinel in (b"PRIVATE_", b"Synthetic", b"threadId", b"preview", b"turns"):
            self.assertNotIn(sentinel, process.stdout)
        self.assertEqual(process.stderr, b"")

    def test_invalid_fixtures_fail_without_echoing_payload(self):
        for fixture in (b'PRIVATE_TOKEN', b'[]', b'{"project_root":"PRIVATE_PATH"}',
                        b'{"contract_version":"0.160.0","project_root":"D:\\\\Synthetic","exchanges":[null]}',
                        b'{"contract_version":"0.160.0","contract_version":"PRIVATE_DUPLICATE"}',
                        b' ' * (1048576 + 1)):
            process = self.run_audit(fixture)
            self.assertEqual(process.returncode, 1)
            self.assertEqual(json.loads(process.stdout), {"status": "invalid_fixture"})
            self.assertEqual(process.stderr, b"")

    def test_retained_contract_hashes_are_unchanged(self):
        experiment = HERE.parent
        summary = json.loads((experiment / "evidence" / "schema-contract-summary.json").read_text(encoding="utf-8"))
        self.assertEqual(summary["cli_version"], "0.160.0")
        hashes = summary["source_sha256"]
        self.assertEqual(len(hashes), 11)
        for name, expected in hashes.items():
            # These are retained public schema files, never session stores.
            parts = name.split("/")
            self.assertTrue(all(part not in ("", ".", "..") and ":" not in part and "\\" not in part
                                for part in parts))
            actual = hashlib.sha256((experiment / "schema-0.160.0").joinpath(*parts).read_bytes()).hexdigest()
            self.assertEqual(actual, expected, name)


if __name__ == "__main__":
    unittest.main(verbosity=2)
