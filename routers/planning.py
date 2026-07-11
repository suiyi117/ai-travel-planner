import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from core.observability import log_event
from planner.generator import ItineraryGenerationError, generate_itinerary
from planner.optimization import DraftOptimizationError, optimize_plan_draft
from schemas.draft import OptimizeRequest, OptimizeResponse
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

    @router.post("/api/plan/optimize", response_model=OptimizeResponse)
    async def optimize_plan(request: OptimizeRequest) -> OptimizeResponse:
        """Deterministic draft optimizer for itinerary and self-drive modes."""
        try:
            return await optimize_plan_draft(request, settings.amap_key)
        except DraftOptimizationError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
        except Exception as exc:
            if logger:
                log_event(
                    logger,
                    logging.ERROR,
                    "draft_optimization_failed",
                    error_type=exc.__class__.__name__,
                )
            raise HTTPException(status_code=500, detail="行程优化失败，请稍后重试") from exc

    return router
