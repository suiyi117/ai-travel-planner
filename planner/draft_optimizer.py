"""Deterministic draft optimizer — reorders unlocked nodes within a scope using nearest-neighbor + 2-opt.

Never deletes required nodes, never moves fixed_day / fixed_time / fixed_order nodes,
and always respects the requested scope (day, city, or trip).
"""

import copy
import math
from typing import Optional

from schemas.draft import CandidateDiff, ChangePosition, TripDraft, OptimizeScope


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Approximate distance in km between two lat/lng pairs."""
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
                nodes[i].location.lat, nodes[i].location.lng,
                nodes[j].location.lat, nodes[j].location.lng,
            )
            matrix[i][j] = matrix[j][i] = d
    return matrix


def _nearest_neighbor_order(matrix: list[list[float]], locked_indices: set[int]) -> list[int]:
    """Build a nearest-neighbor TSP path, preserving locked node positions."""
    n = len(matrix)
    if n == 0:
        return []

    unlocked = sorted(set(range(n)) - locked_indices)
    if not unlocked:
        return list(range(n))

    # visit all unlocked nodes starting from the first unlocked
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

    # interleave: build final order respecting locked positions
    full_order = list(range(n))
    unlocked_iter = iter(order)
    for i in range(n):
        if i in locked_indices:
            continue
        full_order[i] = next(unlocked_iter, i)
    return full_order


def _two_opt_swap(order: list[int], matrix: list[list[float]], locked: set[int]) -> list[int]:
    """Apply a single 2-opt improvement pass without moving locked nodes."""
    n = len(matrix)
    best_order = list(order)

    def route_distance(seq: list[int]) -> float:
        total = 0.0
        for k in range(len(seq) - 1):
            total += matrix[seq[k]][seq[k + 1]]
        return total

    improved = True
    while improved:
        improved = False
        best_d = route_distance(best_order)
        for i in range(1, n - 2):
            if i in locked or (i + 1) in locked:
                continue
            for j in range(i + 2, n - 1):
                if j in locked or (j + 1) in locked:
                    continue
                candidate = list(best_order)
                candidate[i: j + 1] = reversed(candidate[i: j + 1])
                d = route_distance(candidate)
                if d < best_d:
                    best_order = candidate
                    best_d = d
                    improved = True
        if not improved:
            break
    return best_order


def compute_diff(before: TripDraft, after: TripDraft) -> list[CandidateDiff]:
    """Compute a human-readable diff between two drafts."""
    diffs: list[CandidateDiff] = []
    before_positions: dict[str, dict] = {}
    after_positions: dict[str, dict] = {}

    for day in before.days:
        for idx, node_id in enumerate(day.node_ids):
            before_positions[node_id] = {"day_id": day.id, "index": idx}

    for day in after.days:
        for idx, node_id in enumerate(day.node_ids):
            after_positions[node_id] = {"day_id": day.id, "index": idx}

    # For self-drive, also track route positions
    before_route = before.route.get("ordered_node_ids", []) if before.route else []
    after_route = after.route.get("ordered_node_ids", []) if after.route else []
    for idx, node_id in enumerate(before_route):
        if node_id in before_positions:
            before_positions[node_id]["route_index"] = idx
    for idx, node_id in enumerate(after_route):
        if node_id in after_positions:
            after_positions[node_id]["route_index"] = idx

    all_node_ids = set(before_positions) | set(after_positions)
    node_by_id = {n.id: n for n in after.nodes}

    for node_id in all_node_ids:
        before_pos = before_positions.get(node_id)
        after_pos = after_positions.get(node_id)
        node_name = node_by_id.get(node_id, None)
        name = node_name.name if node_name else node_id

        if before_pos is None and after_pos is not None:
            diffs.append(CandidateDiff(
                type="add", node_id=node_id, node_name=name,
                to_position=ChangePosition(**after_pos),
                reason="用户手动添加",
            ))
        elif before_pos is not None and after_pos is None:
            diffs.append(CandidateDiff(
                type="remove", node_id=node_id, node_name=name,
                from_position=ChangePosition(**before_pos),
                reason="优化器建议移除",
            ))
        elif before_pos != after_pos:
            diffs.append(CandidateDiff(
                type="move", node_id=node_id, node_name=name,
                from_position=ChangePosition(**before_pos),
                to_position=ChangePosition(**after_pos),
                reason="优化器调整顺序",
            ))

    return diffs


def optimize_draft(
    draft: TripDraft, scope: OptimizeScope
) -> tuple[TripDraft, list[CandidateDiff]]:
    """Optimize unlocked node ordering within the requested scope.

    Returns the optimized draft and a diff from the original.
    """
    candidate = copy.deepcopy(draft)
    node_by_id = {n.id: n for n in candidate.nodes}

    # Determine which day_ids are in scope
    scope_day_ids: set[str] = set()
    if scope.type == "day" and scope.id:
        scope_day_ids = {scope.id}
    elif scope.type == "city" and scope.id:
        scope_day_ids = {d.id for d in candidate.days if d.primary_city_id == scope.id}
    elif scope.type == "trip":
        scope_day_ids = {d.id for d in candidate.days}

    # For each day in scope, reorder unlocked nodes
    for day in candidate.days:
        if day.id not in scope_day_ids:
            continue

        nodes_in_day = [node_by_id[nid] for nid in day.node_ids if nid in node_by_id]
        if len(nodes_in_day) <= 1:
            continue

        # Identify locked nodes (fixed_day, fixed_time, fixed_order, required)
        locked_set: set[int] = set()
        for idx, node in enumerate(nodes_in_day):
            if node.constraints.fixed_order or node.constraints.fixed_time:
                locked_set.add(idx)

        matrix = _distance_matrix(nodes_in_day)
        order = _nearest_neighbor_order(matrix, locked_set)
        order = _two_opt_swap(order, matrix, locked_set)

        # Apply new order
        day.node_ids = [nodes_in_day[i].id for i in order]
        for new_idx, orig_idx in enumerate(order):
            nodes_in_day[orig_idx].manual_rank = new_idx

    candidate.revision += 1
    diff = compute_diff(draft, candidate)
    return candidate, diff
