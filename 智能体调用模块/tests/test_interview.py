import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from interview import InterviewEngine, Session, urgent_signal, validated_fields


class FakeClient:
    available = True

    def __init__(self):
        self.calls = 0

    def json_response(self, system, user, max_tokens=500):
        self.calls += 1
        if "本轮原话" in user:
            return {"fields": [{"slot": "duration", "value": "两天",
                                "status": "known", "evidence": "两天"},
                               {"slot": "history", "value": "糖尿病",
                                "status": "known", "evidence": "两天"}]}
        return {"question": "这次不适具体是何时开始的？"}


class OfflineClient:
    available = False


class InterviewTests(unittest.TestCase):
    def test_extract_and_one_question(self):
        fake = FakeClient()
        session = Session()
        result = InterviewEngine(fake).turn(session, "头痛两天")
        self.assertEqual(result["action"], "ask")
        self.assertEqual(result["question"]["slot"], "onset")
        self.assertEqual(session.answers["duration"]["value"], "两天")
        self.assertNotIn("history", session.answers)
        self.assertEqual(fake.calls, 2)

    def test_urgent_short_circuit(self):
        fake = FakeClient()
        result = InterviewEngine(fake).turn(Session(), "胸口压着疼，还出冷汗")
        self.assertEqual(result["action"], "interrupt")
        self.assertEqual(fake.calls, 0)

    def test_unknown_answer_not_repeated(self):
        session = Session()
        agent = InterviewEngine(OfflineClient())
        first = agent.turn(session, "头痛")
        self.assertEqual(first["question"]["slot"], "onset")
        second = agent.turn(session, "不清楚")
        self.assertEqual(session.answers["onset"]["status"], "unknown")
        self.assertEqual(second["question"]["slot"], "duration")

    def test_evidence_validation(self):
        raw = {"fields": [{"slot": "history", "value": "糖尿病",
                           "status": "known", "evidence": "头痛"}]}
        self.assertEqual(validated_fields(raw, "头痛"), {})

    def test_denial_not_urgent(self):
        self.assertIsNone(urgent_signal("没有胸痛，也没有出汗"))


if __name__ == "__main__":
    unittest.main()
