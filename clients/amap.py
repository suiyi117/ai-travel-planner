import time
from collections.abc import Callable

import httpx


AMAP_DISTRICT_URL = "https://restapi.amap.com/v3/config/district"
AMAP_PLACE_TEXT_URL = "https://restapi.amap.com/v3/place/text"
AMAP_WEATHER_URL = "https://restapi.amap.com/v3/weather/weatherInfo"

FALLBACK_CITY_CENTER = {"lat": 30.0, "lng": 116.0}
WEATHER_CACHE_TTL = 30 * 60
_weather_cache: dict = {}


def pick_primary_district(districts: list[dict]) -> dict:
    """Pick the most likely city/province district from ambiguous Amap keyword matches."""
    priority = {"city": 0, "province": 1, "district": 2, "street": 3}
    return min(districts, key=lambda d: priority.get(str(d.get("level", "")), 9))


def parse_amap_pois(data: dict) -> list[dict]:
    pois = []
    for poi in data.get("pois", []):
        lat, lng = 0.0, 0.0
        if poi.get("location"):
            try:
                lng_str, lat_str = poi["location"].split(",")
                lng, lat = float(lng_str), float(lat_str)
            except ValueError:
                pass

        biz_ext = poi.get("biz_ext")
        if not isinstance(biz_ext, dict):
            biz_ext = {}

        pois.append({
            "name": poi.get("name", ""),
            "address": poi.get("address", ""),
            "tel": poi.get("tel", ""),
            "rating": biz_ext.get("rating", ""),
            "type": poi.get("type", ""),
            "lat": lat,
            "lng": lng,
            "cityname": poi.get("cityname", ""),
            "adname": poi.get("adname", ""),
            "opentime": biz_ext.get("opentime", ""),
        })
    return pois


async def search_pois(amap_key: str, city: str, keywords: str, count: int = 25) -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(
            AMAP_PLACE_TEXT_URL,
            params={
                "key": amap_key,
                "keywords": keywords,
                "city": city,
                "offset": count,
                "page": 1,
                "extensions": "all",
            },
        )

    if response.status_code != 200:
        raise RuntimeError(f"高德 API 请求失败: {response.status_code}")

    data = response.json()
    if data.get("status") == "1":
        return {"status": "ok", "pois": parse_amap_pois(data)}

    return {"status": "error", "info": data.get("info", "未知错误"), "code": data.get("infocode")}


async def get_city_center(amap_key: str, city: str) -> dict:
    fallback = {**FALLBACK_CITY_CENTER, "name": city}
    if not amap_key:
        return fallback

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                AMAP_DISTRICT_URL,
                params={"key": amap_key, "keywords": city, "subdistrict": 0},
            )
        if response.status_code == 200:
            data = response.json()
            if data.get("status") == "1" and data.get("districts"):
                district = pick_primary_district(data["districts"])
                center = district.get("center")
                if center:
                    lng_str, lat_str = center.split(",")
                    return {"lat": float(lat_str), "lng": float(lng_str), "name": district.get("name", city)}
        return fallback
    except Exception:
        return fallback


async def query_weather(
    amap_key: str,
    city: str,
    on_error: Callable[[Exception], None] | None = None,
) -> list[dict]:
    if not amap_key:
        return []

    now = time.time()
    cached = _weather_cache.get(city)
    if cached and (now - cached[0]) < WEATHER_CACHE_TTL:
        return cached[1]

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            district_response = await client.get(
                AMAP_DISTRICT_URL,
                params={"key": amap_key, "keywords": city, "subdistrict": 0},
            )
            district_data = district_response.json()
            districts = district_data.get("districts") or []
            if district_data.get("status") != "1" or not districts:
                return []
            adcode = pick_primary_district(districts).get("adcode")
            if not adcode:
                return []

            weather_response = await client.get(
                AMAP_WEATHER_URL,
                params={"key": amap_key, "city": adcode, "extensions": "all"},
            )
            weather_data = weather_response.json()
            if weather_data.get("status") != "1":
                return []
            forecasts = weather_data.get("forecasts") or []
            if not forecasts:
                return []
            casts = forecasts[0].get("casts") or []
            result = [
                {
                    "date": item.get("date", ""),
                    "dayweather": item.get("dayweather", ""),
                    "nightweather": item.get("nightweather", ""),
                    "daytemp": item.get("daytemp", ""),
                    "nighttemp": item.get("nighttemp", ""),
                }
                for item in casts
            ]
            _weather_cache[city] = (now, result)
            return result
    except Exception as exc:
        if on_error:
            on_error(exc)
        return []

AMAP_REGEO_URL = "https://restapi.amap.com/v3/geocode/regeo"


async def reverse_geocode(amap_key: str, lat: float, lng: float) -> dict:
    """Resolve lat/lng to a stable place with city and address via Amap regeo."""
    if not amap_key:
        return {"status": "error", "info": "missing_api_key"}

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                AMAP_REGEO_URL,
                params={
                    "key": amap_key,
                    "location": f"{lng},{lat}",
                    "extensions": "base",
                },
            )
        if response.status_code != 200:
            return {"status": "error", "info": f"amap_http_{response.status_code}"}

        data = response.json()
        if data.get("status") != "1":
            return {"status": "error", "info": data.get("info", "unknown_error")}

        regeocode = data.get("regeocode") or {}
        address_component = regeocode.get("addressComponent") or {}
        city = (
            address_component.get("city")
            or address_component.get("province")
            or ""
        )

        pois = regeocode.get("pois") or []
        nearest = pois[0] if pois else {}

        return {
            "status": "ok",
            "place": {
                "provider_id": nearest.get("id") or None,
                "name": nearest.get("name") or address_component.get("township") or address_component.get("district") or "地图选点",
                "city": (city if isinstance(city, str) else str(city)).strip(),
                "lat": lat,
                "lng": lng,
                "address": nearest.get("address") or regeocode.get("formatted_address") or "",
            },
        }
    except Exception:
        return {"status": "error", "info": "amap_unavailable"}
