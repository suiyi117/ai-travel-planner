import unittest
from unittest.mock import patch
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

import server
from routers.transport import create_driving_router


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


def route_node(node_id: str, lng: float) -> dict:
    return {
        "id": node_id, "source": "manual", "name": node_id, "city_id": "city-hz", "city": "杭州",
        "location": {"lat": 30.0, "lng": lng, "status": "resolved"}, "status": "scheduled",
        "schedule": {}, "constraints": {"required": True},
    }


class DrivingRouteTests(unittest.TestCase):
    def test_driving_route_keeps_request_order_and_shape(self):
        app = FastAPI()
        app.include_router(create_driving_router(SimpleNamespace(amap_key="key"), logger=None))

        async def fake_build(_key, nodes, route_shape):
            return {
                "source": "amap", "status": "provider", "route_shape": route_shape,
                "ordered_node_ids": [node["id"] for node in nodes], "segments": [],
                "totals": {"distance_meters": 0, "duration_seconds": 0, "tolls_yuan": 0},
                "polyline": [], "warnings": [], "fetched_at": "2026-07-10T00:00:00+00:00",
                "total_km": 0.0, "total_driving_minutes": 0, "toll_yuan": 0.0,
            }

        with patch("routers.transport.build_driving_route", fake_build):
            response = TestClient(app).post(
                "/api/transport/driving-route",
                json={"route_shape": "round_trip", "nodes": [route_node("b", 120.2), route_node("a", 120.1)]},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["ordered_node_ids"], ["b", "a"])
        self.assertEqual(response.json()["route_shape"], "round_trip")

    def test_driving_route_rejects_more_than_twenty_nodes(self):
        app = FastAPI()
        app.include_router(create_driving_router(SimpleNamespace(amap_key="key"), logger=None))
        response = TestClient(app).post(
            "/api/transport/driving-route",
            json={
                "route_shape": "one_way",
                "nodes": [route_node(str(index), 120.0 + index / 1000) for index in range(21)],
            },
        )
        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
