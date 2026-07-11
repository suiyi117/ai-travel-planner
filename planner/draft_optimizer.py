"""Deterministic draft optimizer — reorders unlocked nodes within a scope using nearest-neighbor + 2-opt.

Never deletes required nodes, never moves fixed_day / fixed_time / fixed_order nodes,
and always respects the requested scope (day, city, or trip).
"""

from __future__ import annotations

import copy
import math

from planner.route_optimizer import (
    RouteNodeLimitError,
    driving_limit_warnings,
    optimize_route_order,
    split_route_days,
)
from schemas.draft import CandidateDiff, ChangePosition, OptimizeScope, TripDraft
from services.driving_route_service import build_driving_cost_matrix, build_driving_route


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlng / 2) ** 2
    )
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _distance_matrix(nodes: list) -> list[list[float]]:
    n = len(nodes)
    matrix = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            d = _haversine_km(
                nodes[i].location.lat,
                nodes[i].location.lng,
                nodes[j].location.lat,
                nodes[j].location.lng,
            )
            matrix[i][j] = matrix[j][i] = d
    return matrix


def _nearest_neighbor_order(matrix: list[list[float]], locked_indices: set[int]) -> list[int]:
    n = len(matrix)
    if n == 0:
        return []
    unlocked = sorted(set(range(n)) - locked_indices)
    if not unlocked:
        return list(range(n))
    visited = {unlocked[0]}
    order = [unlocked[0]]
    while len(visited) < len(unlocked):
        last = order[-1]
        best = None
        best_d = float("inf")
        for j in unlocked:
            if j in visited:
                continue
            d = matrix[last][j]
            if d < best_d:
                best_d = d
                best = j
        if best is None:
            break
        order.append(best)
        visited.add(best)
    full_order = list(range(n))
    unlocked_iter = iter(order)
    for i in range(n):
        if i in locked_indices:
            continue
        full_order[i] = next(unlocked_iter, i)
    return full_order


def _two_opt_swap(order: list[int], matrix: list[list[float]], locked: set[int]) -> list[int]:
    n = len(order)
    if n < 4:
        return order
    improved = True
    best = list(order)
    while improved:
        improved = False
        best_d = sum(matrix[best[k]][best[k + 1]] for k in range(n - 1))
        for i in range(1, n - 2):
            if i in locked or (i + 1) in locked:
                continue
            for j in range(i + 2, n - 1):
                if j in locked or (j + 1) in locked:
                    continue
                candidate = list(best)
                candidate[i : j + 1] = reversed(candidate[i : j + 1])
                d = sum(matrix[candidate[k]][candidate[k + 1]] for k in range(n - 1))
                if d < best_d:
                    best = candidate
                    best_d = d
                    improved = True
    return best


def _positions(draft: TripDraft) -> dict[str, dict]:
    positions: dict[str, dict] = {}
    for day in draft.days:
        for index, node_id in enumerate(day.node_ids):
            positions[node_id] = {"day_id": day.id, "index": index, "route_index": None}
    route_ids = (draft.route or {}).get("ordered_node_ids") or []
    for route_index, node_id in enumerate(route_ids):
        if node_id in positions:
            positions[node_id]["route_index"] = route_index
        else:
            positions[node_id] = {"day_id": None, "index": None, "route_index": route_index}
    return positions


def compute_diff(before: TripDraft, after: TripDraft) -> list[CandidateDiff]:
    before_pos = _positions(before)
    after_pos = _positions(after)
    names = {node.id: node.name for node in before.nodes}
    names.update({node.id: node.name for node in after.nodes})
    all_ids = set(before_pos) | set(after_pos)
    diffs: list[CandidateDiff] = []
    for node_id in sorted(all_ids):
        name = names.get(node_id, node_id)
        left = before_pos.get(node_id)
        right = after_pos.get(node_id)
        if left is None and right is not None:
            diffs.append(CandidateDiff(type="add", node_id=node_id, node_name=name, to_position=ChangePosition(day_id=right.get("day_id"), index=right.get("index"), route_index=right.get("route_index")), reason="用户手动添加"))
        elif left is not None and right is None:
            diffs.append(CandidateDiff(type="remove", node_id=node_id, node_name=name, from_position=ChangePosition(day_id=left.get("day_id"), index=left.get("index"), route_index=left.get("route_index")), reason="优化器建议移除"))
        elif left != right:
            diffs.append(CandidateDiff(type="move", node_id=node_id, node_name=name, from_position=ChangePosition(day_id=(left or {}).get("day_id"), index=(left or {}).get("index"), route_index=(left or {}).get("route_index")), to_position=ChangePosition(day_id=(right or {}).get("day_id"), index=(right or {}).get("index"), route_index=(right or {}).get("route_index")), reason="优化器调整顺序"))
    return diffs


