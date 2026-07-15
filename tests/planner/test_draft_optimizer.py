import asyncio
import unittest

from planner.draft_optimizer import optimize_draft, compute_diff
from schemas.draft import TripDraft, OptimizeScope


def make_draft(**overrides) -> TripDraft:
    payload = {
        "schema_version": 2,
        "id": "trip-1",
        "revision": 3,
        "mode": "itinerary",
        "route_shape": "one_way",
        "strategy": "balanced",
        "city_stops": [{"id": "city-hz", "name": "Hangzhou", "days": 1, "plan_stay": True}],
        "nodes": [
            {
                "id": "n1", "source": "manual", "name": "West Lake",
                "city_id": "city-hz", "city": "Hangzhou",
                "location": {"lat": 30.25, "lng": 120.15, "status": "resolved"},
                "status": "scheduled",
                "schedule": {"day_id": "day-1", "time_window": "09:00"},
                "constraints": {"required": False, "fixed_day": False, "fixed_time": False, "fixed_order": False},
            },
            {
                "id": "n2", "source": "manual", "name": "Lingyin Temple",
                "city_id": "city-hz", "city": "Hangzhou",
                "location": {"lat": 30.24, "lng": 120.10, "status": "resolved"},
                "status": "scheduled",
                "schedule": {"day_id": "day-1", "time_window": "10:00"},
                "constraints": {"required": False, "fixed_day": False, "fixed_time": False, "fixed_order": False},
            },
            {
                "id": "n3", "source": "manual", "name": "Longjing Village",
                "city_id": "city-hz", "city": "Hangzhou",
                "location": {"lat": 30.22, "lng": 120.12, "status": "resolved"},
                "status": "scheduled",
                "schedule": {"day_id": "day-1", "time_window": "11:00"},
                "constraints": {"required": False, "fixed_day": False, "fixed_time": False, "fixed_order": False},
            },
        ],
        "days": [{
            "id": "day-1", "day": 1,
            "primary_city_id": "city-hz",
            "node_ids": ["n1", "n2", "n3"],
        }],
    }
    payload.update(overrides)
    return TripDraft.model_validate(payload)


def run_optimize(draft, scope):
    return asyncio.run(optimize_draft(draft, scope))


class DraftOptimizerTests(unittest.TestCase):
    def test_optimize_day_reorders_unlocked_nodes(self):
        draft = make_draft()
        scope = OptimizeScope(type="day", id="day-1")
        optimized, diff, sources = run_optimize(draft, scope)
        self.assertEqual(len(optimized.days[0].node_ids), 3)
        self.assertGreater(optimized.revision, draft.revision)
        self.assertEqual(set(optimized.days[0].node_ids), {"n1", "n2", "n3"})
        self.assertIn("draft", sources)

    def test_locked_nodes_are_preserved(self):
        draft = make_draft()
        draft.nodes[0].constraints.fixed_order = True
        scope = OptimizeScope(type="day", id="day-1")
        optimized, diff, _sources = run_optimize(draft, scope)
        self.assertEqual(optimized.days[0].node_ids[0], "n1")

    def test_scope_day_only_affects_target_day(self):
        draft = make_draft(days=[
            {"id": "day-1", "day": 1, "primary_city_id": "city-hz", "node_ids": ["n1", "n2"]},
            {"id": "day-2", "day": 2, "primary_city_id": "city-hz", "node_ids": ["n3"]},
        ])
        scope = OptimizeScope(type="day", id="day-1")
        optimized, diff, _sources = run_optimize(draft, scope)
        self.assertEqual(optimized.days[1].node_ids, ["n3"])

    def test_diff_detects_move(self):
        draft = make_draft()
        scope = OptimizeScope(type="day", id="day-1")
        optimized, diff, _sources = run_optimize(draft, scope)
        move_diffs = [d for d in diff if d.type == "move"]
        if move_diffs:
            self.assertIsNotNone(move_diffs[0].from_position)
            self.assertIsNotNone(move_diffs[0].to_position)

    def test_empty_day_no_error(self):
        draft = make_draft()
        draft.days[0].node_ids = []
        scope = OptimizeScope(type="day", id="day-1")
        optimized, diff, _sources = run_optimize(draft, scope)
        self.assertEqual(optimized.days[0].node_ids, [])

    def test_optimize_trip_scope(self):
        draft = make_draft()
        scope = OptimizeScope(type="trip")
        optimized, diff, _sources = run_optimize(draft, scope)
        self.assertEqual(len(optimized.days[0].node_ids), 3)

    def test_accepts_transit_city_stop_with_plan_stay_false(self):
        draft = make_draft(
            city_stops=[
                {"id": "city-hb", "name": "淮北", "days": 0, "plan_stay": False},
                {"id": "city-hf", "name": "合肥", "days": 1, "plan_stay": True},
            ],
            nodes=[
                {
                    "id": "n1", "source": "manual", "name": "包公园",
                    "city_id": "city-hf", "city": "合肥",
                    "location": {"lat": 31.86, "lng": 117.28, "status": "resolved"},
                    "status": "scheduled",
                    "schedule": {"day_id": "day-1", "time_window": "09:00"},
                    "constraints": {
                        "required": False, "fixed_day": False,
                        "fixed_time": False, "fixed_order": False,
                    },
                },
            ],
            days=[{
                "id": "day-1", "day": 1,
                "primary_city_id": "city-hf",
                "node_ids": ["n1"],
            }],
        )
        self.assertEqual(draft.city_stops[0].days, 0)
        self.assertEqual(draft.city_stops[0].plan_stay, False)
        scope = OptimizeScope(type="day", id="day-1")
        optimized, _diff, _sources = run_optimize(draft, scope)
        self.assertEqual(optimized.city_stops[0].days, 0)


if __name__ == "__main__":
    unittest.main()
