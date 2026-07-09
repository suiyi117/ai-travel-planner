import asyncio
import logging
from collections.abc import Callable

from clients.ai import AiClientError, request_chat_completion
from clients.amap import query_weather as amap_query_weather
from core.observability import log_event
from planner.itinerary import hydrate_itinerary, parse_ai_itinerary_content
from planner.prompting import build_itinerary_prompt
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
        )
    )
    city_weather = {
        city.name: weather
        for city, weather in zip(request.destinations, weather_results)
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
            destination_count=len(request.destinations),
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
    )

    if request.start_date:
        try:
            itinerary["transport_guide"] = await enrich_transport_guide(
                itinerary.get("transport_guide", []),
                request.destinations,
                request.start_date,
                request.budget,
            )
        except Exception as exc:
            _log_warning(
                logger,
                "transport_enrich_failed",
                error_type=exc.__class__.__name__,
            )

    itinerary["quality_checks"] = build_quality_checks(itinerary)
    return itinerary


def _log_warning(logger: logging.Logger | None, event: str, **fields) -> None:
    if logger:
        log_event(logger, logging.WARNING, event, **fields)
