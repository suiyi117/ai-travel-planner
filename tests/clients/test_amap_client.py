import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from clients import amap
from clients.amap import get_city_center, parse_amap_pois, pick_primary_district


class FakeAsyncClient:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


def fake_response(*, status_code=200, data=None, content=b"", content_type="application/json"):
    return SimpleNamespace(
        status_code=status_code,
        content=content,
        headers={"content-type": content_type},
        json=lambda: data or {},
    )


class AmapDistrictTests(unittest.TestCase):
    def test_pick_primary_district_prefers_city_over_same_named_district(self):
        districts = [
            {"name": "西安区", "level": "district", "adcode": "220403"},
            {"name": "西安市", "level": "city", "adcode": "610100"},
        ]

        result = pick_primary_district(districts)

        self.assertEqual(result["name"], "西安市")
        self.assertEqual(result["adcode"], "610100")

    def test_get_city_center_without_key_returns_stable_fallback(self):
        result = asyncio.run(get_city_center("", "北京"))

        self.assertEqual(result, {"lat": 30.0, "lng": 116.0, "name": "北京"})


class AmapPoiParsingTests(unittest.TestCase):
    def test_parse_amap_pois_normalizes_location_and_biz_ext(self):
        data = {
            "pois": [
                {
                    "name": "故宫博物院",
                    "address": "北京市东城区景山前街4号",
                    "tel": "010",
                    "biz_ext": {"rating": "4.8", "opentime": "08:30-17:00"},
                    "type": "风景名胜",
                    "location": "116.3972,39.9163",
                    "cityname": "北京市",
                    "adname": "东城区",
                }
            ]
        }

        pois = parse_amap_pois(data)

        self.assertEqual(pois[0]["name"], "故宫博物院")
        self.assertEqual(pois[0]["lng"], 116.3972)
        self.assertEqual(pois[0]["lat"], 39.9163)
        self.assertEqual(pois[0]["rating"], "4.8")
        self.assertEqual(pois[0]["opentime"], "08:30-17:00")

    def test_parse_amap_pois_handles_invalid_location_and_non_dict_biz_ext(self):
        data = {"pois": [{"name": "未知景点", "location": "bad", "biz_ext": []}]}

        pois = parse_amap_pois(data)

        self.assertEqual(pois[0]["lat"], 0.0)
        self.assertEqual(pois[0]["lng"], 0.0)
        self.assertEqual(pois[0]["rating"], "")


class AmapStaticMapTests(unittest.TestCase):
    def test_build_static_map_params_encodes_markers_and_path(self):
        from clients.amap import build_static_map_params

        params = build_static_map_params(
            "test-key",
            width=640,
            height=640,
            markers=[{"lat": 39.9, "lng": 116.4, "label": "1"}],
            path=[[39.9, 116.4], [39.91, 116.41]],
        )
        self.assertEqual(params["key"], "test-key")
        self.assertEqual(params["size"], "640*640")
        self.assertIn("116.4,39.9", params["markers"])
        # Amap staticmap API uses "paths" (plural), not "path"
        self.assertIn("paths", params)
        self.assertIn("116.4,39.9", params["paths"])
        self.assertIn("116.41,39.91", params["paths"])
        self.assertTrue(params["paths"].startswith("6,0xC96442,0.9,,:"))

    def test_fetch_static_map_without_key_returns_error(self):
        from clients.amap import fetch_static_map

        result = asyncio.run(
            fetch_static_map("", width=100, height=100, markers=[], path=None)
        )
        self.assertEqual(result["status"], "error")


class AmapNetworkBoundaryTests(unittest.TestCase):
    def setUp(self):
        amap._weather_cache.clear()

    def test_get_city_center_uses_primary_district_center(self):
        client = FakeAsyncClient(
            fake_response(
                data={
                    "status": "1",
                    "districts": [
                        {"name": "Alpha District", "level": "district", "center": "1,2"},
                        {"name": "Alpha City", "level": "city", "center": "116.4,39.9"},
                    ],
                }
            )
        )
        with patch("clients.amap.httpx.AsyncClient", return_value=client):
            result = asyncio.run(get_city_center("key", "Alpha"))

        self.assertEqual(result, {"lat": 39.9, "lng": 116.4, "name": "Alpha City"})

    def test_search_pois_maps_success_and_provider_error(self):
        success_client = FakeAsyncClient(
            fake_response(data={"status": "1", "pois": [{"name": "Museum", "location": "116.4,39.9"}]})
        )
        with patch("clients.amap.httpx.AsyncClient", return_value=success_client):
            success = asyncio.run(amap.search_pois("key", "Alpha", "museum", count=5))

        error_client = FakeAsyncClient(fake_response(data={"status": "0", "info": "INVALID", "infocode": "10001"}))
        with patch("clients.amap.httpx.AsyncClient", return_value=error_client):
            error = asyncio.run(amap.search_pois("key", "Alpha", "museum"))

        self.assertEqual(success["pois"][0]["name"], "Museum")
        self.assertEqual(success_client.calls[0][1]["params"]["offset"], 5)
        self.assertEqual(error, {"status": "error", "info": "INVALID", "code": "10001"})

    def test_query_weather_fetches_and_caches_forecast(self):
        client = FakeAsyncClient(
            fake_response(data={"status": "1", "districts": [{"level": "city", "adcode": "100"}]}),
            fake_response(
                data={
                    "status": "1",
                    "forecasts": [
                        {
                            "casts": [
                                {
                                    "date": "2026-08-01",
                                    "dayweather": "sunny",
                                    "nightweather": "clear",
                                    "daytemp": "30",
                                    "nighttemp": "20",
                                }
                            ]
                        }
                    ],
                }
            ),
        )
        with patch("clients.amap.httpx.AsyncClient", return_value=client):
            first = asyncio.run(amap.query_weather("key", "Alpha"))
            second = asyncio.run(amap.query_weather("key", "Alpha"))

        self.assertEqual(first, second)
        self.assertEqual(first[0]["dayweather"], "sunny")
        self.assertEqual(len(client.calls), 2)

    def test_query_weather_reports_transport_errors(self):
        errors = []
        client = FakeAsyncClient(RuntimeError("offline"))
        with patch("clients.amap.httpx.AsyncClient", return_value=client):
            result = asyncio.run(amap.query_weather("key", "Alpha", on_error=errors.append))

        self.assertEqual(result, [])
        self.assertEqual(str(errors[0]), "offline")

    def test_fetch_static_map_accepts_png_and_clamps_dimensions(self):
        client = FakeAsyncClient(fake_response(content=b"\x89PNGdata", content_type="image/png"))
        with patch("clients.amap.httpx.AsyncClient", return_value=client):
            result = asyncio.run(amap.fetch_static_map("key", width=5000, height=0))

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["width"], 1024)
        self.assertEqual(result["height"], 640)

    def test_reverse_geocode_normalizes_nearest_place(self):
        client = FakeAsyncClient(
            fake_response(
                data={
                    "status": "1",
                    "regeocode": {
                        "formatted_address": "Alpha Road",
                        "addressComponent": {"city": [], "province": "Alpha", "district": "Center"},
                        "pois": [{"id": "poi-1", "name": "Museum", "address": "1 Alpha Road"}],
                    },
                }
            )
        )
        with patch("clients.amap.httpx.AsyncClient", return_value=client):
            result = asyncio.run(amap.reverse_geocode("key", 39.9, 116.4))

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["place"]["provider_id"], "poi-1")
        self.assertEqual(result["place"]["city"], "Alpha")


if __name__ == "__main__":
    unittest.main()
