import time
from collections.abc import Callable

import httpx


AMAP_DISTRICT_URL = "https://restapi.amap.com/v3/config/district"
AMAP_PLACE_TEXT_URL = "https://restapi.amap.com/v3/place/text"
AMAP_WEATHER_URL = "https://restapi.amap.com/v3/weather/weatherInfo"

FALLBACK_CITY_CENTER = {"lat": 34.2, "lng": 108.9}
FALLBACK_CITY_CENTERS = {
    "北京": {"lat": 39.905603, "lng": 116.413642},
    "西安": {"lat": 34.340044, "lng": 108.944456},
    "上海": {"lat": 31.228458, "lng": 121.478223},
    "成都": {"lat": 30.570346, "lng": 104.069305},
    "杭州": {"lat": 30.271771, "lng": 120.159794},
    "广州": {"lat": 23.126423, "lng": 113.26973},
    "深圳": {"lat": 22.540383, "lng": 114.063014},
    "重庆": {"lat": 29.560151, "lng": 106.555318},
    "长沙": {"lat": 28.224692, "lng": 112.94425},
    "南京": {"lat": 32.058224, "lng": 118.802084},
}
WEATHER_CACHE_TTL = 30 * 60
_weather_cache: dict = {}


def pick_primary_district(districts: list[dict]) -> dict:
    """Pick the most likely city/province district from ambiguous Amap keyword matches."""
    priority = {"city": 0, "province": 1, "district": 2, "street": 3}
    return min(districts, key=lambda d: priority.get(str(d.get("level", "")), 9))


def fallback_city_center(city: str) -> dict:
    city_name = str(city or "").strip()
    normalized = city_name.removesuffix("市")
    center = FALLBACK_CITY_CENTERS.get(normalized, FALLBACK_CITY_CENTER)
    return {**center, "name": city_name}


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
    fallback = fallback_city_center(city)
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
AMAP_STATIC_MAP_URL = "https://restapi.amap.com/v3/staticmap"


def build_static_map_params(
    amap_key: str,
    *,
    width: int = 640,
    height: int = 640,
    markers: list[dict] | None = None,
    path: list[list[float]] | None = None,
) -> dict:
    """Build query params for Amap static map API.

    Coordinate convention: input markers use lat/lng keys; path points are
    [lat, lng] lists (package convention). Amap expects lng,lat order.
    """
    w = max(1, min(1024, int(width or 640)))
    h = max(1, min(1024, int(height or 640)))
    params: dict = {
        "key": amap_key,
        "size": f"{w}*{h}",
        "scale": 2,
    }
    marker_list = list(markers or [])[:10]
    if marker_list:
        # style: mid,0xCOLOR,label:lng,lat  (label is single digit/letter)
        parts = []
        for marker in marker_list:
            label = str(marker.get("label") or "")[:1] or "1"
            lng = float(marker["lng"])
            lat = float(marker["lat"])
            parts.append(f"mid,0xC96442,{label}:{lng},{lat}")
        params["markers"] = "|".join(parts)
    if path and len(path) >= 2:
        # style: weight,color,transparency,fillcolor,filltransparency:lng1,lat1;...
        # path points are [lat, lng]; Amap wants lng,lat
        # Slightly thicker brand stroke reads better on multi-city overview zoom.
        coords = ";".join(f"{float(p[1])},{float(p[0])}" for p in path[:200])
        params["paths"] = f"6,0xC96442,0.9,,:{coords}"
    return params


async def fetch_static_map(
    amap_key: str,
    *,
    width: int = 640,
    height: int = 640,
    markers: list[dict] | None = None,
    path: list[list[float]] | None = None,
) -> dict:
    """Fetch a static map PNG from Amap.

    Returns ``{"status": "ok", "content_type": "image/png", "content": bytes,
    "width": int, "height": int}`` on success, or
    ``{"status": "error", "info": str}`` on failure.
    """
    if not amap_key:
        return {"status": "error", "info": "missing_api_key"}
    params = build_static_map_params(
        amap_key, width=width, height=height, markers=markers, path=path
    )
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(AMAP_STATIC_MAP_URL, params=params)
        if response.status_code != 200:
            return {"status": "error", "info": f"amap_http_{response.status_code}"}
        content_type = response.headers.get("content-type", "")
        if "image" not in content_type and not response.content.startswith(b"\x89PNG"):
            # Amap often returns a JSON error body instead of an image
            return {"status": "error", "info": "not_an_image"}
        return {
            "status": "ok",
            "content_type": "image/png",
            "content": response.content,
            "width": max(1, min(1024, int(width or 640))),
            "height": max(1, min(1024, int(height or 640))),
        }
    except Exception:
        return {"status": "error", "info": "amap_unavailable"}


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
