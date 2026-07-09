import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers.location import create_location_router
from routers.planning import create_planning_router
from routers.system import create_system_router


def fake_settings(**overrides):
    defaults = {
        "app_env": "development",
        "expose_client_config": False,
        "ai_api_key": "",
        "ai_model": "test-model",
        "amap_key": "test-amap-key",
        "amap_security_key": "test-security-key",
        "juhe_flight_api_key": "",
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


class NonTransportRouteTests(unittest.TestCase):
    def test_location_routes_keep_amap_proxy_response_shape(self):
        app = FastAPI()
        app.include_router(create_location_router(fake_settings(), logger=None))

        async def fake_search_pois(*_args, **_kwargs):
            return {"status": "ok", "pois": [{"name": "故宫"}]}

        with patch("routers.location.amap_search_pois", fake_search_pois):
            response = TestClient(app).get(
                "/api/search_pois",
                params={"city": "北京", "keywords": "景点", "count": 1},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok", "pois": [{"name": "故宫"}]})

    def test_weather_route_degrades_to_empty_forecasts_on_error(self):
        app = FastAPI()
        app.include_router(create_location_router(fake_settings(), logger=None))

        async def fake_query_weather(*_args, **_kwargs):
            raise RuntimeError("network unavailable")

        with patch("routers.location.amap_query_weather", fake_query_weather):
            response = TestClient(app).get("/api/weather", params={"city": "北京"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "error")
        self.assertEqual(response.json()["forecasts"], [])

    def test_system_routes_hide_config_and_report_health(self):
        app = FastAPI()
        app.include_router(create_system_router(fake_settings(juhe_flight_api_key="juhe-key")))

        client = TestClient(app)
        config = client.get("/api/config").json()
        health = client.get("/api/health").json()

        self.assertEqual(config["amap_key"], "")
        self.assertEqual(config["amap_security_key"], "")
        self.assertFalse(config["client_config_exposed"])
        self.assertTrue(health["juhe_key_configured"])
        self.assertTrue(health["transport_flight_available"])

    def test_planning_route_validates_city_data_before_generation(self):
        app = FastAPI()
        app.include_router(create_planning_router(fake_settings(ai_api_key="ai-key"), logger=None))

        response = TestClient(app).post(
            "/api/plan",
            json={"destinations": [{"name": "北京"}], "city_data": []},
        )

        self.assertEqual(response.status_code, 400)

    def test_planning_route_delegates_generation_for_valid_request(self):
        app = FastAPI()
        app.include_router(create_planning_router(fake_settings(ai_api_key="ai-key"), logger=None))

        async def fake_generate_itinerary(*_args, **_kwargs):
            return {"days": [], "transport_guide": []}

        with patch("routers.planning.generate_itinerary", fake_generate_itinerary):
            response = TestClient(app).post(
                "/api/plan",
                json={
                    "destinations": [{"name": "北京"}],
                    "city_data": [{"city": "北京", "pois": [{"name": "故宫"}]}],
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"days": [], "transport_guide": []})


if __name__ == "__main__":
    unittest.main()
