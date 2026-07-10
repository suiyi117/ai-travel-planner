"""Amap driving route service — provides real road distances, duration, and toll estimates."""

import httpx

AMAP_DRIVING_URL = "https://restapi.amap.com/v3/direction/driving"


async def get_driving_route(
    amap_key: str,
    origin: str,   # "lng,lat"
    destination: str,  # "lng,lat"
) -> dict:
    """Query Amap driving directions between two points.

    Returns a dict with distance_km, duration_minutes, toll_yuan,
    and polyline on success; returns degraded estimate on failure.
    """
    if not amap_key:
        return {"status": "degraded", "info": "missing_api_key"}

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                AMAP_DRIVING_URL,
                params={
                    "key": amap_key,
                    "origin": origin,
                    "destination": destination,
                    "strategy": 0,
                    "extensions": "base",
                },
            )
        if response.status_code != 200:
            return {"status": "degraded", "info": f"http_{response.status_code}"}

        data = response.json()
        if data.get("status") != "1" or not data.get("route", {}).get("paths"):
            return {"status": "degraded", "info": data.get("info", "no_route")}

        path = data["route"]["paths"][0]
        return {
            "status": "ok",
            "distance_km": round(float(path.get("distance", 0)) / 1000, 1),
            "duration_minutes": round(float(path.get("duration", 0)) / 60),
            "toll_yuan": float(path.get("tolls", 0)),
            "polyline": path.get("polyline", ""),
        }
    except Exception:
        return {"status": "degraded", "info": "amap_unavailable"}


async def build_cost_matrix(
    amap_key: str,
    nodes: list,  # list of (lat, lng, name) tuples
) -> list[list[dict]]:
    """Build NxN cost matrix with Amap driving data.

    Returns a matrix where matrix[i][j] is the driving cost from node i to node j.
    Each cell is a dict with distance_km, duration_minutes, toll_yuan.
    Diagonal is always zero.
    Degraded cells use haversine estimate.
    """
    import math

    n = len(nodes)
    matrix: list[list[dict]] = [[{
        "distance_km": 0.0,
        "duration_minutes": 0,
        "toll_yuan": 0.0,
        "status": "ok",
    } for _ in range(n)] for _ in range(n)]

    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            lat_i, lng_i, _ = nodes[i]
            lat_j, lng_j, _ = nodes[j]

            # Haversine fallback
            r = 6371.0
            dlat = math.radians(lat_j - lat_i)
            dlng = math.radians(lng_j - lng_i)
            a = (
                math.sin(dlat / 2) ** 2
                + math.cos(math.radians(lat_i))
                * math.cos(math.radians(lat_j))
                * math.sin(dlng / 2) ** 2
            )
            haversine_km = r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

            origin = f"{lng_i},{lat_i}"
            dest = f"{lng_j},{lat_j}"
            result = await get_driving_route(amap_key, origin, dest)

            if result["status"] == "ok":
                matrix[i][j] = {
                    "distance_km": result["distance_km"],
                    "duration_minutes": result["duration_minutes"],
                    "toll_yuan": result["toll_yuan"],
                    "status": "ok",
                }
            else:
                matrix[i][j] = {
                    "distance_km": round(haversine_km, 1),
                    "duration_minutes": round(haversine_km / 60 * 60),
                    "toll_yuan": 0.0,
                    "status": "degraded",
                }

    return matrix


def build_route_segments(
    ordered_ids: list[str],
    node_by_id: dict,
    cost_matrix: list[list[dict]],
    id_to_index: dict,
) -> list[dict]:
    """Build route segments from the ordered node list and cost matrix."""
    segments = []
    total_km = 0.0
    total_min = 0
    total_toll = 0.0

    for k in range(len(ordered_ids) - 1):
        i = id_to_index[ordered_ids[k]]
        j = id_to_index[ordered_ids[k + 1]]
        cell = cost_matrix[i][j]
        segments.append({
            "from_node_id": ordered_ids[k],
            "to_node_id": ordered_ids[k + 1],
            "distance_km": cell["distance_km"],
            "duration_minutes": cell["duration_minutes"],
            "toll_yuan": cell["toll_yuan"],
            "status": cell["status"],
        })
        total_km += cell["distance_km"]
        total_min += cell["duration_minutes"]
        total_toll += cell["toll_yuan"]

    return segments, {
        "total_km": round(total_km, 1),
        "total_driving_minutes": total_min,
        "toll_yuan": round(total_toll, 1),
        "segments": segments,
    }
