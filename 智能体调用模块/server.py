"""Standalone local HTTP adapter for the interview agent."""
from __future__ import annotations

import json
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import RLock

from deepseek_client import DeepSeekClient
from interview import InterviewEngine, Session

engine = InterviewEngine(DeepSeekClient())
sessions: dict[str, Session] = {}
lock = RLock()


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, data: dict) -> None:
        raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _body(self) -> dict:
        size = int(self.headers.get("Content-Length", "0"))
        if size < 0 or size > 10000:
            raise ValueError("request body too large")
        body = json.loads(self.rfile.read(size) or b"{}")
        if not isinstance(body, dict):
            raise ValueError("JSON body must be an object")
        return body

    def do_GET(self) -> None:
        if self.path == "/health":
            self._send(200, {"status": "ok", "model_configured": engine.client.available,
                             "sessions": len(sessions)})
            return
        match = re.fullmatch(r"/v1/sessions/(s_[0-9a-f]{32})", self.path)
        if match:
            with lock:
                session = sessions.get(match.group(1))
                if not session:
                    self._send(404, {"error": "session_not_found"})
                    return
                data = {"session_id": session.id, "status": session.status,
                        "pending": session.pending, "summary": engine.summary(session)}
            self._send(200, data)
            return
        self._send(404, {"error": "not_found"})

    def do_POST(self) -> None:
        try:
            body = self._body()
            if self.path == "/v1/sessions":
                session = Session()
                with lock:
                    sessions[session.id] = session
                self._send(201, {"session_id": session.id, "status": session.status})
                return
            match = re.fullmatch(r"/v1/sessions/(s_[0-9a-f]{32})/turns", self.path)
            if not match:
                self._send(404, {"error": "not_found"})
                return
            text = body.get("text")
            if not isinstance(text, str):
                raise ValueError("text must be a string")
            with lock:
                session = sessions.get(match.group(1))
                if not session:
                    self._send(404, {"error": "session_not_found"})
                    return
                result = engine.turn(session, text)
            self._send(200, result)
        except (ValueError, json.JSONDecodeError) as exc:
            self._send(400, {"error": "invalid_request", "message": str(exc)})

    def log_message(self, format: str, *args) -> None:
        # Do not print medical free text or request bodies.
        pass


if __name__ == "__main__":
    host = os.getenv("AGENT_HOST", "127.0.0.1")
    port = int(os.getenv("AGENT_PORT", "8010"))
    print(f"Interview agent listening on http://{host}:{port}")
    ThreadingHTTPServer((host, port), Handler).serve_forever()
