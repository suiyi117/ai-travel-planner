import unittest

from server import CityInfo
from planner.itinerary import (
    hydrate_itinerary,
    parse_ai_itinerary_content,
    repair_truncated_json,
    strip_markdown_code_block,
)


class AiItineraryParsingTests(unittest.TestCase):
    def test_strip_markdown_code_block_removes_fences(self):
        content = '```json\n{"title": "测试"}\n```'

        self.assertEqual(strip_markdown_code_block(content), '{"title": "测试"}')

    def test_parse_ai_itinerary_content_extracts_json_from_surrounding_text(self):
        content = '说明文字 {"title": "测试", "days": []} 结尾'

        result = parse_ai_itinerary_content(content)

        self.assertEqual(result["title"], "测试")
        self.assertEqual(result["days"], [])

    def test_repair_truncated_json_returns_last_valid_object_shape(self):
        content = '{"title":"测试","days":[{"day":1,"morning":[{"name":"故宫"}]}],"tips":['

        result = repair_truncated_json(content)

        self.assertEqual(result["title"], "测试")
        self.assertEqual(result["days"][0]["morning"][0]["name"], "故宫")


class ItineraryHydrationTests(unittest.TestCase):
    def test_hydrate_itinerary_adds_poi_metadata_centers_weather_and_transport(self):
        itinerary = {
            "title": "北京西安",
            "days": [
                {
                    "day": 1,
                    "city": "北京",
                    "morning": [{"name": "故宫博物院"}],
                    "afternoon": [],
                }
            ],
            "transport_guide": [{"tool": "train", "options": [{"id": "G1"}]}],
        }
        all_pois = [
            {
                "name": "故宫博物院",
                "lat": 39.9163,
                "lng": 116.3972,
                "rating": "4.8",
                "address": "北京市东城区",
                "tel": "010",
                "opentime": "08:30-17:00",
            }
        ]
        city_data = [{"city": "北京", "center": {"lat": 39.9, "lng": 116.4}, "pois": all_pois}]
        city_weather = {"北京": [{"date": "2026-07-10", "dayweather": "晴"}]}
        destinations = [CityInfo(name="北京", days=1), CityInfo(name="西安", days=1, transport="train")]

        result = hydrate_itinerary(
            itinerary,
            all_pois=all_pois,
            city_data=city_data,
            city_weather=city_weather,
            destinations=destinations,
            global_transport="auto",
        )

        spot = result["days"][0]["morning"][0]
        self.assertEqual(spot["rating"], "4.8")
        self.assertEqual(result["city_centers"]["北京"], {"lat": 39.9, "lng": 116.4})
        self.assertEqual(result["city_weather"], city_weather)
        self.assertEqual(result["pois"], all_pois)
        self.assertEqual(result["transport_guide"][0]["segment"], "北京 → 西安")
        self.assertEqual(result["quality_checks"]["status"], "pass")


if __name__ == "__main__":
    unittest.main()
