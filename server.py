"""
AI 旅行规划师 - 后端服务
FastAPI 服务，负责 AI 行程生成（POI 搜索由前端 JS API 完成）
支持高铁/火车/航班真实时刻表查询
"""
import os
import json
import re
import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv
import asyncio

load_dotenv()

# 导入交通查询服务
from services.train_service import (
    search_trains, search_train_by_number, init_station_data,
    download_station_map, _get_station_map, _find_station_code
)
from services.flight_service import search_flights, get_airport_info

app = FastAPI(title="AI 旅行规划师", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ===== 配置 =====
AI_API_KEY = os.getenv("AI_API_KEY", "")
AI_BASE_URL = os.getenv("AI_BASE_URL", "https://api.openai.com/v1")
AI_MODEL = os.getenv("AI_MODEL", "gpt-4o-mini")
AMAP_KEY = os.getenv("AMAP_KEY", "")  # 传给前端 JS API 用
AMAP_SECURITY_KEY = os.getenv("AMAP_SECURITY_KEY", "")


# ===== 数据模型 =====
class CityInfo(BaseModel):
    name: str
    days: Optional[int] = None
    transport: Optional[str] = None  # 代表从前一个城市到当前城市的交通工具指定 (auto/train/plane/driving)

class PlanRequest(BaseModel):
    destinations: list[CityInfo]
    days: int = 3
    departure: str = ""
    pace: str = "休闲轻松"
    budget: str = "舒适型"
    interests: str = ""
    city_data: list[dict] = []
    global_transport: str = "auto"   # 全局交通偏好 (auto/train/plane/driving)
    start_date: str = ""  # 出发日期 YYYY-MM-DD，用于查询真实交通班次


# ===== AI 行程生成 =====
async def generate_itinerary(request: PlanRequest) -> dict:
    """调用 AI 生成多城市旅行行程"""
    if not AI_API_KEY:
        raise HTTPException(status_code=500, detail="未配置 AI API Key (AI_API_KEY)")

    # 1. 整理城市及其天数信息
    dest_cities = []
    dest_names = []
    for c in request.destinations:
        dest_names.append(c.name)
        days_info = f"（规划 {c.days} 天）" if c.days else "（停留天数未指定，请由你根据景点分配天数）"
        dest_cities.append(f"- {c.name}{days_info}")
    
    cities_str = "\n".join(dest_cities)
    destinations_list_str = " -> ".join(dest_names)

    # 2. 整理各个城市的可用景点数据
    poi_list_text = ""
    all_pois = []
    for city_item in request.city_data:
        city_name = city_item.get("city", "")
        pois = city_item.get("pois", [])
        
        # 将 POI 放入扁平列表中，方便后续合并经纬度
        all_pois.extend(pois)
        
        # 动态决定每个城市传给 AI 的景点上限，最多截取 20 个（防止总数过多导致 Token 爆炸）
        c_days = city_item.get("days") or (request.days // len(request.destinations)) or 2
        max_pois = min(20, max(12, c_days * 6))
        
        poi_list_text += f"\n### {city_name} 的可用候选景点：\n"
        if not pois:
            poi_list_text += "（无高德景点数据，请直接根据你的知识库规划该城市的知名景点）\n"
        for i, p in enumerate(pois[:max_pois], 1):
            rating = f"评分{p.get('rating','')}" if p.get('rating') else ""
            poi_list_text += f"{i}. {p['name']}（{p.get('type','')}，{rating}，地址:{p.get('address','')}）\n"

    # 3. 构造交通方式约束
    trans_map = {
        "auto": "智能混合推荐",
        "train": "高铁/火车优先",
        "plane": "飞机优先",
        "driving": "自驾优先"
    }
    transport_rules = []
    transport_rules.append(f"- 【全局城际出行偏好】：{trans_map.get(request.global_transport, '智能混合推荐')}")
    
    # 提取并组装分段交通限制
    for i in range(1, len(request.destinations)):
        prev = request.destinations[i-1].name
        curr = request.destinations[i].name
        trans = request.destinations[i].transport
        if trans and trans != "auto":
            trans_zh = {"train": "高铁", "plane": "飞机", "driving": "自驾", "bus": "大巴"}.get(trans, "智能推荐")
            transport_rules.append(f"- 【特指分段出行限制】：从 【{prev}】 前往 【{curr}】 时，必须使用【{trans_zh}】进行城际转移。")
            
    transport_rules_str = "\n".join(transport_rules)

    prompt = """你是一位资深旅行规划师。请根据以下信息，为用户规划一个共 [DAYS] 天的多目的地旅行行程。

## 旅行基本信息
- 出发地：[DEPARTURE]
- 目的地路线：[ROUTE]
- 目的地各城市说明：
[CITIES_DETAIL]
- 总天数：[DAYS] 天
- 旅行节奏：[PACE]
- 预算水平：[BUDGET]
- 兴趣偏好：[INTERESTS]

## 城际中转交通约束（重要，必须严格遵守）
[TRANSPORT_RULES]

## 各城市的真实候选景点数据（高德地图真实景点，请优先排编这些景点）
[POI_LIST]

## 规划要求
1. **城际衔接与交通**：合理安排跨城市旅行的路线顺序。当某天发生目的地切换时（例如从 A 城市转移到 B 城市），请在当天日程描述中明确说明城际交通的建议与过渡安排（例如若指定为自驾，描述为“自驾前往，车程约 X 小时”；若指定为飞机，描述为“前往机场乘坐航班前往，飞行约 X 小时”；若指定为高铁，描述为“乘坐高铁前往，车程约 X 小时”）。
2. **交通时间与景点时间合理结合（核心要求）**：如果这一天发生了城际转移，请你查询你在此日推荐的首选交通车次或航班的时间段（即 `transport_guide` 对应路段的 `options` 中的第一个首选班次的时间）。当天安排的景点游玩时间段（每个景点的 `"time"` 属性）**必须与首选车次/航班时间段完全避开**，绝不能发生重合冲突！
   - 例如：如果首选车次为 09:30 - 11:15，那么上午的景点应安排在 13:00 之后，或者上午完全不排景点（留空），或者只在 09:00 之前排一个极短的出发城市活动。
   - 景点的具体分布应根据中转时间合理调整（如果是下午 14:00 - 17:00 中转，则上午的景点应位于出发城市，晚上的景点位于抵达城市）。
3. **景点安排**：考虑地理就近原则安排每一天的景点，减少折返。每天安排 2-4 个景点，分上午和下午。
4. **美食与住宿**：推荐当地特色美食、用餐地点以及每天的住宿建议区域（需与当天所属的城市对应）。
5. **费用估算调整**：交通费用的估算必须与你最终选择或用户指定的交通工具相匹配。比如用户分段或全局指定了飞机，交通估算要包含机票成本；若指定了自驾，要包含租车与油耗/高速成本。
6. **城市字段规范**：返回的 JSON 数据中，每一天的日程必须包含 `"city"` 属性，指明这天游客主要在哪个目的地城市游玩（值必须是目的地列表中对应的城市名）。
7. **语气**：轻松友好。

## 输出格式
请严格按照以下 JSON 格式输出（不要包含 markdown 代码块标记，输出纯 JSON 字符串）：
{
  "title": "行程标题",
  "summary": "行程一句话概述",
  "days": [
    {
      "day": 1,
      "city": "这一天主要的游玩城市（例如：长沙）",
      "title": "Day 1 标题",
      "route": "当日路线描述（如果今天发生了城际转移，请在此说明，例如：从北京乘高铁前往长沙，下午开启游览）",
      "driving": "交通信息",
      "morning": [
        {"name": "景点名称", "time": "具体建议游玩时段，格式为 HH:MM - HH:MM（例如：09:00 - 11:30）", "desc": "简短介绍和游玩建议", "tips": "实用贴士"}
      ],
      "afternoon": [
        {"name": "景点名称", "time": "具体建议游玩时段，格式为 HH:MM - HH:MM（例如：14:00 - 16:30）", "desc": "简短介绍和游玩建议", "tips": "实用贴士"}
      ],
      "evening": "晚间活动或美食推荐",
      "food": ["推荐美食1", "推荐美食2"],
      "stay": "住宿推荐区域 and 建议"
    }
  ],
  "tips": ["跨省旅行贴士1", "换乘贴士2", "出行贴士3"],
  "transport_guide": [
    {
      "segment": "出发城市 → 抵达城市（例如：长沙 → 南昌）",
      "tool": "建议采用的城际交通工具，值必须为 train 或 plane",
      "advice": "针对此段的换乘时刻和购票决策专业建议，例如“推荐购买上午10点前的班次，既能避开早高峰，又能在午后顺利接驳南昌的景点游玩”",
      "options": [
        {
          "id": "车次或航班号（例如：G1025 或 CZ3121）",
          "time": "出发时刻 - 到达时刻（例如：09:30 - 11:15）",
          "duration": "耗时描述（例如：1小时45分钟）",
          "price": "单人票价预估（例如：157元）",
          "desc": "对此班次的评价，例如“性价比最高的推荐，中途不停靠直达”"
        }
      ]
    }
  ],
  "budget": {
    "transport": "交通费用估算（包含城际高铁/机票）",
    "hotel": "住宿费用估算",
    "food": "餐饮费用估算",
    "tickets": "门票费用估算",
    "total": "总计估算"
  }
}"""

    prompt = (
        prompt.replace("[DAYS]", str(request.days))
        .replace("[DEPARTURE]", request.departure or "未指定")
        .replace("[ROUTE]", destinations_list_str)
        .replace("[CITIES_DETAIL]", cities_str)
        .replace("[PACE]", request.pace)
        .replace("[BUDGET]", request.budget)
        .replace("[INTERESTS]", request.interests or "无特殊偏好")
        .replace("[TRANSPORT_RULES]", transport_rules_str)
        .replace("[POI_LIST]", poi_list_text)
    )

    headers = {
        "Authorization": f"Bearer {AI_API_KEY}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": AI_MODEL,
        "messages": [
            {"role": "system", "content": "你是一位专业的中国旅行规划师，擅长串联多个城市，根据景点数据和用户偏好规划完美的旅行路线。请始终输出合法的 JSON 格式。"},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
        "max_tokens": 4000,
    }

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{AI_BASE_URL}/chat/completions",
            headers=headers,
            json=payload,
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=500, detail=f"AI API 错误 ({resp.status_code}): {resp.text[:200]}")

    result = resp.json()
    content = result["choices"][0]["message"]["content"].strip()

    # 去除可能的 markdown 代码块包裹
    if content.startswith("```"):
        content = content.split("\n", 1)[1] if "\n" in content else content[3:]
    if content.endswith("```"):
        content = content[:-3]
    content = content.strip()
    try:
        itinerary = json.loads(content)
    except json.JSONDecodeError:
        start = content.find("{")
        end = content.rfind("}") + 1
        if start >= 0 and end > start:
            itinerary = json.loads(content[start:end])
        else:
            raise HTTPException(status_code=500, detail="AI 返回格式解析失败")

    # 合并 POI 坐标与元信息到行程中（根据所有景点的名称，进行坐标映射）
    poi_coords = {
        p["name"]: {
            "lat": p.get("lat", 0),
            "lng": p.get("lng", 0),
            "rating": p.get("rating", ""),
            "address": p.get("address", ""),
            "tel": p.get("tel", ""),
            "opentime": p.get("opentime", ""),
        }
        for p in all_pois
        if p.get("name")
    }
    for day_plan in itinerary.get("days", []):
        for slot in ["morning", "afternoon"]:
            for spot in day_plan.get(slot, []):
                name = spot.get("name", "")
                if name in poi_coords:
                    spot.update(poi_coords[name])

    # 提取各城市的中心点返回给前端
    city_centers = {}
    for item in request.city_data:
        city_name = item.get("city", "")
        center = item.get("center", {})
        if city_name and center:
            city_centers[city_name] = center

    itinerary["city_centers"] = city_centers
    # 返回前 20 个 POI 仅作前端示意
    itinerary["pois"] = all_pois[:20]

    # ===== 增强 transport_guide：用真实车次/航班数据替换 AI 虚构选项 =====
    travel_date = request.start_date or ""
    if travel_date:
        try:
            itinerary["transport_guide"] = await enrich_transport_guide(
                itinerary.get("transport_guide", []),
                request.destinations,
                travel_date
            )
        except Exception as e:
            print(f"[TransportEnrich] 增强交通数据失败: {e}，保留 AI 生成数据")

    return itinerary


async def enrich_transport_guide(
    transport_guide: list[dict],
    destinations: list[CityInfo],
    travel_date: str,
) -> list[dict]:
    """用真实交通 API 数据增强/替换 transport_guide 中的 options"""
    enhanced = []
    for segment in transport_guide:
        seg_str = segment.get("segment", "")
        tool = segment.get("tool", "train")

        # 解析城市对: "北京 → 西安" → ("北京", "西安")
        from_city, to_city = _parse_segment_cities(seg_str)

        if not from_city or not to_city:
            # 尝试从 destinations 顺序推断
            seg = segment.copy()
            seg["options"] = segment.get("options", [])
            seg["data_source"] = "ai_fallback"
            enhanced.append(seg)
            continue

        print(f"[TransportEnrich] 查询真实车次: {from_city} → {to_city} (tool={tool})")

        real_options = []

        if tool == "train":
            # 查询火车
            try:
                trains = await search_trains(from_city, to_city, travel_date)
                if trains:
                    # 转换为 transport_guide options 格式
                    for t in trains[:8]:
                        # 始终使用估算函数得到合理的票价
                        price = _estimate_train_price(t.get("duration_minutes", 0), t.get("train_type", ""))
                        
                        # 解析 seats 余票状态信息并附在车次描述后面
                        seats = t.get("seats", {})
                        seats_info = ""
                        if seats:
                            edz = seats.get("二等座")
                            yz = seats.get("硬座")
                            status = edz or yz or list(seats.values())[0]
                            if status.isdigit():
                                status = f"{status}张"
                            seat_name = "二等座" if edz else ("硬座" if yz else list(seats.keys())[0])
                            seats_info = f" ({seat_name}:{status})"
                        
                        desc = t.get("desc", "") + seats_info

                        option = {
                            "id": t.get("id", ""),
                            "time": t.get("time", ""),
                            "duration": t.get("duration", ""),
                            "price": price,
                            "desc": desc,
                            "from_station": t.get("from_station", ""),
                            "to_station": t.get("to_station", ""),
                            "train_type": t.get("train_type", ""),
                            "seats": seats,
                        }
                        real_options.append(option)
                else:
                    # 无结果，回退到 AI 生成
                    real_options = segment.get("options", [])
            except Exception as e:
                print(f"[TransportEnrich] 火车查询失败: {e}")
                real_options = segment.get("options", [])

        elif tool == "plane":
            # 查询航班
            try:
                flights = await search_flights(from_city, to_city, travel_date)
                if flights:
                    for f in flights[:8]:
                        price = f.get("price", "")
                        if price and not str(price).startswith("¥"):
                            price = f"¥{price}"
                        elif not price:
                            price = _estimate_flight_price(
                                from_city, to_city, _parse_duration_minutes(f.get("duration", ""))
                            )

                        option = {
                            "id": f.get("id", ""),
                            "time": f.get("time", ""),
                            "duration": f.get("duration", ""),
                            "price": price,
                            "desc": f.get("desc", ""),
                            "from_station": f.get("from_airport", ""),
                            "to_station": f.get("to_airport", ""),
                            "airline": f.get("airline", ""),
                            "aircraft": f.get("aircraft", ""),
                        }
                        real_options.append(option)
                else:
                    real_options = segment.get("options", [])
            except Exception as e:
                print(f"[TransportEnrich] 航班查询失败: {e}")
                real_options = segment.get("options", [])
        else:
            real_options = segment.get("options", [])

        seg = segment.copy()
        if real_options and (tool in ("train", "plane")):
            seg["options"] = real_options
            seg["data_source"] = "real"
            seg["source_label"] = "12306 实时数据" if tool == "train" else "实时航班数据"
        else:
            seg["options"] = real_options
            seg["data_source"] = "ai_fallback"
            seg["source_label"] = "AI 预估"

        enhanced.append(seg)

    return enhanced


def _parse_segment_cities(segment: str) -> tuple:
    """解析段字符串: '北京 → 西安' → ('北京', '西安')"""
    if not segment:
        return (None, None)

    # 支持多种分隔符
    for sep in [" → ", "→", " -> ", "->", " - ", "-", " 到 ", "至"]:
        parts = segment.split(sep)
        if len(parts) == 2:
            return (parts[0].strip(), parts[1].strip())

    return (None, None)


def _parse_duration_minutes(duration_str: str) -> int:
    """解析历时字符串为分钟数"""
    if not duration_str:
        return 0
    total = 0
    # 匹配 "X小时Y分钟" 或 "X小时" 或 "Y分钟"
    hour_match = re.search(r'(\d+)\s*小时', duration_str)
    min_match = re.search(r'(\d+)\s*分钟', duration_str)
    if hour_match:
        total += int(hour_match.group(1)) * 60
    if min_match:
        total += int(min_match.group(1))
    return total


def _estimate_train_price(duration_minutes: int, train_type: str) -> str:
    """根据时长和类型估算火车票价"""
    # 高铁/动车约 0.5元/公里，时速约 250-300km/h → 约 1.9元/分钟
    if train_type in ("高铁", "动车", "城际"):
        price = max(20, int(duration_minutes * 1.9))
    elif train_type == "直达":
        price = max(15, int(duration_minutes * 0.4))
    else:
        price = max(10, int(duration_minutes * 0.25))
    return f"¥{price}"


def _estimate_flight_price(from_city: str, to_city: str, duration_minutes: int = 0) -> str:
    """估算机票价格"""
    # 简单估算：短途 300-500，中途 500-1000，长途 800-2000
    if duration_minutes <= 90:
        price = "¥300-500"
    elif duration_minutes <= 150:
        price = "¥500-1000"
    elif duration_minutes <= 210:
        price = "¥800-1500"
    else:
        price = "¥1500-2500"
    return price


# ===== API 路由 =====
@app.post("/api/plan")
async def plan_trip(request: PlanRequest):
    """主接口：接收前端多城市 POI 数据 + AI 生成行程"""
    if not request.city_data:
        raise HTTPException(status_code=400, detail="未收到景点数据，请检查高德地图 API Key 是否正确")

    # 验证是否拿到了 POI 数据（必须至少有一个城市拿到了景点）
    has_pois = any(len(c.get("pois", [])) > 0 for c in request.city_data)
    if not has_pois:
         raise HTTPException(status_code=400, detail="所有目的地均未获取到高德景点数据，请检查高德地图 Key")

    itinerary = await generate_itinerary(request)
    return JSONResponse(content=itinerary)


@app.get("/api/search_pois")
async def search_pois(city: str, keywords: str, count: int = 25):
    """后端代理高德 POI 搜索（作为前端 JS API 的 Fallback，支持 Web 服务 Key）"""
    if not AMAP_KEY:
        raise HTTPException(status_code=400, detail="未配置高德地图 Key (AMAP_KEY)")
    
    url = "https://restapi.amap.com/v3/place/text"
    params = {
        "key": AMAP_KEY,
        "keywords": keywords,
        "city": city,
        "offset": count,
        "page": 1,
        "extensions": "all"
    }
    
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params=params)
        if resp.status_code != 200:
            raise HTTPException(status_code=500, detail=f"高德 API 请求失败: {resp.status_code}")
        
        data = resp.json()
        if data.get("status") == "1":
            pois = []
            for p in data.get("pois", []):
                lat, lng = 0.0, 0.0
                if p.get("location"):
                    try:
                        lng_str, lat_str = p["location"].split(",")
                        lng, lat = float(lng_str), float(lat_str)
                    except ValueError:
                        pass
                
                pois.append({
                    "name": p.get("name", ""),
                    "address": p.get("address", ""),
                    "tel": p.get("tel", ""),
                    "rating": p.get("biz_ext", {}).get("rating") if isinstance(p.get("biz_ext"), dict) else "",
                    "type": p.get("type", ""),
                    "lat": lat,
                    "lng": lng,
                    "cityname": p.get("cityname", ""),
                    "adname": p.get("adname", ""),
                    "opentime": p.get("biz_ext", {}).get("opentime") if isinstance(p.get("biz_ext"), dict) else ""
                })
            return {"status": "ok", "pois": pois}
        else:
            return {"status": "error", "info": data.get("info", "未知错误"), "code": data.get("infocode")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"后端搜索出错: {str(e)}")


@app.get("/api/city_center")
async def get_city_center(city: str):
    """后端代理获取城市中心坐标"""
    if not AMAP_KEY:
        return {"lat": 30.0, "lng": 116.0, "name": city}
    
    url = "https://restapi.amap.com/v3/config/district"
    params = {
        "key": AMAP_KEY,
        "keywords": city,
        "subdistrict": 0
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params=params)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("status") == "1" and data.get("districts"):
                d = data["districts"][0]
                center = d.get("center")
                if center:
                    lng_str, lat_str = center.split(",")
                    return {"lat": float(lat_str), "lng": float(lng_str), "name": d.get("name", city)}
        return {"lat": 30.0, "lng": 116.0, "name": city}
    except Exception:
        return {"lat": 30.0, "lng": 116.0, "name": city}


@app.get("/api/config")
async def get_config():
    """返回前端需要的配置（高德 Key 等）"""
    return {
        "amap_key": AMAP_KEY,
        "amap_security_key": AMAP_SECURITY_KEY,
        "ai_model": AI_MODEL,
        "ai_configured": bool(AI_API_KEY),
    }


@app.get("/api/health")
async def health_check():
    """健康检查"""
    return {
        "status": "ok",
        "amap_configured": bool(AMAP_KEY),
        "amap_security_configured": bool(AMAP_SECURITY_KEY),
        "ai_configured": bool(AI_API_KEY),
        "ai_model": AI_MODEL,
        "transport_train_available": True,  # 12306 接口可用
        "transport_flight_available": bool(os.getenv("JUHE_FLIGHT_API_KEY", "")) or True,  # 内置数据 fallback
    }


# ===== 交通查询 API =====
@app.get("/api/transport/trains")
async def query_trains(
    from_city: str = Query(..., description="出发城市"),
    to_city: str = Query(..., description="到达城市"),
    date: str = Query(..., description="日期 YYYY-MM-DD"),
):
    """查询高铁/火车班次"""
    if not from_city or not to_city:
        raise HTTPException(status_code=400, detail="请提供出发城市和到达城市")

    try:
        trains = await search_trains(from_city, to_city, date)
        for t in trains:
            # 始终使用估算函数得到合理的票价
            t["price"] = _estimate_train_price(t.get("duration_minutes", 0), t.get("train_type", ""))
            
            # 解析 seats 余票状态信息并附在车次描述后面
            seats = t.get("seats", {})
            seats_info = ""
            if seats:
                edz = seats.get("二等座")
                yz = seats.get("硬座")
                status = edz or yz or list(seats.values())[0]
                if status.isdigit():
                    status = f"{status}张"
                seat_name = "二等座" if edz else ("硬座" if yz else list(seats.keys())[0])
                seats_info = f" ({seat_name}:{status})"
            
            t["desc"] = t.get("desc", "") + seats_info

        return {
            "status": "ok",
            "trains": trains,
            "total": len(trains),
            "source": "12306" if trains else "fallback",
            "from_city": from_city,
            "to_city": to_city,
            "date": date,
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"查询失败: {str(e)}",
            "trains": [],
            "source": "error",
        }


@app.get("/api/transport/flights")
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
            "source": "api" if flights and flights[0].get("source") != "典型航线数据" else "builtin",
            "from_city": from_city,
            "to_city": to_city,
            "date": date,
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"查询失败: {str(e)}",
            "flights": [],
            "source": "error",
        }


