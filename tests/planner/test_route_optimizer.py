import unittest

from planner.route_optimizer import RouteNodeLimitError, optimize_route_order, split_route_days


COSTS = {
    ("a", "b"): {"distance_meters": 10, "duration_seconds": 10},
    ("a", "c"): {"distance_meters": 100, "duration_seconds": 100},
    ("b", "c"): {"distance_meters": 10, "duration_seconds": 10},
    ("c", "b"): {"distance_meters": 10, "duration_seconds": 10},
    ("b", "d"): {"distance_meters": 100, "duration_seconds": 100},
    ("c", "d"): {"distance_meters": 10, "duration_seconds": 10},
    ("b", "a"): {"distance_meters": 100, "duration_seconds": 100},
    ("c", "a"): {"distance_meters": 10, "duration_seconds": 10},
}


class RouteOptimizerTests(unittest.TestCase):
    def test_one_way_keeps_endpoints_and_improves_middle_order(self):
        nodes = [{"id": "a"}, {"id": "c"}, {"id": "b"}, {"id": "d"}]
        self.assertEqual(optimize_route_order(nodes, COSTS, "one_way", "efficient"), ["a", "b", "c", "d"])

    def test_fixed_order_node_keeps_exact_index(self):
        nodes = [{"id": "a"}, {"id": "c", "fixed_order": True}, {"id": "b"}]
        result = optimize_route_order(nodes, COSTS, "round_trip", "balanced")
        self.assertEqual(result.index("c"), 1)

    def test_more_than_twenty_nodes_raises_stable_error(self):
        with self.assertRaisesRegex(RouteNodeLimitError, "route_node_limit_exceeded"):
            optimize_route_order([{"id": str(index)} for index in range(21)], {}, "one_way", "balanced")

    def test_split_route_days_respects_max_driving_minutes(self):
        order = ["a", "b", "c"]
        split_costs = {
            ("a", "b"): {"distance_meters": 1000, "duration_seconds": 40},
            ("b", "c"): {"distance_meters": 1000, "duration_seconds": 40},
        }
        days = split_route_days(order, split_costs, max_driving_minutes=1)
        self.assertEqual(days, [["a", "b"], ["b", "c"]])


if __name__ == "__main__":
    unittest.main()
