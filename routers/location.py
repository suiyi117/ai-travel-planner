import logging

from fastapi import APIRouter, HTTPException

from clients.amap import (
    get_city_center as amap_get_city_center,
    query_weather as amap_query_weather,
    search_pois as amap_search_pois,
)
from core.observability import log_event


def create_location_router(settings, logger) -> APIRouter:
    router = APIRouter(tags=["location"])

    @router.get("/api/search_pois")
    async def search_pois(city: str, keywords: str, count: int = 25):
        """Backend proxy for Amap POI search."""
        if not settings.amap_key:
            raise HTTPException(status_code=400, detail="未配置高德地图 Key (AMAP_KEY)")

        try:
            return await amap_search_pois(settings.amap_key, city, keywords, count)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"后端搜索出错: {str(exc)}") from exc

    @router.get("/api/city_center")
    async def get_city_center(city: str):
        """Backend proxy for city center lookup."""
        return await amap_get_city_center(settings.amap_key, city)

    @router.get("/api/weather")
    async def get_weather(city: str):
        """Query city weather forecast; returns an empty forecast on failures."""
        try:
            forecasts = await amap_query_weather(
                settings.amap_key,
                city,
                on_error=lambda exc: _log_warning(
                    logger,
                    "weather_query_failed",
                    city=city,
                    error_type=exc.__class__.__name__,
                ),
            )
            return {"status": "ok" if forecasts else "error", "city": city, "forecasts": forecasts}
        except Exception as exc:
            return {"status": "error", "city": city, "forecasts": [], "message": str(exc)}

    return router


def _log_warning(logger, event: str, **fields) -> None:
    if logger:
        log_event(logger, logging.WARNING, event, **fields)
