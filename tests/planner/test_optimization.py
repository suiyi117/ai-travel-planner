import unittest
from unittest.mock import AsyncMock, patch

from planner.optimization import DraftOptimizationError, optimize_plan_draft
from schemas.draft import OptimizeRequest, PlaceNode


def make_request() -> OptimizeRequest:
    return OptimizeRequest.model_validate(
        {
            "base_revision": 3,
            "scope": {"type": "day", "id": "day-1"},
            "draft": {
                "schema_version": 2,
                "id": "trip-1",
                "revision": 3,
                "mode": "itinerary",
                "route_shape": "one_way",
                "strategy": "balanced",
                "city_stops": [{"id": "city-1", "name": "北京", "days": 1}],
                "nodes": [],
                "days": [
                    {
                        "id": "day-1",
                        "day": 1,
                        "primary_city_id": "city-1",
                        "node_ids": [],
                    }
                ],
            },
        }
    )


class OptimizePlanDraftTests(unittest.IsolatedAsyncioTestCase):
    async def test_success_assembles_unresolved_and_route_warnings(self):
        request = make_request()
        candidate = request.draft.model_copy(deep=True)
        candidate.revision = 4
        candidate.nodes = [
            PlaceNode.model_validate(
                {
                    "id": "node-1",
                    "source": "manual",
                    "name": "待定位景点",
                    "city_id": "city-1",
                    "city": "北京",
                }
            )
        ]
        candidate.route = {
            "warnings": [
                {
                    "code": "single_segment_over_daily_limit",
                    "from_node_id": "node-1",
                    "to_node_id": "node-2",
                    "message": "单段驾驶时间超过每日上限",
                }
            ]
        }

        with (
            patch("planner.optimization.validate_constraints", return_value=[]),
            patch(
                "planner.optimization.optimize_draft",
                AsyncMock(return_value=(candidate, [], ["draft", "haversine"])),
            ),
        ):
            response = await optimize_plan_draft(request, "test-amap-key")

        self.assertEqual(response.base_revision, 3)
        self.assertEqual(response.candidate.revision, 4)
        self.assertEqual(response.data_sources, ["draft", "haversine"])
        self.assertEqual([warning.code for warning in response.warnings], [
            "unresolved_node",
            "single_segment_over_daily_limit",
        ])
        self.assertEqual(response.warnings[1].from_node_id, "node-1")

    async def test_revision_conflict_is_a_stable_domain_error(self):
        request = make_request()
        request.base_revision = 2

        with self.assertRaises(DraftOptimizationError) as raised:
            await optimize_plan_draft(request, "test-amap-key")

        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(raised.exception.detail, "revision conflict")

    async def test_constraint_violations_are_returned_without_optimizing(self):
        request = make_request()
        optimizer = AsyncMock()

        with (
            patch(
                "planner.optimization.validate_constraints",
                return_value=[{"code": "fixed_day_missing", "node_id": "node-1"}],
            ),
            patch("planner.optimization.optimize_draft", optimizer),
            self.assertRaises(DraftOptimizationError) as raised,
        ):
            await optimize_plan_draft(request, "test-amap-key")

        self.assertEqual(raised.exception.status_code, 422)
        self.assertEqual(raised.exception.detail["message"], "constraint violation")
        optimizer.assert_not_awaited()

    async def test_known_optimizer_conflict_maps_to_a_422_domain_error(self):
        request = make_request()

        with (
            patch("planner.optimization.validate_constraints", return_value=[]),
            patch(
                "planner.optimization.optimize_draft",
                AsyncMock(side_effect=ValueError("fixed_day_route_conflict")),
            ),
            self.assertRaises(DraftOptimizationError) as raised,
        ):
            await optimize_plan_draft(request, "test-amap-key")

        self.assertEqual(raised.exception.status_code, 422)
        self.assertEqual(raised.exception.detail["code"], "constraint_conflict")

    async def test_unknown_optimizer_error_propagates_for_router_redaction(self):
        request = make_request()

        with (
            patch("planner.optimization.validate_constraints", return_value=[]),
            patch(
                "planner.optimization.optimize_draft",
                AsyncMock(side_effect=ValueError("provider-secret-detail")),
            ),
            self.assertRaisesRegex(ValueError, "provider-secret-detail"),
        ):
            await optimize_plan_draft(request, "test-amap-key")


if __name__ == "__main__":
    unittest.main()
