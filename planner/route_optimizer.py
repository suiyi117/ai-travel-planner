"""Constrained self-drive route optimizer — nearest-neighbor + 2-opt with anchors."""

from __future__ import annotations

STRATEGY_WEIGHTS = {
    "efficient": {"duration": 1.0, "distance": 0.0002, "manual": 1.0},
    "balanced": {"duration": 0.8, "distance": 0.0001, "manual": 5.0},
    "experience": {"duration": 0.5, "distance": 0.00005, "manual": 12.0},
}


class RouteNodeLimitError(ValueError):
    pass


def _edge_score(a: str, b: str, costs: dict, strategy: str) -> float:
    edge = costs.get((a, b)) or {
        "duration_seconds": float("inf"),
        "distance_meters": float("inf"),
    }
    weights = STRATEGY_WEIGHTS[strategy]
    return (
        float(edge.get("duration_seconds") or float("inf")) * weights["duration"]
        + float(edge.get("distance_meters") or float("inf")) * weights["distance"]
    )


def _route_pairs(order: list[str], route_shape: str) -> list[tuple[str, str]]:
    pairs = list(zip(order, order[1:]))
    if route_shape == "round_trip" and len(order) > 1:
        pairs.append((order[-1], order[0]))
    return pairs


def _route_score(
    order: list[str],
    costs: dict,
    route_shape: str,
    strategy: str,
    original: list[str],
) -> float:
    manual_penalty = sum(
        abs(original.index(node_id) - index) for index, node_id in enumerate(order)
    )
    return sum(
        _edge_score(a, b, costs, strategy)
        for a, b in _route_pairs(order, route_shape)
    ) + manual_penalty * STRATEGY_WEIGHTS[strategy]["manual"]


def _nearest_neighbor_seed(
    original: list[str],
    costs: dict,
    locked: set[int],
    strategy: str,
) -> list[str]:
    seeded = list(original)
    boundaries = sorted({0, *locked, len(original) - 1, len(original)})
    for left, right in zip(boundaries, boundaries[1:]):
        if right <= left + 1:
            continue
        block = original[left + 1:right]
        current = original[left]
        ordered: list[str] = []
        remaining = list(block)
        while remaining:
            next_id = min(
                remaining,
                key=lambda node_id: (
                    _edge_score(current, node_id, costs, strategy),
                    original.index(node_id),
                ),
            )
            remaining.remove(next_id)
            ordered.append(next_id)
            current = next_id
        seeded[left + 1:right] = ordered
    return seeded


def optimize_route_order(
    nodes: list[dict],
    costs: dict,
    route_shape: str,
    strategy: str,
) -> list[str]:
    if len(nodes) > 20:
        raise RouteNodeLimitError("route_node_limit_exceeded")
    original = [node["id"] for node in nodes]
    if len(original) < 3:
        return original

    locked = {
        index
        for index, node in enumerate(nodes)
        if node.get("fixed_order")
    }
    locked.add(0)
    if route_shape == "one_way":
        locked.add(len(nodes) - 1)

    best = _nearest_neighbor_seed(original, costs, locked, strategy)
    improved = True
    while improved:
        improved = False
        best_score = _route_score(best, costs, route_shape, strategy, original)
        for left in range(1, len(best) - 1):
            for right in range(left + 1, len(best)):
                if any(index in locked for index in range(left, right + 1)):
                    continue
                candidate = best[:left] + list(reversed(best[left:right + 1])) + best[right + 1:]
                score = _route_score(candidate, costs, route_shape, strategy, original)
                if score < best_score:
                    best, best_score, improved = candidate, score, True
    return best


def split_route_days(
    order: list[str],
    costs: dict,
    max_driving_minutes: int | list[int],
    route_shape: str = "one_way",
) -> list[list[str]]:
    if not order:
        return []
    limits = (
        max_driving_minutes
        if isinstance(max_driving_minutes, list)
        else [max_driving_minutes]
    )
    days: list[list[str]] = [[order[0]]]
    elapsed = 0
    for origin, destination in _route_pairs(order, route_shape):
        limit_seconds = limits[min(len(days) - 1, len(limits) - 1)] * 60
        duration = int((costs.get((origin, destination)) or {}).get("duration_seconds") or 0)
        if len(days[-1]) > 1 and elapsed + duration > limit_seconds:
            days.append([origin, destination])
            elapsed = duration
        else:
            if days[-1][-1] != destination:
                days[-1].append(destination)
            elapsed += duration
    return days


def driving_limit_warnings(
    day_segments: list[list[str]],
    costs: dict,
    max_driving_minutes: int | list[int],
) -> list[dict]:
    limits = (
        max_driving_minutes
        if isinstance(max_driving_minutes, list)
        else [max_driving_minutes]
    )
    warnings: list[dict] = []
    for day_index, segment in enumerate(day_segments):
        limit_seconds = limits[min(day_index, len(limits) - 1)] * 60
        for origin, destination in zip(segment, segment[1:]):
            duration = int((costs.get((origin, destination)) or {}).get("duration_seconds") or 0)
            if duration > limit_seconds:
                warnings.append({
                    "code": "single_segment_over_daily_limit",
                    "from_node_id": origin,
                    "to_node_id": destination,
                    "message": "单段驾驶时间超过每日上限",
                })
    return warnings
