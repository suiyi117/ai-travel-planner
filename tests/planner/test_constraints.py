import unittest

from planner.constraints import validate_constraints
from schemas.draft import TripDraft


def make_draft(**overrides) -> TripDraft:
    payload = {
        "schema_version": 2,
        "id": "trip-1",
        "revision": 3,
        "mode": "itinerary",
        "route_shape": "one_way",
        "strategy": "balanced",
        "city_stops": [{"id": "city-hz", "name": "Hangzhou", "days": 1}],
        "nodes": [{
            "id": "n1",
            "source": "manual",
            "name": "West Lake",
            "city_id": "city-hz",
            "city": "Hangzhou",
            "location": {"lat": 30.25, "lng": 120.15, "status": "resolved"},
            "status": "scheduled",
            "schedule": {"day_id": "day-1", "time_window": "09:00"},
            "constraints": {
                "required": True, "fixed_day": True,
                "fixed_time": True, "fixed_order": False,
            },
        }],
        "days": [{
            "id": "day-1", "day": 1,
            "primary_city_id": "city-hz",
            "node_ids": ["n1"],
        }],
    }
    payload.update(overrides)
    return TripDraft.model_validate(payload)


class ConstraintValidationTests(unittest.TestCase):
    def test_rejects_duplicate_nodes_and_invalid_fixed_day(self):
        draft = make_draft()
        draft.days[0].node_ids = ["n1", "n1"]
        draft.nodes[0].schedule.day_id = "missing-day"
        codes = [item["code"] for item in validate_constraints(draft)]
        self.assertEqual(codes, ["duplicate_node", "unknown_schedule_day"])

    def test_required_unresolved_wishlist_is_not_a_violation(self):
        draft = make_draft()
        draft.days[0].node_ids = []
        draft.nodes[0].status = "wishlist"
        draft.nodes[0].schedule.day_id = None
        draft.nodes[0].location.status = "unresolved"
        violations = validate_constraints(draft)
        self.assertEqual(violations, [])

    def test_fixed_time_without_window(self):
        draft = make_draft()
        draft.nodes[0].constraints.fixed_time = True
        draft.nodes[0].schedule.time_window = ""
        codes = [item["code"] for item in validate_constraints(draft)]
        self.assertIn("fixed_time_missing", codes)

    def test_city_day_capacity_exceeded(self):
        draft = make_draft(days=[{
            "id": "day-1", "day": 1, "primary_city_id": "city-hz", "node_ids": ["n1"],
        }, {
            "id": "day-2", "day": 2, "primary_city_id": "city-hz", "node_ids": [],
        }])
        codes = [item["code"] for item in validate_constraints(draft)]
        self.assertIn("city_day_capacity", codes)

    def test_unknown_city_in_day(self):
        draft = make_draft()
        draft.days[0].primary_city_id = "city-unknown"
        codes = [item["code"] for item in validate_constraints(draft)]
        self.assertIn("unknown_day_city", codes)

    def test_self_drive_fixed_order_missing_from_route(self):
        draft = make_draft(mode="self_drive")
        draft.nodes[0].constraints.fixed_order = True
        draft.route = {"ordered_node_ids": []}
        codes = [item["code"] for item in validate_constraints(draft)]
        self.assertIn("fixed_order_route_missing", codes)

    def test_clean_draft_has_no_violations(self):
        draft = make_draft()
        self.assertEqual(validate_constraints(draft), [])

    def test_unknown_node_reference(self):
        draft = make_draft()
        draft.days[0].node_ids = ["n1", "nonexistent"]
        codes = [item["code"] for item in validate_constraints(draft)]
        self.assertIn("unknown_node", codes)


if __name__ == "__main__":
    unittest.main()
