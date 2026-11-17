"""
大模型调用层。

**这个系统在模型不可用时必须完整可用**，所以这一层的设计是：
模型只做两件事，都是「锦上添花」，挂了就退回模板。

    1. 抽取：把用户第一句口语整理成结构化主诉（挂了就用原文 + 关键词匹配）
    2. 润色：把模板生成的建议改得更像人话（挂了就用模板原文）

追问阶段完全不走模型 —— 那是状态机的活（见 statemachine.py）。
整个问诊最多 2 次模型调用，这也是为什么现场点起来很快。

超时 / 重试 / 熔断 / 降级，四件套都在 LLMClient 里，业务层不用关心。
"""
from __future__ import annotations

import json
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Optional

from . import audit
from .config import config
from .security import scrub_output

# ---------------------------------------------------------------- 提示词
# 这段提示词要能直接拿给评委看：它体现的是「约束」而不是「许愿」。
SYSTEM_PROMPT = """你是校园预问诊系统的信息整理助手，不是医生。

【身份边界】
- 你不做诊断，不下结论，不说「你得了什么病」
- 你不推荐具体药物、不给剂量
- 你不替代医生，你的产出是「给医生看的信息」

【任务】
只能做两件事之一，且必须输出 JSON：

任务 A · 抽取（当输入是一句口语描述时）
{"task":"extract","chief":"一句话主诉，不超过 25 字","duration":"病程，没有就留空","redflag_hint":"是否提到胸痛/呼吸困难/意识改变/出血/自伤，有就填词，没有留空"}

任务 B · 润色（当输入是结构化信息、要求写成建议时）
{"task":"polish","advice":"两句话，第一句说明更像哪一类问题（用『更像…的表现』而不是『就是…』），第二句给一个可执行的动作"}

【硬约束】
1. 只输出 JSON，不要任何解释、不要 markdown 代码块
2. 不得出现「确诊」「就是」「一定」这类确定性表述
3. 不得出现药名 + 剂量
4. 信息不足时留空字符串，禁止编造
"""


def _post_json(url: str, payload: dict, headers: dict, timeout: float) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    for k, v in headers.items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
        return json.loads(resp.read().decode("utf-8"))


# ---------------------------------------------------------------- Provider
class BaseProvider:
    name = "base"

    def chat(self, system: str, user: str, timeout: float) -> str:
        raise NotImplementedError


class MockProvider(BaseProvider):
    """永不失败的本地实现。演示默认用它。"""
    name = "mock"

    def chat(self, system: str, user: str, timeout: float) -> str:
        return ""


class OpenAICompatProvider(BaseProvider):
    name = "openai_compat"

    def __init__(self) -> None:
        self.base = config.LLM_BASE_URL.rstrip("/")
        self.key = config.LLM_API_KEY
        self.model = config.LLM_MODEL

    def chat(self, system: str, user: str, timeout: float) -> str:
        if not self.key:
            raise RuntimeError("LLM_API_KEY 未配置")
        payload = {
            "model": self.model,
            "temperature": 0.2,
            "max_tokens": 400,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "response_format": {"type": "json_object"},
        }
        resp = _post_json(f"{self.base}/chat/completions", payload,
                          {"Authorization": f"Bearer {self.key}"}, timeout)
        return resp["choices"][0]["message"]["content"]


# ---------------------------------------------------------------- 熔断
class CircuitBreaker:
    def __init__(self, max_fails: int = 3, cooldown: float = 60.0) -> None:
        self.max_fails = max_fails
        self.cooldown = cooldown
        self.fails = 0
        self.opened_at = 0.0
        self._lock = threading.Lock()

    @property
    def is_open(self) -> bool:
        with self._lock:
            if self.fails < self.max_fails:
                return False
            if time.time() - self.opened_at > self.cooldown:
                self.fails = 0   # 半开：允许再试一次
                audit.log_event("llm_breaker_half_open")
                return False
            return True

    def record(self, ok: bool) -> None:
        with self._lock:
            if ok:
                self.fails = 0
            else:
                self.fails += 1
                if self.fails == self.max_fails:
                    self.opened_at = time.time()
                    audit.log_event("llm_breaker_open", fails=self.fails)


# ---------------------------------------------------------------- 客户端
@dataclass
class LLMResult:
    ok: bool
    data: Optional[dict] = None
    degraded: bool = True
    reason: str = ""
    took_ms: float = 0.0
    provider: str = "mock"


