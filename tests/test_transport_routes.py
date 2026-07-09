import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

import server


class TransportRouteTests(unittest.TestCase):
    def test_trains_route_keeps_response_shape_and_price_enrichment(self):
        async def fake_search_trains(*_args, **_kwargs):
            return [
                {
                    "id": "G1",
                    "time": "09:00 - 11:00",
                    "duration_minutes": 120,
                    "train_type": "高铁",
                    "desc": "直达",
                    "seats": {"二等座": "8"},
                }
            ]

        with patch("routers.transport.search_trains", fake_search_trains):
            response = TestClient(server.app).get(
                "/api/transport/trains",
                params={"from_city": "北京", "to_city": "西安", "date": "2026-07-10", "budget": "舒适型"},
            )

        data = response.json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["source"], "12306")
        self.assertEqual(data["total"], 1)
        self.assertEqual(data["trains"][0]["price"], "¥228")
        self.assertIn("二等座:8张", data["trains"][0]["desc"])

    def test_flights_route_reports_none_source_when_no_flights(self):
        async def fake_search_flights(*_args, **_kwargs):
            return []

        with patch("routers.transport.search_flights", fake_search_flights):
            response = TestClient(server.app).get(
                "/api/transport/flights",
                params={"from_city": "西安", "to_city": "成都", "date": "2026-07-10"},
            )

        data = response.json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["source"], "none")
        self.assertEqual(data["flights"], [])

    def test_search_route_keeps_train_keyword_detection(self):
        async def fake_search_train_by_number(keyword, date):
            return {"id": keyword, "date": date}

        with patch("routers.transport.search_train_by_number", fake_search_train_by_number):
            response = TestClient(server.app).get(
                "/api/transport/search",
                params={"keyword": "g651", "date": "2026-07-10"},
            )

        data = response.json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["type"], "train")
        self.assertEqual(data["results"], [{"id": "G651", "date": "2026-07-10"}])

    def test_stations_route_returns_station_and_airport_info(self):
        with (
            patch("routers.transport._get_station_map", return_value={"北京": [("BJP", "北京站")]}),
            patch("routers.transport.get_airport_info", return_value={"code": "PEK", "name": "北京首都国际机场", "city": "北京"}),
            patch("routers.transport.CITY_AIRPORT_MAP", {"北京": [{"code": "PEK", "name": "北京首都国际机场", "city": "北京"}]}),
        ):
            response = TestClient(server.app).get("/api/transport/stations", params={"city": "北京市"})

        data = response.json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["stations"], [{"code": "BJP", "name": "北京站"}])
        self.assertEqual(data["airports"], [{"code": "PEK", "name": "北京首都国际机场", "city": "北京"}])


if __name__ == "__main__":
    unittest.main()
