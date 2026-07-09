import unittest

from server import CityInfo, PlanRequest
from planner.prompting import (
    build_destination_detail,
    build_itinerary_prompt,
    build_transport_rules,
    load_itinerary_prompt_template,
    render_prompt,
)


class PromptingTests(unittest.TestCase):
    def test_prompt_template_is_external_and_contains_required_placeholders(self):
        template = load_itinerary_prompt_template()

        self.assertIn("[WEATHER_INFO]", template)
        self.assertIn("[TRANSPORT_RULES]", template)
        self.assertIn("[POI_LIST]", template)

    def test_render_prompt_does_not_replace_placeholders_inside_inserted_values(self):
        template = "天气：[WEATHER_INFO]\n天数：[DAYS]"

        result = render_prompt(template, {"WEATHER_INFO": "用户文本 [DAYS]", "DAYS": "3"})

        self.assertIn("天气：用户文本 [DAYS]", result)
        self.assertIn("天数：3", result)

    def test_build_destination_detail_returns_city_rows_and_route(self):
        detail, route = build_destination_detail([
            CityInfo(name="北京", days=2),
            CityInfo(name="西安", days=1),
        ])

        self.assertIn("- 北京（规划 2 天）", detail)
        self.assertEqual(route, "北京 -> 西安")

    def test_build_transport_rules_prioritizes_segment_transport(self):
        rules = build_transport_rules(
            [
                CityInfo(name="北京", days=1),
                CityInfo(name="西安", days=1, transport="train"),
            ],
            "plane",
        )

        self.assertIn("飞机优先", rules)
        self.assertIn("必须使用【高铁】", rules)

    def test_build_itinerary_prompt_replaces_template_and_returns_all_pois(self):
        pois = [{"name": "故宫博物院", "type": "风景名胜", "rating": "4.8", "address": "北京"}]
        request = PlanRequest(
            destinations=[CityInfo(name="北京", days=1), CityInfo(name="西安", days=1, transport="train")],
            days=2,
            departure="上海",
            pace="轻松",
            budget="经济型",
            interests="博物馆 [DAYS]",
            city_data=[{"city": "北京", "pois": pois, "center": {"lat": 39.9, "lng": 116.4}, "days": 1}],
            global_transport="auto",
            start_date="2026-07-10",
        )

        prompt, all_pois = build_itinerary_prompt(request, {"北京": [{"date": "2026-07-10", "dayweather": "晴"}]})

        self.assertEqual(all_pois, pois)
        self.assertIn("出发地：上海", prompt)
        self.assertIn("故宫博物院", prompt)
        self.assertIn("2026-07-10", prompt)
        self.assertIn("博物馆 [DAYS]", prompt)
        self.assertNotIn("[POI_LIST]", prompt)


if __name__ == "__main__":
    unittest.main()
