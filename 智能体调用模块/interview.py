"""Independent pre-consultation interview orchestration."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from uuid import uuid4

from deepseek_client import DeepSeekClient


QUESTIONS = {
    "onset": "这次不适是从什么时候开始的？",
    "duration": "这种不适持续了多久？",
    "location": "主要是身体哪个部位不舒服？",
    "severity": "现在的不适有多严重？是否影响正常活动？",
    "accompanying": "还有其他同时出现的不适吗？例如发热、呕吐或呼吸不畅？",
    "history": "以前出现过类似情况吗？有需要告诉医生的既往病史吗？",
    "medication": "这次不适后用过什么药吗？不记得也可以说不清楚。",
}
ORDER = tuple(QUESTIONS)
UNSURE = {"不知道", "不清楚", "记不清", "说不清", "不确定"}
EXTRACTION_PROMPT = (
    "你是就医前信息整理助手。只从本轮用户原话抽取信息，不诊断、不判断风险、不建议用药。"
    "必须输出 JSON，格式为 {\"fields\":[{\"slot\":\"duration\","
    "\"value\":\"两天\",\"status\":\"known\",\"evidence\":\"两天\"}]}。"
    "slot 仅能是 onset、duration、location、severity、history、medication。"
    "status 仅能是 known、unknown。evidence 必须逐字出现在本轮原话中；"
    "known 的 value 也必须逐字出现在 evidence 中。没有证据则不要输出字段。"
    "不抽取 accompanying，该字段须明确追问。"
)
REPHRASE_PROMPT = (
    "只改写给定的一个问题，让学生容易理解。不得增加第二个问题、诊断或建议。"
    "输出 JSON：{\"question\":\"改写后的问题\"}。"
)


def urgent_signal(text: str) -> str | None:
    """Conservative demo gate; rule set must be reviewed before deployment."""
    segments = re.split(r"[，。；,.;！!？?]|但是|不过|可是|但|却", text)
    chest = sweat = False
    for segment in segments:
        if re.search(r"没有|并无|不是|不再", segment):
            continue
        if re.search(r"不想活|想自杀|想结束生命|要自残", segment):
            return "自伤或自杀相关表达"
        if re.search(r"喘不上气|呼吸困难|无法呼吸", segment):
            return "呼吸困难相关表达"
        chest = chest or bool(re.search(r"胸(?:口|部)?(?:痛|疼|闷|压)|胸口压着疼", segment))
        sweat = sweat or bool(re.search(r"冷汗|大汗|出汗", segment))
    if chest and sweat:
        return "胸部不适伴出汗"
    return None


def validated_fields(raw: dict, text: str) -> dict[str, dict]:
    result: dict[str, dict] = {}
    items = raw.get("fields")
    if not isinstance(items, list):
        return result
    for item in items[:10]:
        if not isinstance(item, dict):
            continue
        slot, value = item.get("slot"), item.get("value")
        evidence, status = item.get("evidence"), item.get("status")
        if (slot not in ORDER or slot == "accompanying" or slot in result or
                not isinstance(value, str) or not isinstance(evidence, str) or
                status not in ("known", "unknown") or not evidence or
                evidence not in text or len(value) > 80 or
                (status == "known" and value not in evidence)):
            continue
        result[slot] = {"value": value if status == "known" else "不清楚",
                        "status": status, "evidence": evidence}
    return result


@dataclass
class Session:
    id: str = field(default_factory=lambda: "s_" + uuid4().hex)
    chief: str = ""
    answers: dict[str, dict] = field(default_factory=dict)
    pending: str | None = None
    turns: int = 0
    status: str = "active"


class InterviewEngine:
    def __init__(self, client: DeepSeekClient | None = None, max_turns: int = 9):
        self.client = client or DeepSeekClient()
        self.max_turns = max_turns

    def turn(self, session: Session, text: str) -> dict:
        text = text.strip()
        if session.status != "active":
            raise ValueError("session is closed")
        if not text or len(text) > 500:
            raise ValueError("text must contain 1 to 500 characters")
        session.turns += 1
        if not session.chief:
            session.chief = text[:200]

        signal = urgent_signal(text)
        if signal:
            session.status = "interrupted"
            session.pending = None
            return {"session_id": session.id, "action": "interrupt",
                    "reason": signal,
                    "message": "当前描述可能需要紧急帮助，请停止线上问答并立即寻求线下医疗帮助；紧急情况拨打 120。",
                    "summary": self.summary(session)}

        degraded = not self.client.available
        if self.client.available:
            try:
                extracted = validated_fields(
                    self.client.json_response(EXTRACTION_PROMPT, "用户本轮原话：" + text), text)
            except RuntimeError:
                extracted, degraded = {}, True
        else:
            extracted = {}
        for slot, item in extracted.items():
            if slot not in session.answers:
                session.answers[slot] = item

        if session.pending and session.pending not in session.answers:
            status = "unknown" if text in UNSURE else "known"
            session.answers[session.pending] = {
                "value": "不清楚" if status == "unknown" else text,
                "status": status, "evidence": text}

        missing = next((slot for slot in ORDER if slot not in session.answers), None)
        if missing is None or session.turns >= self.max_turns:
            session.status = "completed"
            session.pending = None
            return {"session_id": session.id, "action": "result",
                    "summary": self.summary(session), "degraded": degraded}

        session.pending = missing
        question = QUESTIONS[missing]
        if self.client.available:
            try:
                phrased = self.client.json_response(REPHRASE_PROMPT,
                    "目标字段：" + missing + "\n原问题：" + question, max_tokens=120).get("question")
                if (isinstance(phrased, str) and 5 <= len(phrased) <= 80 and
                        phrased.count("？") + phrased.count("?") == 1 and
                        not any(word in phrased for word in ("确诊", "药", "治疗", "校医院"))):
                    question = phrased
            except RuntimeError:
                degraded = True
        return {"session_id": session.id, "action": "ask",
                "question": {"slot": missing, "text": question},
                "progress": {"answered": len(session.answers), "total": len(ORDER)},
                "degraded": degraded}

    @staticmethod
    def summary(session: Session) -> dict:
        return {"chief": session.chief,
                "fields": {slot: session.answers.get(slot, {"value": "未采集", "status": "not_asked"})
                           for slot in ORDER},
                "note": "仅整理本人提供的信息，不构成诊断；未触发已配置规则不能排除其他风险。"}
