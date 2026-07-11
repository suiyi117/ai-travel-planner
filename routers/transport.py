from typing import Any
import logging

from fastapi import APIRouter, HTTPException, Query

from core.observability import log_event
from planner.transport import estimate_train_price, resolve_train_type_pref
from schemas.draft import DrivingRouteRequest
from services.driving_route_service import build_driving_route
from services.flight_service import CITY_AIRPORT_MAP, get_airport_info, search_flights
from services.train_service import _get_station_map, search_train_by_number, search_trains


router = APIRouter(prefix="/api/transport", tags=["transport"])


@router.get("/trains")
async def query_trains(
    from_city: str = Query(..., description="出发城市"),
    to_city: str = Query(..., description="到达城市"),
    date: str = Query(..., description="日期 YYYY-MM-DD"),
    budget: str = Query("", description="预算档位，用于经济型慢车筛选"),
):
    """查询高铁/火车班次"""
    if not from_city or not to_city:
        raise HTTPException(status_code=400, detail="请提供出发城市和到达城市")

    try:
        trains = await search_trains(from_city, to_city, date, prefer_train_type=resolve_train_type_pref(budget))
        for train in trains:
            train["price"] = estimate_train_price(train.get("duration_minutes", 0), train.get("train_type", ""))

            seats = train.get("seats", {})
            seats_info = ""
            if seats:
                second_class = seats.get("二等座")
                hard_seat = seats.get("硬座")
                status = second_class or hard_seat or list(seats.values())[0]
                if status.isdigit():
                    status = f"{status}张"
                seat_name = "二等座" if second_class else ("硬座" if hard_seat else list(seats.keys())[0])
                seats_info = f" ({seat_name}:{status})"

            train["desc"] = train.get("desc", "") + seats_info

        return {
            "status": "ok",
            "trains": trains,
            "total": len(trains),
            "source": "12306" if trains else "fallback",
            "from_city": from_city,
            "to_city": to_city,
            "date": date,
        }
    except Exception as exc:
        return {
            "status": "error",
            "message": f"查询失败: {str(exc)}",
            "trains": [],
            "source": "error",
        }


@router.get("/flights")
async def query_flights(
    from_city: str = Query(..., description="出发城市"),
    to_city: str = Query(..., description="到达城市"),
    date: str = Query(..., description="日期 YYYY-MM-DD"),
):
    """查询航班"""
    if not from_city or not to_city:
        raise HTTPException(status_code=400, detail="请提供出发城市和到达城市")

    try:
        flights = await search_flights(from_city, to_city, date)
        return {
            "status": "ok",
            "flights": flights,
            "total": len(flights),
            "source": "api" if flights and flights[0].get("source") != "典型航线数据" else ("builtin" if flights else "none"),
            "from_city": from_city,
            "to_city": to_city,
            "date": date,
        }
    except Exception as exc:
        return {
            "status": "error",
            "message": f"查询失败: {str(exc)}",
            "flights": [],
            "source": "error",
        }


@router.get("/search")
async def search_transport(
    keyword: str = Query(..., description="车次号/航班号"),
    date: str = Query("", description="日期 YYYY-MM-DD"),
):
    """按车次号/航班号搜索"""
    if not keyword:
        raise HTTPException(status_code=400, detail="请输入车次号或航班号")

    keyword = keyword.strip().upper()
    first_char = keyword[0] if keyword else ""

    result: dict[str, Any] = {"keyword": keyword, "type": "", "results": []}

    if first_char in "GDKTZCSYL":
        result["type"] = "train"
        train = await search_train_by_number(keyword, date)
        if train:
            result["results"] = [train]
    else:
        result["type"] = "flight_or_train"
        train = await search_train_by_number(keyword, date)
        if train:
            result["results"].append({"type": "train", **train})
        result["note"] = "未找到匹配结果" if not result["results"] else ""

    return result


@router.get("/stations")
async def query_stations(
    city: str = Query(..., description="城市名"),
):
    """查询城市的火车站和机场信息"""
    if not city:
        raise HTTPException(status_code=400, detail="请提供城市名")

    station_map = _get_station_map()
    clean_city = city.rstrip("市")

    stations = []
    if clean_city in station_map:
        for code, name in station_map[clean_city]:
            stations.append({"code": code, "name": name})

    airports = []
    airport_info = get_airport_info(clean_city)
    if airport_info:
        if clean_city in CITY_AIRPORT_MAP:
            airports = CITY_AIRPORT_MAP[clean_city]
        else:
            airports = [airport_info]

    return {
        "city": city,
        "stations": stations,
        "airports": airports,
    }


def create_driving_router(settings, logger=None) -> APIRouter:
    driving_router = APIRouter(prefix="/api/transport", tags=["transport"])

    @driving_router.post("/driving-route")
    async def driving_route(request: DrivingRouteRequest):
        nodes = [
            {
                "id": node.id,
                "name": node.name,
                "lat": node.location.lat,
                "lng": node.location.lng,
            }
            for node in request.nodes
            if node.location.status == "resolved"
        ]
        if len(nodes) != len(request.nodes):
            raise HTTPException(
                status_code=422,
                detail={"code": "unresolved_route_node", "message": "路线中存在尚未定位的节点"},
            )
        result = await build_driving_route(settings.amap_key, nodes, request.route_shape)
        if result["status"] == "unavailable" and logger:
            log_event(
                logger,
                logging.WARNING,
                "driving_route_partial_failure",
                segment_count=len(result["segments"]),
            )
        return result

    return driving_router