@app.get("/api/transport/search")
async def search_transport(
    keyword: str = Query(..., description="车次号/航班号"),
    date: str = Query("", description="日期 YYYY-MM-DD"),
):
    """按车次号/航班号搜索"""
    if not keyword:
        raise HTTPException(status_code=400, detail="请输入车次号或航班号")

    keyword = keyword.strip().upper()
    first_char = keyword[0] if keyword else ""

    result = {"keyword": keyword, "type": "", "results": []}

    # 判断类型：G/D/K/T/Z/C 开头 = 火车，其他 = 可能航班
    if first_char in "GDKTZCSYL":
        result["type"] = "train"
        train = await search_train_by_number(keyword, date)
        if train:
            result["results"] = [train]
    else:
        result["type"] = "flight_or_train"
        # 先尝试火车
        train = await search_train_by_number(keyword, date)
        if train:
            result["results"].append({"type": "train", **train})
        result["note"] = "未找到匹配结果" if not result["results"] else ""

    return result


@app.get("/api/transport/stations")
async def query_stations(
    city: str = Query(..., description="城市名"),
):
    """查询城市的火车站"""
    if not city:
        raise HTTPException(status_code=400, detail="请提供城市名")

    # 从车站映射中查找
    from services.train_service import _get_station_map, _find_station_code

    station_map = _get_station_map()
    clean_city = city.rstrip("市")

    stations = []
    # 精确匹配
    if clean_city in station_map:
        for code, name in station_map[clean_city]:
            stations.append({"code": code, "name": name})

    # 机场信息
    airports = []
    airport_info = get_airport_info(clean_city)
    if airport_info:
        # 获取该城市所有机场
        from services.flight_service import CITY_AIRPORT_MAP
        if clean_city in CITY_AIRPORT_MAP:
            airports = CITY_AIRPORT_MAP[clean_city]
        else:
            airports = [airport_info]

    return {
        "city": city,
        "stations": stations,
        "airports": airports,
    }



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
    import asyncio
    import uvicorn
    print("=" * 50)
    print("  AI 旅行规划师 v1.0.0")
    print("=" * 50)
    print(f"  高德地图 JS API: {'已配置' if AMAP_KEY else '未配置'}")
    print(f"  AI 模型: {AI_MODEL} ({'已配置' if AI_API_KEY else '未配置'})")
    print(f"  火车票查询: 已启用 (12306 公开接口)")
    print(f"  航班查询: {'已配置' if os.getenv('JUHE_FLIGHT_API_KEY') else '内置数据'} ")
    print(f"  访问地址: http://localhost:8000")
    print("=" * 50)
    uvicorn.run(app, host="0.0.0.0", port=8000)
