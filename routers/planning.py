from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from planner.generator import ItineraryGenerationError, generate_itinerary
from schemas.travel import PlanRequest


def create_planning_router(settings, logger) -> APIRouter:
    router = APIRouter(tags=["planning"])

    @router.post("/api/plan")
    async def plan_trip(request: PlanRequest):
        """Main itinerary planning endpoint."""
        if not request.city_data:
            raise HTTPException(status_code=400, detail="未收到景点数据，请检查高德地图 API Key 是否正确")

        has_pois = any(len(c.get("pois", [])) > 0 for c in request.city_data)
        if not has_pois:
            raise HTTPException(status_code=400, detail="所有目的地均未获取到高德景点数据，请检查高德地图 Key")

        try:
            itinerary = await generate_itinerary(request, settings=settings, logger=logger)
        except ItineraryGenerationError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

        return JSONResponse(content=itinerary)

    @router.post("/api/plan/optimize")
    async def optimize_plan(request: dict) -> dict:
        """Deterministic draft optimizer for itinerary and self-drive modes."""
        from planner.constraints import validate_constraints
        from planner.draft_optimizer import optimize_draft
        from planner.route_optimizer import RouteNodeLimitError
        from schemas.draft import OptimizeRequest

        try:
            body = OptimizeRequest.model_validate(request)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        if body.draft.revision != body.base_revision:
            raise HTTPException(status_code=409, detail="revision conflict")
        violations = validate_constraints(body.draft)
        if violations:
            raise HTTPException(
                status_code=422,
                detail={"message": "constraint violation", "violations": violations},
            )
        try:
            candidate, diff, data_sources = await optimize_draft(
                body.draft,
                body.scope,
                settings.amap_key,
            )
        except RouteNodeLimitError as exc:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "route_node_limit_exceeded",
                    "message": "单条自驾路线最多支持 20 个已定位节点",
                },
            ) from exc
        except ValueError as exc:
            code = str(exc)
            if code not in {
                "daily_driving_limit_exceeded",
                "fixed_day_route_conflict",
                "insufficient_resolved_route_nodes",
            }:
                raise HTTPException(status_code=500, detail=str(exc)) from exc
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "constraint_conflict",
                    "message": code,
                    "conflicts": [{"code": code}],
                },
            ) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

        warnings = [
            {
                "code": "unresolved_node",
                "node_id": node.id,
                "message": "地点尚未定位，未参与本次优化",
            }
            for node in candidate.nodes
            if node.location.status == "unresolved"
        ]
        if candidate.route and isinstance(candidate.route.get("warnings"), list):
            warnings.extend(candidate.route.get("warnings") or [])

        return {
            "base_revision": body.base_revision,
            "candidate": candidate.model_dump(mode="json"),
            "diff": [item.model_dump(mode="json") for item in diff],
            "warnings": warnings,
            "data_sources": data_sources,
        }

    return router
