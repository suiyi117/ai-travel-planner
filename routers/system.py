from fastapi import APIRouter


def create_system_router(settings) -> APIRouter:
    router = APIRouter(tags=["system"])

    @router.get("/api/config")
    async def get_config():
        """Return browser compatibility config without exposing keys by default."""
        return {
            "amap_key": settings.amap_key if settings.expose_client_config else "",
            "amap_security_key": settings.amap_security_key if settings.expose_client_config else "",
            "ai_model": settings.ai_model,
            "ai_configured": bool(settings.ai_api_key),
            "client_config_exposed": settings.expose_client_config,
        }

    @router.get("/api/health")
    async def health_check():
        """Health check."""
        return {
            "status": "ok",
            "environment": settings.app_env,
            "amap_configured": bool(settings.amap_key),
            "client_config_exposed": settings.expose_client_config,
            "ai_configured": bool(settings.ai_api_key),
            "ai_model": settings.ai_model,
            "transport_train_available": True,
            "juhe_key_configured": bool(settings.juhe_flight_api_key),
            "transport_flight_available": True,
        }

    return router
