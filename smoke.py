#!/usr/bin/env python3
"""
端到端冒烟测试。

跑法（服务已启动的前提下）：
    python3 tests/smoke.py

覆盖四条链路：
1. 低风险：主诉 → 6 轮追问 → 三段式结果 → 档案落库
2. 高危：胸痛 + 冷汗 → 立即中断，跳过全部追问
3. 否定识别：「我没有胸口疼」不能误报
4. 危机：自伤意念 → 走专门的危机通道，不是普通高危

这四条就是答辩现场会演示的四条。测试和演示用同一套断言，
意思是：只要测试绿了，演示就不会翻车。
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000/api/v1"
PASS, FAIL = "\033[32m✓\033[0m", "\033[31m✗\033[0m"
results: list[tuple[bool, str]] = []


def call(method: str, path: str, body: dict | None = None, token: str = "") -> dict:
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode())


def check(cond: bool, label: str, extra: str = "") -> None:
    results.append((cond, label))
    print(f"  {PASS if cond else FAIL} {label}" + (f"  → {extra}" if extra else ""))


def login(open_id: str, role: str = "student") -> str:
    r = call("POST", "/auth/login", {"open_id": open_id, "nickname": "测试", "role": role})
    return r["data"]["token"]


def new_session(token: str, chief: str = "") -> str:
    r = call("POST", "/sessions", {"chief": chief} if chief else {}, token)
    return r["data"]["session_id"]


def say(token: str, sid: str, **kw) -> dict:
    return call("POST", f"/sessions/{sid}/messages", kw, token)["data"]


# ---------------------------------------------------------------- 场景一：低风险全流程
def scene_low_risk() -> None:
    print("\n[1] 低风险完整问诊")
    token = login("2021001")
    sid = new_session(token)

    d = say(token, sid, text="最近熬夜之后一直头疼，还有点恶心")
    check(d["action"] == "ask", "首句后进入追问", d.get("state"))
    check(d["risk"] is None, "未误报为高危")
    q = d["question"]
    check(q is not None and q["slot"] == "duration", "第一个问题问病程",
          q["slot"] if q else "无")
    check(len(q["options"]) >= 3, "追问给的是选项而不是开放题",
          f"{len(q['options'])} 个选项")
    # 用户已经说了「熬夜」，诱因不该再问
    asked = [q["slot"]]
    rounds = 0

    answers = ["1–3 天", "整个头涨", "连续熬夜，每天不到 5 小时",
               "无伴随症状", "没有", "没吃药"]
    while d["action"] == "ask" and rounds < 10:
        slot = d["question"]["slot"]
        asked.append(slot)
        val = {"duration": "1–3 天", "character": "整个头涨",
               "trigger": "连续熬夜，每天不到 5 小时", "accompany": "无伴随症状",
               "history": "没有", "medication": "没吃药"}.get(slot, "说不太清")
        d = say(token, sid, slot=slot, value=val)
        rounds += 1

    check(d["action"] == "result", "槽位填满后出结果", f"{rounds} 轮")
    check("trigger" not in asked, "用户已说过的诱因没有重复追问")

    res = d.get("result") or {}
    check(res.get("risk_level") == "low", "判定为低风险", res.get("risk_level", ""))
    check(len(res.get("sections", [])) == 3, "结果页三段式", str(len(res.get("sections", []))))
    order = [s["title"] for s in res.get("sections", [])]
    check(order[0].startswith("AI 建议") and "摘要" in order[1] and "就医" in order[2],
          "顺序固定：建议 → 摘要 → 就医指引", " / ".join(order))

    rows = res["sections"][1]["rows"]
    check(len(rows) == 7, "摘要 7 行（主诉到用药史）", str(len(rows)))
    check(all(r["v"] for r in rows), "摘要无空值（未采集写不详）")
    check("不替代医师诊断" in res.get("disclaimer", ""), "免责声明随结果返回")
    check(len(res.get("sources", [])) >= 1, "带知识来源与更新时间",
          res["sources"][0]["title"] if res.get("sources") else "无")

    r = call("GET", "/users/me/records", None, token)["data"]["records"]
    check(len(r) >= 1, "结果已写入健康档案", f"{len(r)} 条")

    s = call("GET", f"/sessions/{sid}", None, token)["data"]
    check(s["status"] == "completed", "会话状态置为 completed")
    check(len(s["messages"]) >= 8, "对话消息完整留痕", f"{len(s['messages'])} 条")


# ---------------------------------------------------------------- 场景二：高危打断
def scene_high_risk() -> None:
    print("\n[2] 高危打断（胸痛 + 冷汗）")
    token = login("2021002")
    sid = new_session(token)
    d = say(token, sid, text="胸口压着疼，出了一身汗")

    check(d["action"] == "interrupt", "立即中断，不再追问", d.get("action", ""))
    check(d["question"] is None, "不返回任何追问")
    risk = d.get("risk") or {}
    check(risk.get("level") == "high", "风险等级 high")
    check(risk.get("rule_id") == "HR-CARD-01", "命中胸痛规则", risk.get("rule_id", ""))
    res = d.get("result") or {}
    check(res.get("risk_level") == "high", "结果页为高危版")
    check("急诊" in res["sections"][2]["rows"][0]["v"], "就医指引指向急诊",
          res["sections"][2]["rows"][0]["v"])

    s = call("GET", f"/sessions/{sid}", None, token)["data"]
    check(s["status"] in ("interrupted", "completed"), "会话标记为已中断", s["status"])


# ---------------------------------------------------------------- 场景三：否定识别
def scene_negation() -> None:
    print("\n[3] 否定识别（不能把「没有胸痛」当胸痛）")
    token = login("2021003")
    sid = new_session(token)
    d = say(token, sid, text="我没有胸口疼，就是有点咳嗽嗓子疼")
    check(d["action"] == "ask", "否定句不触发打断", d.get("action", ""))
    check(d.get("risk") is None, "未误报高危")

    r = call("POST", "/admin/risk-rules/test",
             {"text": "胸口不疼，但是喘不上气"}, login("9001", "admin"))["data"]
    check((r.get("final") or {}).get("rule_id") == "HR-RESP-01",
          "分句否定：前半否定不影响后半", (r.get("final") or {}).get("rule_id", "无"))


# ---------------------------------------------------------------- 场景四：心理危机
def scene_crisis() -> None:
    print("\n[4] 心理危机通道")
    token = login("2021004")
    sid = new_session(token)
    d = say(token, sid, text="最近真的不想活了，觉得没意思")
    risk = d.get("risk") or {}
    check(d["action"] == "interrupt", "立即中断")
    check(risk.get("rule_id") == "HR-PSY-01", "走危机规则而非普通高危",
          risk.get("rule_id", ""))
    res = d.get("result") or {}
    check(res.get("meta", {}).get("dept_code") == "COUNSELING", "指向心理中心",
          res.get("meta", {}).get("dept_code", ""))
    rows = " ".join(r["v"] for r in res["sections"][2]["rows"])
    check("12356" in rows or "热线" in rows, "给出可用的求助渠道")


# ---------------------------------------------------------------- 接口自身
def scene_api() -> None:
    print("\n[5] 接口健壮性")
    token = login("2021005")

    r = call("GET", "/sessions/not_exist", None, token)
    check(r["code"] == "SESSION_NOT_FOUND", "不存在的会话返回业务错误码", r["code"])

    r = call("GET", "/sessions/not_exist")
    check(r["code"] == "UNAUTHORIZED", "无令牌被拦截", r["code"])

    sid = new_session(token)
    r = call("POST", f"/sessions/{sid}/messages", {"slot": "not_a_slot", "value": "x"}, token)
    check(r["code"] == "INVALID_PARAM", "非法槽位被拒绝", r["code"])

    r = call("POST", f"/sessions/{sid}/messages", {}, token)
    check(r["code"] == "INVALID_PARAM", "空消息被拒绝", r["code"])

    r = call("POST", f"/sessions/{sid}/messages", {"text": "x" * 600}, token)
    check(r["code"] == "TEXT_TOO_LONG", "超长输入被拦住", r["code"])

    r = call("POST", "/auth/login", {"open_id": "2021006", "consent": False})
    check(r["code"] == "CONSENT_REQUIRED", "未授权隐私不能登录", r["code"])

    r = call("POST", f"/sessions/{sid}/risk-alert", {"text": "现在开始喘不上气"}, token)
    check(r["data"]["triggered"] is True, "可中途主动触发预警")

    r = call("GET", "/admin/risk-rules", None, token)
    check(r["code"] == "FORBIDDEN", "普通用户看不了规则表", r["code"])

    r = call("GET", "/admin/risk-rules", None, login("9002", "admin"))["data"]
    check(len(r["rules"]) >= 10, "管理员可读取全部规则", f"{len(r['rules'])} 条")


def main() -> int:
    print("=" * 58)
    print("  校园智能预问诊 · 后端冒烟测试")
    print("=" * 58)
    try:
        h = call("GET", "/health")
        if h.get("code") != 0:
            print("服务未就绪，请先运行 python3 run.py")
            return 1
    except Exception as e:  # noqa: BLE001
        print(f"连不上服务：{e}\n请先运行 python3 run.py")
        return 1

    scene_low_risk()
    scene_high_risk()
    scene_negation()
    scene_crisis()
    scene_api()

    ok = sum(1 for c, _ in results if c)
    total = len(results)
    print("\n" + "=" * 58)
    print(f"  结果：{ok}/{total} 通过")
    if ok < total:
        print("  失败项：")
        for c, label in results:
            if not c:
                print(f"    · {label}")
    print("=" * 58)
    return 0 if ok == total else 2


if __name__ == "__main__":
    sys.exit(main())
