import unittest

from services.flight_service import _search_builtin_flights


class BuiltinFlightFallbackTests(unittest.TestCase):
    def test_reverse_lookup_does_not_invert_airport_direction(self):
        flights = _search_builtin_flights("西安", "成都")

        for flight in flights:
            self.assertIn("西安", flight["from_airport"])
            self.assertIn("成都", flight["to_airport"])
            self.assertNotIn("成都", flight["from_airport"])
            self.assertNotIn("西安", flight["to_airport"])


if __name__ == "__main__":
    unittest.main()
