"""Draft optimization orchestration and stable domain errors."""

from typing import Any

from planner.constraints import validate_constraints
from planner.draft_optimizer import optimize_draft
from planner.route_optimizer import RouteNodeLimitError
from schemas.draft import ApiWarning, OptimizeRequest, OptimizeResponse


class DraftOptimizationError(Exception):
    def __init__(self, status_code: int, detail: str | dict[str, Any]):
        super().__init__(str(detail))
        self.status_code = status_code
        self.detail = detail


async def optimize_plan_draft(request: OptimizeRequest, amap_key: str) -> OptimizeResponse:
    if request.draft.revision != request.base_revision:
        raise DraftOptimizationError(409, "revision conflict")

    violations = validate_constraints(request.draft)
    if violations:
        raise DraftOptimizationError(
            422,
            {"message": "constraint violation", "violations": violations},
        )

    try:
        candidate, diff, data_sources = await optimize_draft(
            request.draft,
            request.scope,
            amap_key,
        )
    except RouteNodeLimitError as exc:
        raise DraftOptimizationError(
            422,
            {
                "code": "route_node_limit_exceeded",
                "message": "单条自驾路线最多支持 20 个已定位节点",
            },
        ) from exc
    except ValueError as exc:
        code = str(exc)
        known_conflicts = {
            "daily_driving_limit_exceeded",
            "fixed_day_route_conflict",
            "insufficient_resolved_route_nodes",
        }
        if code not in known_conflicts:
            raise
        raise DraftOptimizationError(
            422,
            {
                "code": "constraint_conflict",
                "message": code,
                "conflicts": [{"code": code}],
            },
        ) from exc

    warnings = [
        ApiWarning(
            code="unresolved_node",
            node_id=node.id,
            message="地点尚未定位，未参与本次优化",
        )
        for node in candidate.nodes
        if node.location.status == "unresolved"
    ]
    if candidate.route and isinstance(candidate.route.get("warnings"), list):
        warnings.extend(ApiWarning.model_validate(item) for item in candidate.route["warnings"])

    return OptimizeResponse(
        base_revision=request.base_revision,
        candidate=candidate,
        diff=diff,
        warnings=warnings,
        data_sources=data_sources,
    )
