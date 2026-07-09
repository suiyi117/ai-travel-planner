import asyncio
import unittest

from server import _enrich_one_segment


class TransportQualityTests(unittest.TestCase):
    def test_plane_ai_fallback_is_not_labeled_realtime(self):
        segment = {
            "segment": "西安 → 成都",
            "from_city": "西安",
            "to_city": "成都",
            "tool": "plane",
            "advice": "建议选择傍晚航班。",
            "options": [
                {
                    "id": "CA4201",
                    "time": "18:00 - 19:30",
                    "duration": "1小时30分钟",
                    "price": "650元",
                    "desc": "AI 备选航班",
                }
            ],
        }

        result = asyncio.run(_enrich_one_segment(segment, "2026-07-12", "舒适型"))

        self.assertEqual(result["data_source"], "ai_fallback")
        self.assertEqual(result["source_label"], "AI 预估，需确认")


if __name__ == "__main__":
    unittest.main()
