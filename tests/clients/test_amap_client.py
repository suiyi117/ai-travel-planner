import asyncio
import unittest

from clients.amap import get_city_center, parse_amap_pois, pick_primary_district


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


if __name__ == "__main__":
    unittest.main()