def optimize_itinerary(draft: TripDraft, scope: OptimizeScope) -> TripDraft:
    candidate = copy.deepcopy(draft)
    node_by_id = {n.id: n for n in candidate.nodes}
    scope_day_ids: set[str] = set()
    if scope.type == "day" and scope.id:
        scope_day_ids = {scope.id}
    elif scope.type == "city" and scope.id:
        scope_day_ids = {d.id for d in candidate.days if d.primary_city_id == scope.id}
    elif scope.type == "trip":
        scope_day_ids = {d.id for d in candidate.days}
    for day in candidate.days:
        if day.id not in scope_day_ids:
            continue
        nodes_in_day = [node_by_id[nid] for nid in day.node_ids if nid in node_by_id]
        if len(nodes_in_day) <= 1:
            continue
        locked_set: set[int] = set()
        for idx, node in enumerate(nodes_in_day):
            if node.constraints.fixed_order or node.constraints.fixed_time:
                locked_set.add(idx)
        matrix = _distance_matrix(nodes_in_day)
        order = _nearest_neighbor_order(matrix, locked_set)
        order = _two_opt_swap(order, matrix, locked_set)
        day.node_ids = [nodes_in_day[i].id for i in order]
        for new_idx, orig_idx in enumerate(order):
            nodes_in_day[orig_idx].manual_rank = new_idx
    candidate.revision = draft.revision + 1
    return candidate


async def optimize_self_drive(draft: TripDraft, amap_key: str) -> tuple[TripDraft, list[str]]:
    candidate = draft.model_copy(deep=True)
    node_by_id = {node.id: node for node in candidate.nodes}
    fallback_order = [node_id for day in candidate.days for node_id in day.node_ids if node_by_id.get(node_id) and node_by_id[node_id].source != "system"]
    requested_order = list((candidate.route or {}).get("ordered_node_ids") or fallback_order)
    if not requested_order:
        requested_order = [node.id for node in candidate.nodes if node.status != "removed" and node.source != "system"]
    resolved_nodes = [node_by_id[node_id] for node_id in requested_order if node_id in node_by_id and node_by_id[node_id].location.status == "resolved"]
    if len(resolved_nodes) < 2:
        raise ValueError("insufficient_resolved_route_nodes")
    if len(resolved_nodes) > 20:
        raise RouteNodeLimitError("route_node_limit_exceeded")
    service_nodes = [{
        "id": node.id,
        "name": node.name,
        "lat": node.location.lat,
        "lng": node.location.lng,
        "fixed_order": bool(node.constraints.fixed_order or node.constraints.fixed_time or any(city.id == node.city_id and city.fixed_order for city in candidate.city_stops)),
    } for node in resolved_nodes]
    costs, source = await build_driving_cost_matrix(amap_key, service_nodes)
    optimized_resolved_ids = optimize_route_order(service_nodes, costs, candidate.route_shape, candidate.strategy)
    resolved_set = set(optimized_resolved_ids)
    resolved_iter = iter(optimized_resolved_ids)
    optimized_ids = [next(resolved_iter) if node_id in resolved_set else node_id for node_id in requested_order]
    default_limits = {"efficient": 240, "balanced": 300, "experience": 360}
    limits = [day.max_driving_minutes or default_limits.get(candidate.strategy, 300) for day in candidate.days] or [default_limits.get(candidate.strategy, 300)]
    chunks = split_route_days(optimized_resolved_ids, costs, limits, candidate.route_shape)
    if candidate.days and len(chunks) > len(candidate.days):
        raise ValueError("daily_driving_limit_exceeded")
    service_by_id = {node["id"]: node for node in service_nodes}
    final_route = await build_driving_route(amap_key, [service_by_id[node_id] for node_id in optimized_resolved_ids], candidate.route_shape)
    matrix_warnings = [] if source == "amap" else [{"code": "cost_matrix_estimated", "message": "道路成本矩阵暂不可用，本次排序使用明确标记的估算值"}]
    candidate.route = {**final_route, "ordered_node_ids": optimized_ids, "day_segments": chunks, "warnings": [*matrix_warnings, *list(final_route.get("warnings") or []), *driving_limit_warnings(chunks, costs, limits)]}
    if candidate.days:
        for day in candidate.days:
            day.node_ids = []
        for index, chunk in enumerate(chunks):
            if index >= len(candidate.days):
                break
            seen = set()
            ordered_day = []
            for node_id in chunk:
                if node_id in seen:
                    continue
                seen.add(node_id)
                ordered_day.append(node_id)
            candidate.days[index].node_ids = ordered_day
    candidate.revision = draft.revision + 1
    return candidate, list(dict.fromkeys([source, final_route.get("source", source)]))


async def optimize_draft(draft: TripDraft, scope: OptimizeScope, amap_key: str = "") -> tuple[TripDraft, list[CandidateDiff], list[str]]:
    if draft.mode == "self_drive":
        candidate, sources = await optimize_self_drive(draft, amap_key)
        return candidate, compute_diff(draft, candidate), sources
    candidate = optimize_itinerary(draft, scope)
    return candidate, compute_diff(draft, candidate), ["draft", "haversine"]
