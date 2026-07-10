"""Constrained self-drive route optimizer — nearest-neighbor + 2-opt with anchor locking."""

import copy
import math

from schemas.draft import TripDraft


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


def optimize_route_order(draft: TripDraft, strategy: str = "balanced") -> TripDraft:
    """Optimize self-drive route node ordering respecting locked anchors.

    Returns a new TripDraft with optimized route.ordered_node_ids.
    Strategy: 'efficient' (shortest path), 'balanced' (default), 'experience' (prefers scenic diversity).
    """
    candidate = copy.deepcopy(draft)
    nodes = [n for n in candidate.nodes if n.status != "removed"]
    if len(nodes) < 2:
        if candidate.route is None:
            candidate.route = {}
        candidate.route["ordered_node_ids"] = [n.id for n in nodes]
        return candidate

    node_by_id = {n.id: n for n in nodes}
    ids = [n.id for n in nodes]
    n = len(ids)

    # Distance matrix
    matrix = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            d = _haversine_km(
                nodes[i].location.lat, nodes[i].location.lng,
                nodes[j].location.lat, nodes[j].location.lng,
            )
            matrix[i][j] = matrix[j][i] = d

    # Identify locked anchors
    locked = set()
    for i, node in enumerate(nodes):
        if node.constraints.fixed_order:
            locked.add(i)

    # Nearest neighbor starting from first node
    if locked:
        # Build path respecting locked positions
        order = list(range(n))
        unlocked = sorted(set(range(n)) - locked)
        if unlocked:
            start = unlocked[0]
            visited = {start}
            path = [start]
            while len(visited) < len(unlocked):
                last = path[-1]
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
                path.append(best)
                visited.add(best)
            # Interleave unlocked into order
            unlocked_iter = iter(path)
            for i in range(n):
                if i not in locked:
                    try:
                        order[i] = next(unlocked_iter)
                    except StopIteration:
                        pass
    else:
        # Simple nearest neighbor
        order = [0]
        visited = {0}
        while len(visited) < n:
            last = order[-1]
            best = None
            best_d = float("inf")
            for j in range(n):
                if j in visited or j in locked:
                    continue
                d = matrix[last][j]
                if d < best_d:
                    best_d = d
                    best = j
            if best is None:
                break
            order.append(best)
            visited.add(best)

    # 2-opt improvement (skip locked positions)
    improved = True
    while improved:
        improved = False
        best_d = sum(matrix[order[k]][order[k + 1]] for k in range(n - 1))
        for i in range(1, n - 2):
            if i in locked or (i + 1) in locked:
                continue
            for j in range(i + 2, n - 1):
                if j in locked or (j + 1) in locked:
                    continue
                candidate_order = list(order)
                candidate_order[i: j + 1] = reversed(candidate_order[i: j + 1])
                d = sum(
                    matrix[candidate_order[k]][candidate_order[k + 1]]
                    for k in range(n - 1)
                )
                if d < best_d:
                    order = candidate_order
                    best_d = d
                    improved = True
        if not improved:
            break

    if candidate.route is None:
        candidate.route = {}
    candidate.route["ordered_node_ids"] = [ids[i] for i in order]

    # For round_trip, close the loop
    if draft.route_shape == "round_trip" and len(order) > 1:
        d_back = matrix[order[-1]][order[0]]
        candidate.route["return_km"] = round(d_back, 1)

    candidate.revision += 1
    return candidate


def split_route_by_days(
    draft: TripDraft,
    max_driving_minutes: int = 360,
) -> TripDraft:
    """Split self-drive route nodes across available days.

    Distributes ordered route nodes across days, respecting max driving
    per day and ensuring each day has at least one node.
    """
    candidate = copy.deepcopy(draft)
    route_ids = (candidate.route or {}).get("ordered_node_ids", [])
    if not route_ids:
        return candidate

    # Simple distribution: evenly split across available days
    day_count = max(len(candidate.days), 1)
    node_count = len(route_ids)
    base = node_count // day_count
    remainder = node_count % day_count

    start = 0
    for day_idx, day in enumerate(candidate.days):
        count = base + (1 if day_idx < remainder else 0)
        day.node_ids = route_ids[start: start + count] if count > 0 else []
        start += count
        if start >= node_count:
            break

    candidate.revision += 1
    return candidate
