"""Hard-constraint validation for trip drafts — structural and logical checks."""

from schemas.draft import TripDraft


def validate_constraints(draft: TripDraft) -> list[dict]:
    """Return a list of constraint violations.

    Returns an empty list when the draft is internally consistent
    with all hard constraints satisfied.
    """
    violations: list[dict] = []

    city_ids = {city.id for city in draft.city_stops}
    day_ids = {day.id for day in draft.days}
    node_by_id = {node.id: node for node in draft.nodes}

    # --- structural duplicates ---
    seen_nodes = set()
    for day in draft.days:
        for node_id in day.node_ids:
            if node_id in seen_nodes:
                violations.append({"code": "duplicate_node", "node_id": node_id, "day_id": day.id})
            seen_nodes.add(node_id)

    route_ids = draft.route.get("ordered_node_ids", []) if draft.route else []
    route_set = set(route_ids)
    if len(route_ids) != len(route_set):
        violations.append({"code": "duplicate_route_node"})

    # --- reference integrity ---
    for day in draft.days:
        if day.primary_city_id not in city_ids:
            violations.append(
                {"code": "unknown_day_city", "city_id": day.primary_city_id, "day_id": day.id}
            )
        for node_id in day.node_ids:
            if node_id not in node_by_id:
                violations.append({"code": "unknown_node", "node_id": node_id, "day_id": day.id})

    for node_id in route_ids:
        if node_id not in node_by_id:
            violations.append({"code": "unknown_route_node", "node_id": node_id})

    for node in draft.nodes:
        if node.city_id not in city_ids:
            violations.append({"code": "unknown_node_city", "node_id": node.id, "city_id": node.city_id})

    # --- city day capacity ---
    city_day_counts: dict[str, int] = {}
    for day in draft.days:
        city_day_counts[day.primary_city_id] = city_day_counts.get(day.primary_city_id, 0) + 1
    for city in draft.city_stops:
        if city_day_counts.get(city.id, 0) > city.days:
            violations.append({"code": "city_day_capacity", "city_id": city.id})

    # --- constraint integrity ---
    scheduled_by_day: dict[str, set[str]] = {}
    for day in draft.days:
        scheduled_by_day[day.id] = set(day.node_ids)

    for node in draft.nodes:
        # fixed_time requires a time_window
        if node.constraints.fixed_time and (
            not node.schedule.time_window or not node.schedule.time_window.strip()
        ):
            violations.append({"code": "fixed_time_missing", "node_id": node.id})

        # unknown schedule day reference
        if node.schedule.day_id and node.schedule.day_id not in day_ids:
            violations.append({"code": "unknown_schedule_day", "node_id": node.id, "day_id": node.schedule.day_id})

        # constraint checks only apply to scheduled nodes
        if node.status == "wishlist" or node.status == "removed":
            continue

        # fixed_day requires the node to be scheduled in SOME day
        if node.constraints.fixed_day:
            scheduled = any(node.id in ids for ids in scheduled_by_day.values())
            if not scheduled:
                violations.append({"code": "fixed_day_mismatch", "node_id": node.id})

        # fixed_order in self_drive requires route membership
        if draft.mode == "self_drive" and node.constraints.fixed_order:
            if node.id not in route_set:
                violations.append({"code": "fixed_order_route_missing", "node_id": node.id})

    return violations
