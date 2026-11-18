"""Small, dependency-free DeepSeek JSON client."""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request


class DeepSeekClient:
    def __init__(self, api_key: str | None = None, base_url: str | None = None,
                 model: str | None = None, timeout: float = 8.0):
        self.api_key = api_key if api_key is not None else os.getenv("DEEPSEEK_API_KEY", "")
        self.base_url = (base_url or os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")).rstrip("/")
        self.model = model or os.getenv("DEEPSEEK_MODEL", "deepseek-flash")
        self.timeout = timeout

    @property
    def available(self) -> bool:
        return bool(self.api_key)

    def json_response(self, system: str, user: str, max_tokens: int = 500) -> dict:
        if not self.available:
            raise RuntimeError("DEEPSEEK_API_KEY is not configured")
        body = json.dumps({
            "model": self.model,
            "messages": [{"role": "system", "content": system},
                         {"role": "user", "content": user}],
            "response_format": {"type": "json_object"},
            "temperature": 0.2,
            "max_tokens": max_tokens,
        }, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(
            self.base_url + "/chat/completions", data=body, method="POST",
            headers={"Content-Type": "application/json",
                     "Authorization": "Bearer " + self.api_key})
        last_error: Exception | None = None
        for attempt in range(3):
            try:
                with urllib.request.urlopen(request, timeout=self.timeout) as response:
                    payload = json.load(response)
                choice = payload["choices"][0]
                if choice.get("finish_reason") == "length":
                    raise ValueError("model JSON was truncated")
                content = choice["message"]["content"]
                if not isinstance(content, str) or not content.strip():
                    raise ValueError("model returned empty JSON")
                result = json.loads(content)
                if not isinstance(result, dict):
                    raise ValueError("model JSON must be an object")
                return result
            except urllib.error.HTTPError as exc:
                last_error = exc
                if exc.code not in (429, 500, 502, 503, 504):
                    break
            except (urllib.error.URLError, TimeoutError, ValueError, KeyError,
                    IndexError, json.JSONDecodeError) as exc:
                last_error = exc
            if attempt < 2:
                time.sleep(0.2 * (attempt + 1))
        raise RuntimeError("DeepSeek request failed") from last_error
