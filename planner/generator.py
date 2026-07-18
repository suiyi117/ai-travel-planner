import asyncio
import logging
from collections.abc import Callable

from clients.ai import AiClientError, request_chat_completion
from clients.amap import get_city_center
from clients.amap import query_weather as amap_query_weather
from core.observability import log_event
from planner.itinerary import hydrate_itinerary, parse_ai_itinerary_content
from planner.prompting import build_itinerary_prompt
from planner.scheduling import reconcile_itinerary_schedule
from planner.transport import build_quality_checks, enrich_transport_guide
from schemas.travel import PlanRequest


class ItineraryGenerationError(Exception):
    def __init__(self, detail: str, status_code: int = 500):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


async def generate_itinerary(request: PlanRequest, *, settings, logger: logging.Logger | None) -> dict:
    """Generate and hydrate an itinerary from a validated planning request."""
    if not settings.ai_api_key:
        raise ItineraryGenerationError("未配置 AI API Key (AI_API_KEY)")

    def log_weather_error(exc: Exception, city_name: str) -> None:
        _log_warning(
            logger,
            "weather_query_failed",
            city=city_name,
            error_type=exc.__class__.__name__,
        )

    def make_weather_error_handler(city_name: str) -> Callable[[Exception], None]:
        def handle_weather_error(exc: Exception) -> None:
            log_weather_error(exc, city_name)

        return handle_weather_error

    weather_results = await asyncio.gather(
        *(
            amap_query_weather(
                settings.amap_key,
                city.name,
                on_error=make_weather_error_handler(city.name),
            )
            for city in request.destinations
            if getattr(city, "plan_stay", None) is not False and (city.days is None or city.days > 0)
        )
    )
    playable_cities = [
        city
        for city in request.destinations
        if getattr(city, "plan_stay", None) is not False and (city.days is None or city.days > 0)
    ]
    city_weather = {
        city.name: weather
        for city, weather in zip(playable_cities, weather_results)
        if weather
    }
    prompt, all_pois = build_itinerary_prompt(request, city_weather)

    try:
        content = await request_chat_completion(
            api_key=settings.ai_api_key,
            base_url=settings.ai_base_url,
            model=settings.ai_model,
            prompt=prompt,
            days=request.days,
            destination_count=max(1, len(playable_cities) or len(request.destinations)),
        )
    except AiClientError as exc:
        raise ItineraryGenerationError(str(exc)) from exc

    try:
        itinerary = parse_ai_itinerary_content(content)
    except ValueError as exc:
        raise ItineraryGenerationError("AI 返回格式解析失败") from exc

    itinerary = hydrate_itinerary(
        itinerary,
        all_pois=all_pois,
        city_data=request.city_data,
        city_weather=city_weather,
        destinations=request.destinations,
        global_transport=request.global_transport,
        route_shape=getattr(request, "route_shape", None) or "one_way",
    )

    city_centers = itinerary.get("city_centers") or {}
    if request.start_date and any(
        segment.get("tool") == "driving"
        for segment in itinerary.get("transport_guide") or []
    ):
        city_centers = await _ensure_driving_city_centers(
            itinerary,
            settings.amap_key,
        )

    if request.start_date:
        try:
            itinerary["transport_guide"] = await enrich_transport_guide(
                itinerary.get("transport_guide", []),
                request.destinations,
                request.start_date,
                request.budget,
                city_centers=city_centers,
                amap_key=settings.amap_key,
            )
        except Exception as exc:
            _log_warning(
                logger,
                "transport_enrich_failed",
                error_type=exc.__class__.__name__,
            )

    if itinerary.get("days"):
        itinerary = reconcile_itinerary_schedule(
            itinerary,
            destinations=request.destinations,
            start_date=request.start_date,
            pace=request.pace,
        )

    itinerary["quality_checks"] = build_quality_checks(itinerary)
    return itinerary


def _log_warning(logger: logging.Logger | None, event: str, **fields) -> None:
    if logger:
        log_event(logger, logging.WARNING, event, **fields)


async def _ensure_driving_city_centers(
    itinerary: dict,
    amap_key: str,
) -> dict:
    centers = dict(itinerary.get("city_centers") or {})
    driving_cities = {
        str(segment.get(field) or "").strip()
        for segment in itinerary.get("transport_guide") or []
        if segment.get("tool") == "driving"
        for field in ("from_city", "to_city")
        if segment.get(field)
    }

    def has_center(city: str) -> bool:
        center = centers.get(city) or centers.get(city.rstrip("市"))
        if not isinstance(center, dict):
            return False
        try:
            lat = float(center.get("lat") or 0)
            lng = float(center.get("lng") or 0)
        except (TypeError, ValueError):
            return False
        return bool(lat and lng and not (lat == 30.0 and lng == 116.0))

    missing = sorted(city for city in driving_cities if not has_center(city))
    loaded = await asyncio.gather(
        *(get_city_center(amap_key, city) for city in missing),
        return_exceptions=True,
    )
    for city, center in zip(missing, loaded):
        if isinstance(center, Exception) or not isinstance(center, dict):
            continue
        try:
            lat = float(center.get("lat") or 0)
            lng = float(center.get("lng") or 0)
        except (TypeError, ValueError):
            continue
        if lat and lng and not (lat == 30.0 and lng == 116.0):
            centers[city] = center
            centers[city.rstrip("市")] = center

    itinerary["city_centers"] = centers
    return centers
