"""Amap driving route service — provider / estimate / unavailable route metrics."""

from __future__ import annotations

import asyncio
import math
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone

import httpx

AMAP_DRIVING_URL = "https://restapi.amap.com/v3/direction/driving"


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlng / 2) ** 2
    )
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def parse_driving_route(data: dict, from_node_id: str, to_node_id: str) -> dict:
    paths = (data.get("route") or {}).get("paths") or []
    if data.get("status") != "1" or not paths:
        raise ValueError("高德驾车路线返回无有效路径")
    path = paths[0]
    cost = path.get("cost") or {}
    polyline: list[list[float]] = []
    raw_polyline = path.get("polyline") or ""
    if not raw_polyline:
        for step in path.get("steps") or []:
            raw_polyline += (";" if raw_polyline and step.get("polyline") else "") + str(
                step.get("polyline") or ""
            )
    for point in str(raw_polyline).split(";"):
        if not point or "," not in point:
            continue
        lng_text, lat_text = point.split(",", 1)
        coordinate = [float(lat_text), float(lng_text)]
        if not polyline or polyline[-1] != coordinate:
            polyline.append(coordinate)
    return {
        "from_node_id": from_node_id,
        "to_node_id": to_node_id,
        "status": "provider",
        "distance_meters": int(float(path.get("distance") or 0)),
        "duration_seconds": int(float(cost.get("duration") or path.get("duration") or 0)),
        "tolls_yuan": float(cost.get("tolls") or path.get("tolls") or 0),
        "polyline": polyline,
    }


async def query_driving_segment(amap_key: str, origin: dict, destination: dict) -> dict:
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(
            AMAP_DRIVING_URL,
            params={
                "key": amap_key,
                "origin": f"{origin['lng']},{origin['lat']}",
                "destination": f"{destination['lng']},{destination['lat']}",
                "strategy": 0,
                "extensions": "all",
            },
        )
    if response.status_code != 200:
        raise RuntimeError(f"高德 API 请求失败: {response.status_code}")
    return parse_driving_route(response.json(), origin["id"], destination["id"])


def _estimate_segment(origin: dict, destination: dict) -> dict:
    distance_meters = round(
        _haversine_km(origin["lat"], origin["lng"], destination["lat"], destination["lng"])
        * 1000
        * 1.25
    )
    return {
        "from_node_id": origin["id"],
        "to_node_id": destination["id"],
        "status": "estimate",
        "distance_meters": distance_meters,
        "duration_seconds": round(distance_meters / 1000 / 60 * 3600),
        "tolls_yuan": None,
        "polyline": [
            [origin["lat"], origin["lng"]],
            [destination["lat"], destination["lng"]],
        ],
    }


def _route_result(
    nodes: list[dict],
    segments: list[dict],
    route_shape: str,
    status: str,
    warnings: list[dict],
) -> dict:
    distance_meters: int | None
    duration_seconds: int | None
    tolls_yuan: float | None
    if status == "unavailable":
        distance_meters = None
        duration_seconds = None
        tolls_yuan = None
    else:
        toll_values = [segment.get("tolls_yuan") for segment in segments]
        distance_meters = sum(int(segment.get("distance_meters") or 0) for segment in segments)
        duration_seconds = sum(int(segment.get("duration_seconds") or 0) for segment in segments)
        tolls_yuan = (
            None
            if any(value is None for value in toll_values)
            else sum(float(value or 0) for value in toll_values)
        )
    totals = {
        "distance_meters": distance_meters,
        "duration_seconds": duration_seconds,
        "tolls_yuan": tolls_yuan,
    }
    polyline = [point for segment in segments for point in segment.get("polyline", [])]
    return {
        "source": "amap" if status == "provider" else "estimate" if status == "estimate" else "partial",
        "status": status,
        "route_shape": route_shape,
        "ordered_node_ids": [node["id"] for node in nodes],
        "segments": segments,
        "totals": totals,
        "polyline": polyline,
        "warnings": warnings,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "total_km": None if distance_meters is None else round(distance_meters / 1000, 1),
        "total_driving_minutes": None if duration_seconds is None else round(duration_seconds / 60),
        "toll_yuan": tolls_yuan,
    }


async def build_driving_route(
    amap_key: str,
    nodes: list[dict],
    route_shape: str,
    fetch_segment: Callable[[str, dict, dict], Awaitable[dict]] = query_driving_segment,
) -> dict:
    route_nodes = list(nodes)
    if len(route_nodes) < 2:
        return _route_result(route_nodes, [], route_shape, "estimate", [{
            "code": "insufficient_nodes",
            "message": "至少需要两个已定位节点",
        }])

    pairs = list(zip(route_nodes, route_nodes[1:]))
    if route_shape == "round_trip":
        pairs.append((route_nodes[-1], route_nodes[0]))

    if not amap_key:
        estimated_segments = [
            _estimate_segment(origin, destination) for origin, destination in pairs
        ]
        return _route_result(
            route_nodes,
            estimated_segments,
            route_shape,
            "estimate",
            [{"code": "route_estimated", "message": "道路接口未配置，当前为估算"}],
        )

    semaphore = asyncio.Semaphore(4)

    async def load_pair(origin: dict, destination: dict):
        async with semaphore:
            return await fetch_segment(amap_key, origin, destination)

    loaded = await asyncio.gather(
        *(load_pair(origin, destination) for origin, destination in pairs),
        return_exceptions=True,
    )
    route_segments: list[dict] = []
    warnings: list[dict] = []
    failed = False
    for (origin, destination), loaded_segment in zip(pairs, loaded):
        if isinstance(loaded_segment, Exception):
            failed = True
            warnings.append({
                "code": "segment_unavailable",
                "from_node_id": origin["id"],
                "to_node_id": destination["id"],
                "message": f"{origin.get('name', origin['id'])} → {destination.get('name', destination['id'])} 道路数据不可用",
            })
            route_segments.append({
                "from_node_id": origin["id"],
                "to_node_id": destination["id"],
                "status": "unavailable",
            })
        else:
            assert not isinstance(loaded_segment, BaseException)
            route_segments.append(loaded_segment)


    return _route_result(
        route_nodes,
        route_segments,
        route_shape,
        "unavailable" if failed else "provider",
        warnings,
    )


async def build_driving_cost_matrix(amap_key: str, nodes: list[dict]) -> tuple[dict, str]:
    def estimate_matrix() -> dict:
        return {
            (origin["id"], destination["id"]): {
                "distance_meters": segment["distance_meters"],
                "duration_seconds": segment["duration_seconds"],
            }
            for origin in nodes
            for destination in nodes
            if origin["id"] != destination["id"]
            for segment in [_estimate_segment(origin, destination)]
        }

    if not amap_key or len(nodes) < 2:
        return estimate_matrix(), "estimate"

    matrix: dict = {}
    try:
        for origin in nodes:
            for destination in nodes:
                if origin["id"] == destination["id"]:
                    continue
                segment = await query_driving_segment(amap_key, origin, destination)
                matrix[(origin["id"], destination["id"])] = {
                    "distance_meters": segment["distance_meters"],
                    "duration_seconds": segment["duration_seconds"],
                }
    except Exception:
        return estimate_matrix(), "estimate"
    return matrix, "amap"
