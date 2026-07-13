import json

from planner.transport import (
    build_quality_checks,
    build_segments_from_destinations,
    nearest_neighbor_order,
)


def strip_markdown_code_block(content: str) -> str:
    """Remove optional markdown code fences from an AI JSON response."""
    text = str(content or "").strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()


def repair_truncated_json(text: str):
    """Try to repair JSON text truncated near the end of an object/array."""
    if not text:
        return None

    stack: list[str] = []
    in_string = False
    escape = False
    candidates: list[tuple[int, list[str]]] = []

    for i, ch in enumerate(text):
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue

        if ch == '"':
            in_string = True
        elif ch in "{[":
            stack.append(ch)
        elif ch in "}]":
            if stack:
                stack.pop()
            candidates.append((i + 1, list(stack)))

    attempts = 0
    for cut_index, stack_snapshot in reversed(candidates):
        if attempts >= 20:
            break
        attempts += 1

        snippet = text[:cut_index].rstrip()
        while snippet.endswith(","):
            snippet = snippet[:-1].rstrip()

        closers = "".join("}" if b == "{" else "]" for b in reversed(stack_snapshot))
        candidate_json = snippet + closers

        try:
            result = json.loads(candidate_json)
        except json.JSONDecodeError:
            continue

        if isinstance(result, dict):
            return result

    return None


def parse_ai_itinerary_content(content: str) -> dict:
    """Parse an AI itinerary JSON response, including common malformed wrappers."""
    text = strip_markdown_code_block(content)
    try:
        result = json.loads(text)
        if isinstance(result, dict):
            return result
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    end = text.rfind("}") + 1
    if start >= 0 and end > start:
        candidate = text[start:end]
        try:
            result = json.loads(candidate)
            if isinstance(result, dict):
                return result
        except json.JSONDecodeError:
            repaired = repair_truncated_json(candidate)
            if repaired is not None:
                return repaired

    raise ValueError("AI 返回格式解析失败")


def collect_poi_metadata(all_pois: list[dict]) -> dict:
    return {
        p["name"]: {
            "lat": p.get("lat", 0),
            "lng": p.get("lng", 0),
            "rating": p.get("rating", ""),
            "address": p.get("address", ""),
            "tel": p.get("tel", ""),
            "opentime": p.get("opentime", ""),
        }
        for p in all_pois
        if p.get("name")
    }


def merge_poi_metadata(itinerary: dict, all_pois: list[dict]) -> dict:
    poi_coords = collect_poi_metadata(all_pois)
    for day_plan in itinerary.get("days", []):
        for slot in ["morning", "afternoon"]:
            for spot in day_plan.get(slot, []):
                name = spot.get("name", "")
                if name in poi_coords:
                    spot.update(poi_coords[name])
    return itinerary


def order_daily_pois(itinerary: dict) -> dict:
    for day_plan in itinerary.get("days", []):
        for slot in ("morning", "afternoon"):
            if isinstance(day_plan.get(slot), list):
                day_plan[slot] = nearest_neighbor_order(day_plan[slot])
    return itinerary


def city_centers_from_city_data(city_data: list[dict]) -> dict:
    centers = {}
    for item in city_data:
        city_name = item.get("city", "")
        center = item.get("center", {})
        if city_name and center:
            centers[city_name] = center
    return centers


def hydrate_itinerary(
    itinerary: dict,
    *,
    all_pois: list[dict],
    city_data: list[dict],
    city_weather: dict,
    destinations: list,
    global_transport: str,
    route_shape: str = "one_way",
) -> dict:
    """Apply deterministic backend enrichments to a parsed itinerary."""
    merge_poi_metadata(itinerary, all_pois)
    order_daily_pois(itinerary)

    itinerary["city_centers"] = city_centers_from_city_data(city_data)
    itinerary["city_weather"] = city_weather
    itinerary["pois"] = all_pois[:20]
    itinerary["transport_guide"] = build_segments_from_destinations(
        destinations,
        global_transport,
        itinerary.get("transport_guide", []),
        route_shape=route_shape,
    )
    itinerary["quality_checks"] = build_quality_checks(itinerary)
    return itinerary
