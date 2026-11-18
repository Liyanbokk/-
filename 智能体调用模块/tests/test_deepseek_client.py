import json
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from deepseek_client import DeepSeekClient


class StubHandler(BaseHTTPRequestHandler):
    seen = {}

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.__class__.seen = {"path": self.path, "body": body,
                               "auth": self.headers.get("Authorization")}
        data = json.dumps({"choices": [{"finish_reason": "stop",
                    "message": {"content": '{"fields":[]}'}}]}).encode()
        self.send_response(200)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *_args):
        pass


class DeepSeekTransportTest(unittest.TestCase):
    def test_chat_completions_json_transport(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), StubHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            client = DeepSeekClient("test-key", f"http://127.0.0.1:{server.server_port}",
                                    "test-model")
            self.assertEqual(client.json_response("json only", "hello"), {"fields": []})
            self.assertEqual(StubHandler.seen["path"], "/chat/completions")
            self.assertEqual(StubHandler.seen["body"]["model"], "test-model")
            self.assertEqual(StubHandler.seen["auth"], "Bearer test-key")
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
