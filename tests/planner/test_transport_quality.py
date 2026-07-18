import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from planner.transport import enrich_one_segment


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

        result = asyncio.run(enrich_one_segment(segment, "2026-07-12", "舒适型"))

        self.assertEqual(result["data_source"], "ai_fallback")
        self.assertEqual(result["source_label"], "AI 预估，需确认")

    def test_driving_segment_uses_amap_road_duration_when_centers_are_available(self):
        segment = {
            "segment": "西安 → 成都",
            "from_city": "西安",
            "to_city": "成都",
            "tool": "driving",
            "options": [],
        }
        route = {
            "status": "provider",
            "source": "amap",
            "totals": {"duration_seconds": 28800},
            "total_km": 710.5,
            "toll_yuan": 310,
        }

        with patch(
            "planner.transport.build_driving_route",
            AsyncMock(return_value=route),
        ):
            result = asyncio.run(
                enrich_one_segment(
                    segment,
                    "2026-08-01",
                    city_centers={
                        "西安": {"lat": 34.34, "lng": 108.94},
                        "成都": {"lat": 30.57, "lng": 104.07},
                    },
                    amap_key="amap-key",
                )
            )

        self.assertEqual(result["data_source"], "road_provider")
        self.assertEqual(result["source_label"], "高德道路参考")
        self.assertEqual(result["options"][0]["duration_minutes"], 480)
        self.assertEqual(result["options"][0]["distance_km"], 710.5)
        self.assertEqual(result["travel_date"], "2026-08-01")


if __name__ == "__main__":
    unittest.main()
