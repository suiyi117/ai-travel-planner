import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from clients.ai import AiClientError
from planner.generator import (
    ItineraryGenerationError,
    _ensure_driving_city_centers,
    generate_itinerary,
)
from schemas.travel import CityInfo, PlanRequest


def make_settings(*, ai_api_key: str = "test-key") -> SimpleNamespace:
    return SimpleNamespace(
        ai_api_key=ai_api_key,
        ai_base_url="https://example.invalid/v1",
        ai_model="test-model",
        amap_key="amap-key",
    )


def make_request(*, start_date: str = "") -> PlanRequest:
    return PlanRequest(
        destinations=[
            CityInfo(name="Alpha", days=2),
            CityInfo(name="Transit", days=0),
            CityInfo(name="Skipped", days=1, plan_stay=False),
        ],
        days=2,
        start_date=start_date,
        city_data=[],
    )


class ItineraryGeneratorTests(unittest.TestCase):
    def test_driving_center_hydration_only_queries_missing_route_cities(self):
        itinerary = {
            "city_centers": {"西安": {"lat": 34.34, "lng": 108.94}},
            "transport_guide": [
                {
                    "from_city": "北京",
                    "to_city": "西安",
                    "tool": "driving",
                }
            ],
        }

        with patch(
            "planner.generator.get_city_center",
            AsyncMock(return_value={"lat": 39.9, "lng": 116.4, "name": "北京"}),
        ) as center_mock:
            centers = asyncio.run(
                _ensure_driving_city_centers(itinerary, "amap-key")
            )

        center_mock.assert_awaited_once_with("amap-key", "北京")
        self.assertEqual(centers["北京"]["lat"], 39.9)
        self.assertEqual(centers["西安"]["lng"], 108.94)

    def test_missing_ai_key_fails_before_external_calls(self):
        with self.assertRaises(ItineraryGenerationError) as context:
            asyncio.run(generate_itinerary(make_request(), settings=make_settings(ai_api_key=""), logger=None))

        self.assertEqual(context.exception.status_code, 500)

    def test_success_filters_non_stay_cities_and_enriches_transport(self):
        request = make_request(start_date="2026-08-01")
        weather = [{"date": "2026-08-01", "dayweather": "sunny"}]
        hydrated = {"days": [], "transport_guide": [{"segment": "Alpha -> Beta"}]}

        with (
            patch("planner.generator.amap_query_weather", AsyncMock(return_value=weather)) as weather_mock,
            patch("planner.generator.build_itinerary_prompt", return_value=("prompt", [{"name": "Museum"}])) as prompt_mock,
            patch("planner.generator.request_chat_completion", AsyncMock(return_value='{"days": []}')) as ai_mock,
            patch("planner.generator.parse_ai_itinerary_content", return_value={"days": []}),
            patch("planner.generator.hydrate_itinerary", return_value=hydrated) as hydrate_mock,
            patch("planner.generator.enrich_transport_guide", AsyncMock(return_value=[{"source": "real"}])) as enrich_mock,
            patch("planner.generator.build_quality_checks", return_value={"status": "pass"}),
        ):
            result = asyncio.run(generate_itinerary(request, settings=make_settings(), logger=None))

        self.assertEqual(weather_mock.await_count, 1)
        prompt_request, city_weather = prompt_mock.call_args.args
        self.assertIs(prompt_request, request)
        self.assertEqual(city_weather, {"Alpha": weather})
        self.assertEqual(ai_mock.await_args.kwargs["destination_count"], 1)
        self.assertEqual(hydrate_mock.call_args.kwargs["city_weather"], {"Alpha": weather})
        self.assertEqual(enrich_mock.await_args.args[2], "2026-08-01")
        self.assertEqual(result["transport_guide"], [{"source": "real"}])
        self.assertEqual(result["quality_checks"], {"status": "pass"})

    def test_ai_client_error_is_mapped_to_generation_error(self):
        with (
            patch("planner.generator.amap_query_weather", AsyncMock(return_value=[])),
            patch("planner.generator.build_itinerary_prompt", return_value=("prompt", [])),
            patch("planner.generator.request_chat_completion", AsyncMock(side_effect=AiClientError("upstream failed"))),
        ):
            with self.assertRaises(ItineraryGenerationError) as context:
                asyncio.run(generate_itinerary(make_request(), settings=make_settings(), logger=None))

        self.assertEqual(str(context.exception), "upstream failed")

    def test_invalid_ai_json_is_mapped_to_generation_error(self):
        with (
            patch("planner.generator.amap_query_weather", AsyncMock(return_value=[])),
            patch("planner.generator.build_itinerary_prompt", return_value=("prompt", [])),
            patch("planner.generator.request_chat_completion", AsyncMock(return_value="not-json")),
            patch("planner.generator.parse_ai_itinerary_content", side_effect=ValueError("bad json")),
        ):
            with self.assertRaises(ItineraryGenerationError):
                asyncio.run(generate_itinerary(make_request(), settings=make_settings(), logger=None))

    def test_weather_and_transport_failures_are_logged_and_do_not_abort(self):
        logger = MagicMock()

        async def weather_failure(_key, _city, *, on_error):
            on_error(RuntimeError("weather unavailable"))
            return []

        with (
            patch("planner.generator.amap_query_weather", weather_failure),
            patch("planner.generator.build_itinerary_prompt", return_value=("prompt", [])),
            patch("planner.generator.request_chat_completion", AsyncMock(return_value='{"days": []}')),
            patch("planner.generator.parse_ai_itinerary_content", return_value={"days": []}),
            patch("planner.generator.hydrate_itinerary", return_value={"days": [], "transport_guide": []}),
            patch("planner.generator.enrich_transport_guide", AsyncMock(side_effect=RuntimeError("transport unavailable"))),
            patch("planner.generator.build_quality_checks", return_value={"status": "warning"}),
            patch("planner.generator.log_event") as log_event_mock,
        ):
            result = asyncio.run(
                generate_itinerary(make_request(start_date="2026-08-01"), settings=make_settings(), logger=logger)
            )

        events = [call.args[2] for call in log_event_mock.call_args_list]
        self.assertEqual(events, ["weather_query_failed", "transport_enrich_failed"])
        self.assertEqual(result["quality_checks"], {"status": "warning"})


if __name__ == "__main__":
    unittest.main()
