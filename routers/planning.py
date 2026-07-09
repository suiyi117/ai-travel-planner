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

    return router
