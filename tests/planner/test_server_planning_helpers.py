import unittest

from server import (
    CityInfo,
)
from planner.transport import (
    build_segments_from_destinations,
    filter_direction_options,
    nearest_neighbor_order,
    resolve_train_type_pref,
)


class TransportSegmentBuilderTests(unittest.TestCase):
    def test_builds_stable_segments_from_destinations(self):
        destinations = [
            CityInfo(name="北京", days=2),
            CityInfo(name="西安", days=1, transport="train"),
            CityInfo(name="成都", days=2),
        ]
        ai_guide = [
            {"tool": "plane", "advice": "AI 建议飞机", "options": [{"id": "CA0001"}]},
            {"tool": "train", "advice": "AI 建议高铁", "options": [{"id": "G1"}]},
            {"tool": "plane", "advice": "多余分段会被丢弃", "options": [{"id": "EXTRA"}]},
        ]

        segments = build_segments_from_destinations(destinations, "plane", ai_guide)

        self.assertEqual([s["segment"] for s in segments], ["北京 → 西安", "西安 → 成都"])
        self.assertEqual(segments[0]["from_city"], "北京")
        self.assertEqual(segments[0]["to_city"], "西安")
        self.assertEqual(segments[0]["tool"], "train")
        self.assertEqual(segments[1]["tool"], "plane")
        self.assertEqual(segments[1]["options"], [{"id": "G1"}])

    def test_round_trip_appends_return_segment(self):
        destinations = [
            CityInfo(name="淮北", days=0, plan_stay=False),
            CityInfo(name="合肥", days=2, plan_stay=True),
            CityInfo(name="武汉", days=2, plan_stay=True),
        ]
        segments = build_segments_from_destinations(
            destinations, "train", [], route_shape="round_trip"
        )
        self.assertEqual(
            [s["segment"] for s in segments],
            ["淮北 → 合肥", "合肥 → 武汉", "武汉 → 淮北"],
        )

    def test_defaults_to_ai_tool_when_global_is_auto(self):
        destinations = [CityInfo(name="北京"), CityInfo(name="西安")]
        ai_guide = [{"tool": "plane", "options": []}]

        segments = build_segments_from_destinations(destinations, "auto", ai_guide)

        self.assertEqual(segments[0]["tool"], "plane")


class TransportDirectionTests(unittest.TestCase):
    def test_filters_options_with_reversed_station_direction(self):
        options = [
            {"id": "G1", "from_station": "北京南站", "to_station": "西安北站"},
            {"id": "G2", "from_station": "西安北站", "to_station": "北京南站"},
        ]

        valid, removed_count = filter_direction_options(options, "北京", "西安", "train")

        self.assertEqual([option["id"] for option in valid], ["G1"])
        self.assertEqual(removed_count, 1)


class RouteGeometryTests(unittest.TestCase):
    def test_nearest_neighbor_keeps_missing_coordinates_at_the_end(self):
        spots = [
            {"name": "起点", "lat": 39.9, "lng": 116.4},
            {"name": "远点", "lat": 31.2, "lng": 121.5},
            {"name": "近点", "lat": 39.91, "lng": 116.41},
            {"name": "无坐标"},
        ]

        ordered = nearest_neighbor_order(spots)

        self.assertEqual([spot["name"] for spot in ordered], ["起点", "近点", "远点", "无坐标"])


class BudgetPreferenceTests(unittest.TestCase):
    def test_economy_budget_allows_slower_train_types(self):
        self.assertEqual(resolve_train_type_pref("经济型"), "GDCKTZ")
        self.assertEqual(resolve_train_type_pref("舒适型"), "GDC")


if __name__ == "__main__":
    unittest.main()
