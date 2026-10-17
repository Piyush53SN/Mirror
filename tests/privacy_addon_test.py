#!/usr/bin/env python3
"""
tests/privacy_addon_test.py

Unit tests for the mitmproxy addon. Fake flows stand in for mitmproxy's objects,
so the scanning logic is testable without the proxy or an emulator installed.
Run: python3 -m unittest discover -s tests -p 'privacy_addon_test.py'
"""
import contextlib
import io
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts", "privacy"))
import mitmproxy_canary as addon  # noqa: E402


class FakeHeaders(dict):
    pass


class FakeMessage:
    def __init__(self, method="GET", url="https://api.example/v1", headers=None, content=b"", pretty_url=None):
        self.method = method
        self.url = url
        self.pretty_url = pretty_url or url
        self.headers = FakeHeaders(headers or {})
        self.raw_content = content


class FakeFlow:
    def __init__(self, request, response=None):
        self.request = request
        self.response = response


TOKEN = "MRRCANARY-9f2c1a7b3d4e"


class ScanTests(unittest.TestCase):
    def test_clean_flow_has_no_findings(self):
        flow = FakeFlow(FakeMessage("POST", "https://api.example/v1/aggregate", {"content-type": "application/json"}, b'{"sessions": 3}'))
        self.assertEqual(addon.scan_flow(flow, [TOKEN]), [])

    def test_body_in_clear_text(self):
        flow = FakeFlow(FakeMessage("POST", "https://api.example/x", content=json.dumps({"q": TOKEN}).encode()))
        findings = addon.scan_flow(flow, [TOKEN])
        self.assertTrue(any(f["location"] == "request.body" and f["encoding"] == "raw" for f in findings), findings)

    def test_url_is_scanned(self):
        flow = FakeFlow(FakeMessage("GET", f"https://api.example/s?q={TOKEN}"))
        findings = addon.scan_flow(flow, [TOKEN])
        self.assertTrue(any(f["location"] == "request.url" for f in findings), findings)

    def test_header_base64(self):
        import base64

        value = "Basic " + base64.b64encode(f"{TOKEN}:x".encode()).decode()
        flow = FakeFlow(FakeMessage("POST", "https://api.example/x", {"authorization": value}))
        findings = addon.scan_flow(flow, [TOKEN])
        self.assertTrue(any(f["location"] == "request.headers.authorization" and f["encoding"] == "base64" for f in findings), findings)

    def test_hex_body(self):
        flow = FakeFlow(FakeMessage("POST", "https://api.example/x", content=TOKEN.encode().hex().encode()))
        findings = addon.scan_flow(flow, [TOKEN])
        self.assertTrue(any(f["encoding"] == "hex" for f in findings), findings)

    def test_response_is_scanned(self):
        flow = FakeFlow(
            FakeMessage("GET", "https://api.example/v1"),
            FakeMessage("200", "https://api.example/v1", content=f"echo {TOKEN}".encode()),
        )
        findings = addon.scan_flow(flow, [TOKEN])
        self.assertTrue(any(f["location"] == "response.body" for f in findings), findings)

    def test_lookalike_is_not_flagged(self):
        flow = FakeFlow(FakeMessage("POST", "https://api.example/x", content=b"MRRCANARY-000000000000"))
        self.assertEqual(addon.scan_flow(flow, [TOKEN]), [])

    def test_done_writes_a_report_and_counts_flows(self):
        addon_ = addon.CanaryAddon()
        addon_.canaries = [TOKEN]
        with tempfile.TemporaryDirectory() as tmp:
            addon_.report_path = os.path.join(tmp, "report.json")
            addon_.request(FakeFlow(FakeMessage("GET", "https://api.example/clean")))
            addon_.response(FakeFlow(FakeMessage("GET", f"https://api.example/{TOKEN}")))
            with contextlib.redirect_stdout(io.StringIO()):
                addon_.done()
            with open(addon_.report_path, encoding="utf-8") as handle:
                report = json.load(handle)
        self.assertEqual(report["flows"], 2)
        self.assertEqual(len(report["findings"]), 1)
        self.assertEqual(report["findings"][0]["location"], "request.url")

    def test_parse_canaries_ignores_blank_entries(self):
        self.assertEqual(addon.parse_canaries("a, ,b,"), ["a", "b"])


if __name__ == "__main__":
    unittest.main()