class LLMClient:
    def __init__(self) -> None:
        self.provider: BaseProvider = (
            OpenAICompatProvider() if config.LLM_PROVIDER == "openai_compat" else MockProvider()
        )
        self.breaker = CircuitBreaker(config.LLM_MAX_FAILS)
        self.stats = {"calls": 0, "fails": 0, "degraded": 0}

    # ------------------------------------------------------------ 底层
    def _call(self, user: str) -> LLMResult:
        if isinstance(self.provider, MockProvider):
            return LLMResult(ok=False, degraded=True, reason="mock_provider",
                             provider="mock")
        if self.breaker.is_open:
            return LLMResult(ok=False, degraded=True, reason="circuit_open",
                             provider=self.provider.name)

        t0 = time.time()
        last_err = ""
        for attempt in range(config.LLM_RETRIES + 1):
            try:
                raw = self.provider.chat(SYSTEM_PROMPT, user, config.LLM_TIMEOUT)
                took = (time.time() - t0) * 1000
                self.stats["calls"] += 1
                data = self._parse(raw)
                if data is None:
                    raise ValueError("返回不是合法 JSON")
                self.breaker.record(True)
                return LLMResult(ok=True, data=data, degraded=False,
                                 took_ms=took, provider=self.provider.name)
            except Exception as e:  # noqa: BLE001
                last_err = f"{type(e).__name__}: {e}"
                self.breaker.record(False)
                # 超时和 5xx 才重试；参数错误重试也没用
                if isinstance(e, urllib.error.HTTPError) and 400 <= e.code < 500:
                    break
                if attempt < config.LLM_RETRIES:
                    time.sleep(0.2 * (attempt + 1))

        self.stats["fails"] += 1
        self.stats["degraded"] += 1
        audit.log_event("llm_degraded", err=last_err, provider=self.provider.name)
        return LLMResult(ok=False, degraded=True, reason=last_err,
                         took_ms=(time.time() - t0) * 1000,
                         provider=self.provider.name)

    @staticmethod
    def _parse(raw: str) -> Optional[dict]:
        if not raw:
            return None
        s = raw.strip()
        if s.startswith("```"):
            s = s.strip("`")
            s = s.split("\n", 1)[-1] if "\n" in s else s
        try:
            data = json.loads(s)
        except json.JSONDecodeError:
            i, j = s.find("{"), s.rfind("}")
            if i < 0 or j <= i:
                return None
            try:
                data = json.loads(s[i:j + 1])
            except json.JSONDecodeError:
                return None
        return data if isinstance(data, dict) else None

    # ------------------------------------------------------------ 业务接口
    def extract(self, text: str) -> dict:
        """抽取主诉。失败时用原文兜底，调用方永远拿到可用结果。"""
        res = self._call(f'任务 A。用户原话：{text}\n只输出 JSON。')
        fallback = {"task": "extract", "chief": text[:40], "duration": "",
                    "redflag_hint": ""}
        if not res.ok or not res.data:
            # mock 是预期配置，不算「降级」；只有真的调用失败才算
            return {"result": fallback, "degraded": res.reason != "mock_provider",
                    "mode": "template", "reason": res.reason}

        chief = str(res.data.get("chief") or "").strip()
        clean, hits = scrub_output(chief)   # 抽取结果也要过一遍越界拦截
        return {
            "result": {
                "task": "extract",
                "chief": clean[:40] or text[:40],
                "duration": str(res.data.get("duration") or ""),
                "redflag_hint": str(res.data.get("redflag_hint") or ""),
            },
            "degraded": False,
            "scrubbed": hits,
            "took_ms": res.took_ms,
        }

    def polish(self, advice_template: str, context: dict) -> dict:
        """
        润色建议文案。
        没有模型时直接返回模板 —— 注意模板本身已经是能用的完整句子，
        不是占位符，所以降级后体验不会塌。
        """
        if not advice_template:
            return {"advice": "", "degraded": True}
        payload = {
            "chief": context.get("chief", ""),
            "level": context.get("level", ""),
            "slots": context.get("slots", {}),
            "draft": advice_template,
        }
        res = self._call("任务 B。结构化信息：" + json.dumps(payload, ensure_ascii=False)
                         + "\n只输出 JSON。")
        if not res.ok or not res.data:
            return {"advice": advice_template,
                    "degraded": res.reason != "mock_provider",
                    "mode": "template", "reason": res.reason}

        text = str(res.data.get("advice") or "").strip()
        if not text:
            return {"advice": advice_template, "degraded": True, "mode": "template"}
        clean, hits = scrub_output(text)
        # 润色后如果没有免责语，补上（模型很爱漏这句）
        if "不替代" not in clean and "仅供参考" not in clean:
            clean = clean + "（这不是诊断结论，只是就诊方向参考。）"
        return {"advice": clean, "degraded": False, "scrubbed": hits,
                "took_ms": res.took_ms}

    def health(self) -> dict:
        return {
            "provider": self.provider.name,
            "model": config.LLM_MODEL if self.provider.name != "mock" else "mock",
            "breaker_open": self.breaker.is_open,
            "stats": self.stats,
            "degraded_mode": isinstance(self.provider, MockProvider) or self.breaker.is_open,
        }


client = LLMClient()
