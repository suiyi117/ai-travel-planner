import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from planner.scheduling import parse_time_range, reconcile_itinerary_schedule
from planner.transport import (
    build_quality_checks,
    enrich_transport_guide,
    segment_departure_offsets,
)


def city(name: str, days: int, *, plan_stay: bool = True):
    return SimpleNamespace(name=name, days=days, plan_stay=plan_stay)


class SegmentDepartureOffsetTests(unittest.TestCase):
    def test_offsets_leave_after_stay_days_and_keep_zero_day_transit_on_same_date(self):
        destinations = [
            city("北京", 0, plan_stay=False),
            city("郑州", 0, plan_stay=False),
            city("西安", 2),
            city("成都", 2),
        ]
        guide = [
            {"segment": "北京 → 郑州", "from_city": "北京", "to_city": "郑州"},
            {"segment": "郑州 → 西安", "from_city": "郑州", "to_city": "西安"},
            {"segment": "西安 → 成都", "from_city": "西安", "to_city": "成都"},
            {"segment": "成都 → 北京", "from_city": "成都", "to_city": "北京"},
        ]

        self.assertEqual(segment_departure_offsets(destinations, guide), [0, 0, 2, 3])

    def test_offset_includes_departure_city_stay(self):
        destinations = [city("北京", 2), city("西安", 2)]
        guide = [{"segment": "北京 → 西安", "from_city": "北京", "to_city": "西安"}]

        self.assertEqual(segment_departure_offsets(destinations, guide), [2])

    def test_terminal_zero_day_hop_stays_on_final_play_day(self):
        destinations = [
            city("西安", 2),
            city("咸阳机场", 0, plan_stay=False),
        ]
        guide = [
            {
                "segment": "西安 → 咸阳机场",
                "from_city": "西安",
                "to_city": "咸阳机场",
            }
        ]

        self.assertEqual(segment_departure_offsets(destinations, guide), [1])

    def test_transport_enrichment_queries_each_leg_on_its_actual_travel_date(self):
        destinations = [
            city("北京", 2),
            city("西安", 1),
            city("成都", 2),
        ]
        guide = [
            {"segment": "北京 → 西安", "from_city": "北京", "to_city": "西安"},
            {"segment": "西安 → 成都", "from_city": "西安", "to_city": "成都"},
            {"segment": "成都 → 北京", "from_city": "成都", "to_city": "北京"},
        ]

        async_mock = AsyncMock(
            side_effect=lambda segment, date, _budget, **_kwargs: {
                **segment,
                "travel_date": date,
            }
        )
        with patch("planner.transport.enrich_one_segment", async_mock):
            result = asyncio.run(
                enrich_transport_guide(guide, destinations, "2026-08-01")
            )

        self.assertEqual(
            [segment["travel_date"] for segment in result],
            ["2026-08-03", "2026-08-04", "2026-08-05"],
        )


