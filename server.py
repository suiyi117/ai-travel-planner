"""
AI 旅行规划师 - 后端服务
FastAPI 服务，负责 AI 行程生成（POI 搜索由前端 JS API 完成）
支持高铁/火车/航班真实时刻表查询
"""
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from core.observability import configure_logging, install_operability_middleware
from core.settings import load_settings
from routers.location import create_location_router
from routers.planning import create_planning_router
from routers.system import create_system_router
from routers.transport import create_driving_router, router as transport_router
from schemas.travel import CityInfo, PlanRequest

# 导入交通查询服务
from services.train_service import init_station_data

settings = load_settings()
APP_ENV = settings.app_env
ALLOWED_ORIGINS = settings.allowed_origins
EXPOSE_CLIENT_CONFIG = settings.expose_client_config
logger = configure_logging(settings.log_level)

app = FastAPI(title="AI 旅行规划师", version="1.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)
install_operability_middleware(app, APP_ENV, logger)
app.include_router(transport_router)
app.include_router(create_driving_router(settings, logger))
app.include_router(create_planning_router(settings, logger))
app.include_router(create_location_router(settings, logger))
app.include_router(create_system_router(settings))

# ===== 配置 =====
AI_API_KEY = settings.ai_api_key
AI_BASE_URL = settings.ai_base_url
AI_MODEL = settings.ai_model
AMAP_KEY = settings.amap_key
AMAP_SECURITY_KEY = settings.amap_security_key


# ===== 静态文件服务 =====
@app.get("/")
async def serve_index():
    return RedirectResponse(url="/static/index.html")

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.on_event("startup")
async def startup_event():
    """服务启动时初始化"""
    try:
        await init_station_data()
    except Exception as e:
        print(f"[Startup] 车站数据初始化失败（将使用内置映射）: {e}")


if __name__ == "__main__":
    import uvicorn
    print("=" * 50)
    print("  AI 旅行规划师 v1.2.0")
    print("=" * 50)
    print(f"  高德地图 JS API: {'已配置' if AMAP_KEY else '未配置'}")
    print(f"  AI 模型: {AI_MODEL} ({'已配置' if AI_API_KEY else '未配置'})")
    print(f"  火车票查询: 已启用 (12306 公开接口)")
    print(f"  航班查询: {'已配置' if settings.juhe_flight_api_key else '内置数据'} ")
    print(f"  访问地址: http://localhost:8000")
    print("=" * 50)
    uvicorn.run(app, host="0.0.0.0", port=8000)



