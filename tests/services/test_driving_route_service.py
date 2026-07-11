import unittest

from services.driving_route_service import build_driving_route


NODES = [
    {"id": "a", "name": "A", "lat": 30.0, "lng": 120.0},
    {"id": "b", "name": "B", "lat": 30.5, "lng": 120.5},
]


class DrivingRouteServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_round_trip_adds_return_segment_and_provider_totals(self):
        async def fetch(_key, origin, destination):
            return {
                "from_node_id": origin["id"], "to_node_id": destination["id"], "status": "provider",
                "distance_meters": 10000, "duration_seconds": 900, "tolls_yuan": 5.0, "polyline": [],
            }
        result = await build_driving_route("key", NODES, "round_trip", fetch_segment=fetch)
        self.assertEqual(len(result["segments"]), 2)
        self.assertEqual(result["totals"], {"distance_meters": 20000, "duration_seconds": 1800, "tolls_yuan": 10.0})
        self.assertEqual(result["status"], "provider")

    async def test_missing_key_returns_explicit_estimate(self):
        result = await build_driving_route("", NODES, "one_way")
        self.assertEqual(result["status"], "estimate")
        self.assertIsNone(result["totals"]["tolls_yuan"])

    async def test_partial_provider_failure_does_not_invent_totals(self):
        calls = 0
        async def fetch(_key, origin, destination):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise RuntimeError("provider down")
            return {"from_node_id": origin["id"], "to_node_id": destination["id"], "status": "provider", "distance_meters": 1, "duration_seconds": 1, "tolls_yuan": 0, "polyline": []}
        result = await build_driving_route("key", [*NODES, {"id": "c", "name": "C", "lat": 31.0, "lng": 121.0}], "one_way", fetch_segment=fetch)
        self.assertEqual(result["status"], "unavailable")
        self.assertEqual(result["totals"], {"distance_meters": None, "duration_seconds": None, "tolls_yuan": None})


if __name__ == "__main__":
    unittest.main()