class SchedulingTests(unittest.TestCase):
    def assert_day_has_no_overlaps(self, day):
        blocks = []
        for transfer in day.get("transfers") or []:
            parsed = parse_time_range(transfer.get("time", ""))
            if parsed:
                blocks.append((*parsed, transfer.get("segment") or "transport"))
        lunch = parse_time_range(day.get("lunch_time", ""))
        if lunch:
            blocks.append((*lunch, "lunch"))
        for spot in [*(day.get("morning") or []), *(day.get("afternoon") or [])]:
            parsed = parse_time_range(spot.get("time", ""))
            if parsed:
                blocks.append((*parsed, spot.get("name") or "spot"))
        blocks.sort(key=lambda block: block[0])
        for previous, current in zip(blocks, blocks[1:]):
            self.assertLessEqual(
                previous[1],
                current[0],
                f"{previous[2]} overlaps {current[2]}",
            )

    def test_time_parser_preserves_overnight_arrival(self):
        self.assertEqual(parse_time_range("23:30 - 次日 06:15"), (1410, 1815))

    def test_transport_is_expanded_to_door_to_door_and_spots_are_rescheduled(self):
        itinerary = {
            "days": [
                {
                    "day": 1,
                    "city": "西安",
                    "morning": [
                        {
                            "name": "陕西历史博物馆",
                            "duration_minutes": 150,
                            "lat": 34.225,
                            "lng": 108.953,
                            "opentime": "08:30-18:00",
                        },
                        {
                            "name": "大雁塔",
                            "duration_minutes": 120,
                            "lat": 34.218,
                            "lng": 108.964,
                            "opentime": "08:30-18:00",
                        },
                    ],
                    "afternoon": [
                        {
                            "name": "西安城墙",
                            "duration_minutes": 120,
                            "lat": 34.258,
                            "lng": 108.946,
                            "opentime": "08:00-22:00",
                        }
                    ],
                    "food": ["面"],
                },
                {
                    "day": 2,
                    "city": "西安",
                    "morning": [
                        {
                            "name": "钟楼",
                            "duration_minutes": 90,
                            "lat": 34.261,
                            "lng": 108.942,
                            "opentime": "08:30-21:30",
                        }
                    ],
                    "afternoon": [],
                },
            ],
            "transport_guide": [
                {
                    "segment": "北京 → 西安",
                    "from_city": "北京",
                    "to_city": "西安",
                    "tool": "train",
                    "options": [
                        {"id": "G1", "time": "09:30 - 13:54", "duration": "4小时24分钟"},
                        {"id": "G2", "time": "07:00 - 11:30", "duration": "4小时30分钟"},
                    ],
                }
            ],
        }

        result = reconcile_itinerary_schedule(
            itinerary,
            destinations=[
                city("北京", 0, plan_stay=False),
                city("西安", 2),
            ],
            start_date="2026-08-01",
            pace="适中均衡",
        )

        segment = result["transport_guide"][0]
        first_day = result["days"][0]
        self.assertEqual(segment["recommended_option_id"], "G1")
        self.assertEqual(segment["door_to_door_time"], "08:10 - 14:54")
        self.assertEqual(first_day["transfers"][0]["time"], "08:10 - 14:54")
        self.assertEqual(first_day["date"], "2026-08-01")
        self.assertTrue(first_day["lunch_time"].startswith("14:54"))

        scheduled_spots = first_day["morning"] + first_day["afternoon"]
        self.assertTrue(scheduled_spots)
        for spot in scheduled_spots:
            spot_range = parse_time_range(spot["time"])
            self.assertIsNotNone(spot_range)
            self.assertGreaterEqual(spot_range[0], 14 * 60 + 54)
        self.assertTrue(first_day["alternatives"])
        self.assertGreaterEqual(
            result["days"][1]["morning"][0]["transfer_from_previous"]["minutes"],
            0,
        )

    def test_closed_attraction_becomes_an_explicit_alternative(self):
        itinerary = {
            "days": [
                {
                    "day": 1,
                    "city": "北京",
                    "morning": [
                        {
                            "name": "周一闭馆博物馆",
                            "duration_minutes": 120,
                            "opentime": "周一闭馆；08:30-17:00",
                        }
                    ],
                    "afternoon": [],
                }
            ],
            "transport_guide": [],
        }

        result = reconcile_itinerary_schedule(
            itinerary,
            destinations=[city("北京", 1)],
            start_date="2026-08-03",
        )

        day = result["days"][0]
        self.assertEqual(day["morning"], [])
        self.assertEqual(day["afternoon"], [])
        self.assertEqual(day["alternatives"][0]["name"], "周一闭馆博物馆")
        self.assertIn("闭馆", day["alternatives"][0]["schedule_reason"])
        checks = build_quality_checks(result)
        self.assertEqual(checks["status"], "review")
        self.assertTrue(any("降为备选" in item["message"] for item in checks["items"]))

    def test_plane_schedule_keeps_meal_and_attractions_after_airport_transfer(self):
        itinerary = {
            "days": [
                {
                    "day": 1,
                    "city": "成都",
                    "morning": [
                        {"name": "桂溪生态公园", "duration_minutes": 120},
                    ],
                    "afternoon": [
                        {"name": "交子公园", "duration_minutes": 90},
                    ],
                }
            ],
            "transport_guide": [
                {
                    "segment": "上海 → 成都",
                    "from_city": "上海",
                    "to_city": "成都",
                    "tool": "plane",
                    "options": [
                        {
                            "id": "MU0001",
                            "time": "10:30 - 13:45",
                            "duration": "3小时15分钟",
                        }
                    ],
                }
            ],
        }

        result = reconcile_itinerary_schedule(
            itinerary,
            destinations=[
                city("上海", 0, plan_stay=False),
                city("成都", 1),
            ],
            start_date="2026-08-01",
        )

        day = result["days"][0]
        transfer = day["transfers"][0]
        self.assertEqual(transfer["time"], "08:00 - 15:30")
        self.assertGreaterEqual(parse_time_range(day["lunch_time"])[0], 15 * 60 + 30)
        for spot in day["morning"] + day["afternoon"]:
            self.assertGreaterEqual(parse_time_range(spot["time"])[0], 15 * 60 + 30)
        self.assert_day_has_no_overlaps(day)

    def test_driving_ring_keeps_last_day_clear_and_corrects_early_next_city_stay(self):
        itinerary = {
            "days": [
                {
                    "day": 1,
                    "city": "杭州",
                    "morning": [{"name": "西湖", "duration_minutes": 120}],
                    "afternoon": [],
                    "stay": "建议住在杭州西湖附近。",
                },
                {
                    "day": 2,
                    "city": "黄山",
                    "morning": [{"name": "屯溪老街", "duration_minutes": 120}],
                    "afternoon": [],
                    "stay": "建议住在黄山市区。",
                },
                {
                    "day": 3,
                    "city": "黄山",
                    "morning": [{"name": "徽州古城", "duration_minutes": 150}],
                    "afternoon": [],
                    "stay": "建议入住景德镇市区，方便次日游览。",
                },
                {
                    "day": 4,
                    "city": "景德镇",
                    "morning": [{"name": "陶瓷博物馆", "duration_minutes": 120}],
                    "afternoon": [{"name": "陶溪川", "duration_minutes": 120}],
                    "stay": "无需住宿。",
                },
            ],
            "transport_guide": [
                {
                    "segment": "杭州 → 黄山",
                    "from_city": "杭州",
                    "to_city": "黄山",
                    "tool": "driving",
                    "options": [{"id": "自驾", "time": "08:30 - 11:44", "duration": "2小时59分钟"}],
                },
                {
                    "segment": "黄山 → 景德镇",
                    "from_city": "黄山",
                    "to_city": "景德镇",
                    "tool": "driving",
                    "options": [{"id": "自驾", "time": "08:30 - 10:47", "duration": "2小时2分钟"}],
                },
                {
                    "segment": "景德镇 → 杭州",
                    "from_city": "景德镇",
                    "to_city": "杭州",
                    "tool": "driving",
                    "options": [{"id": "自驾", "time": "16:30 - 21:45", "duration": "4小时45分钟"}],
                },
            ],
        }

        result = reconcile_itinerary_schedule(
            itinerary,
            destinations=[city("杭州", 1), city("黄山", 2), city("景德镇", 1)],
            start_date="2026-08-01",
        )

        day_three = result["days"][2]
        self.assertIn("黄山", day_three["stay"])
        self.assertEqual(day_three["ai_stay"], "建议入住景德镇市区，方便次日游览。")
        self.assertTrue(
            any(
                warning["code"] == "cross_city_stay_corrected"
                for warning in result["schedule_warnings"]
            )
        )

        last_day = result["days"][-1]
        return_transfer = next(
            transfer for transfer in last_day["transfers"] if transfer["is_return"]
        )
        for spot in last_day["morning"] + last_day["afternoon"]:
            self.assertLessEqual(
                parse_time_range(spot["time"])[1],
                return_transfer["blocked_start_minutes"],
            )
        self.assert_day_has_no_overlaps(last_day)

    def test_round_trip_return_keeps_attractions_before_door_to_door_block(self):
        itinerary = {
            "days": [
                {
                    "day": 1,
                    "city": "西安",
                    "morning": [{"name": "城墙", "duration_minutes": 120}],
                    "afternoon": [],
                },
                {
                    "day": 2,
                    "city": "西安",
                    "morning": [{"name": "博物馆", "duration_minutes": 120}],
                    "afternoon": [{"name": "大雁塔", "duration_minutes": 120}],
                },
            ],
            "transport_guide": [
                {
                    "segment": "北京 → 西安",
                    "from_city": "北京",
                    "to_city": "西安",
                    "tool": "train",
                    "options": [{"id": "G1", "time": "07:30 - 11:30", "duration": "4小时"}],
                },
                {
                    "segment": "西安 → 北京",
                    "from_city": "西安",
                    "to_city": "北京",
                    "tool": "train",
                    "options": [
                        {"id": "G2", "time": "17:30 - 21:30", "duration": "4小时"},
                        {"id": "G3", "time": "12:00 - 16:00", "duration": "4小时"},
                    ],
                },
            ],
        }

        result = reconcile_itinerary_schedule(
            itinerary,
            destinations=[
                city("北京", 0, plan_stay=False),
                city("西安", 2),
            ],
            start_date="2026-08-01",
        )

        last_day = result["days"][-1]
        return_transfer = last_day["transfers"][0]
        self.assertTrue(return_transfer["is_return"])
        for spot in last_day["morning"] + last_day["afternoon"]:
            self.assertLessEqual(
                parse_time_range(spot["time"])[1],
                return_transfer["blocked_start_minutes"],
            )


if __name__ == "__main__":
    unittest.main()
