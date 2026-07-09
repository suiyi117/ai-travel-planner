"""
航班查询服务
支持聚合数据 API + 内置典型航线数据 fallback
"""
import os
from typing import Optional

import httpx

# ===== 配置 =====
JUHE_FLIGHT_API_KEY = os.getenv("JUHE_FLIGHT_API_KEY", "")
JUHE_FLIGHT_URL = "https://apis.juhe.cn/air/flight"

# ===== 城市 → 机场 IATA 码映射 =====
CITY_AIRPORT_MAP: dict[str, list[dict]] = {
    "北京": [
        {"code": "PEK", "name": "北京首都国际机场", "city": "北京"},
        {"code": "PKX", "name": "北京大兴国际机场", "city": "北京"},
    ],
    "上海": [
        {"code": "PVG", "name": "上海浦东国际机场", "city": "上海"},
        {"code": "SHA", "name": "上海虹桥国际机场", "city": "上海"},
    ],
    "广州": [
        {"code": "CAN", "name": "广州白云国际机场", "city": "广州"},
    ],
    "深圳": [
        {"code": "SZX", "name": "深圳宝安国际机场", "city": "深圳"},
    ],
    "成都": [
        {"code": "CTU", "name": "成都双流国际机场", "city": "成都"},
        {"code": "TFU", "name": "成都天府国际机场", "city": "成都"},
    ],
    "重庆": [
        {"code": "CKG", "name": "重庆江北国际机场", "city": "重庆"},
    ],
    "杭州": [
        {"code": "HGH", "name": "杭州萧山国际机场", "city": "杭州"},
    ],
    "西安": [
        {"code": "XIY", "name": "西安咸阳国际机场", "city": "西安"},
    ],
    "昆明": [
        {"code": "KMG", "name": "昆明长水国际机场", "city": "昆明"},
    ],
    "武汉": [
        {"code": "WUH", "name": "武汉天河国际机场", "city": "武汉"},
    ],
    "长沙": [
        {"code": "CSX", "name": "长沙黄花国际机场", "city": "长沙"},
    ],
    "南京": [
        {"code": "NKG", "name": "南京禄口国际机场", "city": "南京"},
    ],
    "厦门": [
        {"code": "XMN", "name": "厦门高崎国际机场", "city": "厦门"},
        {"code": "XIA", "name": "厦门翔安国际机场", "city": "厦门"},
    ],
    "三亚": [
        {"code": "SYX", "name": "三亚凤凰国际机场", "city": "三亚"},
    ],
    "海口": [
        {"code": "HAK", "name": "海口美兰国际机场", "city": "海口"},
    ],
    "青岛": [
        {"code": "TAO", "name": "青岛胶东国际机场", "city": "青岛"},
    ],
    "大连": [
        {"code": "DLC", "name": "大连周水子国际机场", "city": "大连"},
    ],
    "沈阳": [
        {"code": "SHE", "name": "沈阳桃仙国际机场", "city": "沈阳"},
    ],
    "哈尔滨": [
        {"code": "HRB", "name": "哈尔滨太平国际机场", "city": "哈尔滨"},
    ],
    "郑州": [
        {"code": "CGO", "name": "郑州新郑国际机场", "city": "郑州"},
    ],
    "济南": [
        {"code": "TNA", "name": "济南遥墙国际机场", "city": "济南"},
    ],
    "天津": [
        {"code": "TSN", "name": "天津滨海国际机场", "city": "天津"},
    ],
    "福州": [
        {"code": "FOC", "name": "福州长乐国际机场", "city": "福州"},
    ],
    "贵阳": [
        {"code": "KWE", "name": "贵阳龙洞堡国际机场", "city": "贵阳"},
    ],
    "南宁": [
        {"code": "NNG", "name": "南宁吴圩国际机场", "city": "南宁"},
    ],
    "太原": [
        {"code": "TYN", "name": "太原武宿国际机场", "city": "太原"},
    ],
    "乌鲁木齐": [
        {"code": "URC", "name": "乌鲁木齐地窝堡国际机场", "city": "乌鲁木齐"},
    ],
    "兰州": [
        {"code": "LHW", "name": "兰州中川国际机场", "city": "兰州"},
    ],
    "呼和浩特": [
        {"code": "HET", "name": "呼和浩特白塔国际机场", "city": "呼和浩特"},
    ],
    "银川": [
        {"code": "INC", "name": "银川河东国际机场", "city": "银川"},
    ],
    "西宁": [
        {"code": "XNN", "name": "西宁曹家堡机场", "city": "西宁"},
    ],
    "拉萨": [
        {"code": "LXA", "name": "拉萨贡嘎机场", "city": "拉萨"},
    ],
    "南昌": [
        {"code": "KHN", "name": "南昌昌北国际机场", "city": "南昌"},
    ],
    "合肥": [
        {"code": "HFE", "name": "合肥新桥国际机场", "city": "合肥"},
    ],
    "石家庄": [
        {"code": "SJW", "name": "石家庄正定国际机场", "city": "石家庄"},
    ],
    "长春": [
        {"code": "CGQ", "name": "长春龙嘉国际机场", "city": "长春"},
    ],
    "珠海": [
        {"code": "ZUH", "name": "珠海金湾机场", "city": "珠海"},
    ],
    "桂林": [
        {"code": "KWL", "name": "桂林两江国际机场", "city": "桂林"},
    ],
    "丽江": [
        {"code": "LJG", "name": "丽江三义国际机场", "city": "丽江"},
    ],
    "西双版纳": [
        {"code": "JHG", "name": "西双版纳嘎洒国际机场", "city": "西双版纳"},
    ],
    "大理": [
        {"code": "DLU", "name": "大理凤仪机场", "city": "大理"},
    ],
    "延吉": [
        {"code": "YNJ", "name": "延吉朝阳川国际机场", "city": "延吉"},
    ],
    "烟台": [
        {"code": "YNT", "name": "烟台蓬莱国际机场", "city": "烟台"},
    ],
    "威海": [
        {"code": "WEH", "name": "威海大水泊国际机场", "city": "威海"},
    ],
    "宁波": [
        {"code": "NGB", "name": "宁波栎社国际机场", "city": "宁波"},
    ],
    "温州": [
        {"code": "WNZ", "name": "温州龙湾国际机场", "city": "温州"},
    ],
    "无锡": [
        {"code": "WUX", "name": "苏南硕放国际机场", "city": "无锡"},
    ],
    "常州": [
        {"code": "CZX", "name": "常州奔牛国际机场", "city": "常州"},
    ],
    "泉州": [
        {"code": "JJN", "name": "泉州晋江国际机场", "city": "泉州"},
    ],
    "揭阳": [
        {"code": "SWA", "name": "揭阳潮汕国际机场", "city": "揭阳"},
    ],
    "湛江": [
        {"code": "ZHA", "name": "湛江吴川机场", "city": "湛江"},
    ],
    "宜昌": [
        {"code": "YIH", "name": "宜昌三峡机场", "city": "宜昌"},
    ],
    "张家界": [
        {"code": "DYG", "name": "张家界荷花国际机场", "city": "张家界"},
    ],
    "北海": [
        {"code": "BHY", "name": "北海福成机场", "city": "北海"},
    ],
    "黄山": [
        {"code": "TXN", "name": "黄山屯溪国际机场", "city": "黄山"},
    ],
    "洛阳": [
        {"code": "LYA", "name": "洛阳北郊机场", "city": "洛阳"},
    ],
    "襄阳": [
        {"code": "XFN", "name": "襄阳刘集机场", "city": "襄阳"},
    ],
    "赣州": [
        {"code": "KOW", "name": "赣州黄金机场", "city": "赣州"},
    ],
    "大同": [
        {"code": "DAT", "name": "大同云冈机场", "city": "大同"},
    ],
    "运城": [
        {"code": "YCU", "name": "运城张孝机场", "city": "运城"},
    ],
    "遵义": [
        {"code": "ZYI", "name": "遵义新舟机场", "city": "遵义"},
        {"code": "WMT", "name": "遵义茅台机场", "city": "遵义"},
    ],
    "绵阳": [
        {"code": "MIG", "name": "绵阳南郊机场", "city": "绵阳"},
    ],
}


def _find_airport(city_name: str) -> Optional[dict]:
    """根据城市名查找机场 IATA 码"""
    # 精确匹配
    if city_name in CITY_AIRPORT_MAP:
        airports = CITY_AIRPORT_MAP[city_name]
        if airports:
            return airports[0]  # 返回第一个（主要机场）

    # 去掉"市"后缀
    clean = city_name.rstrip("市")
    if clean in CITY_AIRPORT_MAP:
        airports = CITY_AIRPORT_MAP[clean]
        if airports:
            return airports[0]

    # 模糊匹配
    for city, airports in CITY_AIRPORT_MAP.items():
        if city.startswith(clean) or clean.startswith(city):
            return airports[0] if airports else None

    return None


async def search_flights_juhe(from_city: str, to_city: str, date: str) -> list[dict]:
    """通过聚合数据 API 查询航班"""
    if not JUHE_FLIGHT_API_KEY:
        return []

    from_airport = _find_airport(from_city)
    to_airport = _find_airport(to_city)

    if not from_airport or not to_airport:
        print(f"[FlightService] 未找到机场映射: {from_city}→{from_airport}, {to_city}→{to_airport}")
        return []

    try:
        params = {
            "key": JUHE_FLIGHT_API_KEY,
            "start": from_airport["code"],
            "end": to_airport["code"],
            "date": date,
        }

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(JUHE_FLIGHT_URL, params=params)

        if resp.status_code != 200:
            print(f"[FlightService] 聚合数据 API 返回 {resp.status_code}")
            return []

        data = resp.json()
        if data.get("error_code") != 0:
            print(f"[FlightService] 聚合数据 API 错误: {data.get('reason', '')}")
            return []

        flights = []
        raw_flights = data.get("result", {}).get("list", [])
        for f in raw_flights:
            flight = {
                "id": f.get("flight_no", ""),
                "airline": f.get("airline", ""),
                "from_airport": f.get("dep_airport_name", from_airport["name"]),
                "to_airport": f.get("arr_airport_name", to_airport["name"]),
                "from_code": f.get("dep_airport_code", from_airport["code"]),
                "to_code": f.get("arr_airport_code", to_airport["code"]),
                "departure": f.get("dep_time", ""),
                "arrival": f.get("arr_time", ""),
                "time": f"{f.get('dep_time', '')} - {f.get('arr_time', '')}",
                "duration": f.get("duration", ""),
                "price": f.get("price", ""),
                "aircraft": f.get("aircraft", ""),
                "desc": f"{f.get('airline', '')} · {f.get('dep_airport_name', '')} → {f.get('arr_airport_name', '')}",
                "source": "聚合数据",
            }
            flights.append(flight)

        return flights

    except Exception as e:
        print(f"[FlightService] 聚合数据查询异常: {e}")
        return []


# ===== 内置典型航线数据（fallback） =====
# 热门城市间的典型航班（大致时刻，供未配置 API 时使用）
BUILTIN_FLIGHTS: dict[str, list[dict]] = {
    "北京-上海": [
        {"id": "MU5101", "airline": "东方航空", "departure": "07:00", "arrival": "09:15", "duration": "2小时15分钟", "aircraft": "B777", "depart_airport": "北京首都", "arrive_airport": "上海虹桥"},
        {"id": "CA1501", "airline": "中国国航", "departure": "08:30", "arrival": "10:45", "duration": "2小时15分钟", "aircraft": "A330", "depart_airport": "北京首都", "arrive_airport": "上海虹桥"},
        {"id": "MU5103", "airline": "东方航空", "departure": "10:00", "arrival": "12:15", "duration": "2小时15分钟", "aircraft": "A330", "depart_airport": "北京首都", "arrive_airport": "上海虹桥"},
        {"id": "CA1515", "airline": "中国国航", "departure": "14:00", "arrival": "16:15", "duration": "2小时15分钟", "aircraft": "B787", "depart_airport": "北京首都", "arrive_airport": "上海虹桥"},
        {"id": "MU5121", "airline": "东方航空", "departure": "18:00", "arrival": "20:15", "duration": "2小时15分钟", "aircraft": "B777", "depart_airport": "北京大兴", "arrive_airport": "上海浦东"},
    ],
    "北京-广州": [
        {"id": "CA1301", "airline": "中国国航", "departure": "07:30", "arrival": "10:50", "duration": "3小时20分钟", "aircraft": "B787", "depart_airport": "北京首都", "arrive_airport": "广州白云"},
        {"id": "CZ3100", "airline": "南方航空", "departure": "09:00", "arrival": "12:20", "duration": "3小时20分钟", "aircraft": "A350", "depart_airport": "北京大兴", "arrive_airport": "广州白云"},
        {"id": "CA1327", "airline": "中国国航", "departure": "13:00", "arrival": "16:20", "duration": "3小时20分钟", "aircraft": "B777", "depart_airport": "北京首都", "arrive_airport": "广州白云"},
        {"id": "CZ3108", "airline": "南方航空", "departure": "18:00", "arrival": "21:20", "duration": "3小时20分钟", "aircraft": "A330", "depart_airport": "北京大兴", "arrive_airport": "广州白云"},
    ],
    "北京-成都": [
        {"id": "CA4101", "airline": "中国国航", "departure": "07:00", "arrival": "10:00", "duration": "3小时", "aircraft": "A350", "depart_airport": "北京首都", "arrive_airport": "成都双流"},
        {"id": "3U8882", "airline": "四川航空", "departure": "09:30", "arrival": "12:30", "duration": "3小时", "aircraft": "A330", "depart_airport": "北京首都", "arrive_airport": "成都双流"},
        {"id": "CA4193", "airline": "中国国航", "departure": "14:00", "arrival": "17:00", "duration": "3小时", "aircraft": "B787", "depart_airport": "北京大兴", "arrive_airport": "成都天府"},
        {"id": "CZ6119", "airline": "南方航空", "departure": "18:30", "arrival": "21:30", "duration": "3小时", "aircraft": "A320", "depart_airport": "北京大兴", "arrive_airport": "成都天府"},
    ],
    "上海-广州": [
        {"id": "MU5301", "airline": "东方航空", "departure": "07:30", "arrival": "10:00", "duration": "2小时30分钟", "aircraft": "A330", "depart_airport": "上海虹桥", "arrive_airport": "广州白云"},
        {"id": "CZ3524", "airline": "南方航空", "departure": "10:00", "arrival": "12:30", "duration": "2小时30分钟", "aircraft": "B787", "depart_airport": "上海浦东", "arrive_airport": "广州白云"},
        {"id": "FM9301", "airline": "上海航空", "departure": "14:00", "arrival": "16:30", "duration": "2小时30分钟", "aircraft": "B737", "depart_airport": "上海虹桥", "arrive_airport": "广州白云"},
        {"id": "CZ3596", "airline": "南方航空", "departure": "19:00", "arrival": "21:30", "duration": "2小时30分钟", "aircraft": "A321", "depart_airport": "上海浦东", "arrive_airport": "广州白云"},
    ],
    "上海-成都": [
        {"id": "MU5401", "airline": "东方航空", "departure": "07:00", "arrival": "10:15", "duration": "3小时15分钟", "aircraft": "A330", "depart_airport": "上海浦东", "arrive_airport": "成都双流"},
        {"id": "CA4502", "airline": "中国国航", "departure": "10:30", "arrival": "13:45", "duration": "3小时15分钟", "aircraft": "A350", "depart_airport": "上海虹桥", "arrive_airport": "成都天府"},
        {"id": "3U8962", "airline": "四川航空", "departure": "15:00", "arrival": "18:15", "duration": "3小时15分钟", "aircraft": "A330", "depart_airport": "上海浦东", "arrive_airport": "成都双流"},
    ],
    "广州-成都": [
        {"id": "CZ3401", "airline": "南方航空", "departure": "07:30", "arrival": "10:00", "duration": "2小时30分钟", "aircraft": "A330", "depart_airport": "广州白云", "arrive_airport": "成都双流"},
        {"id": "CA4302", "airline": "中国国航", "departure": "11:00", "arrival": "13:30", "duration": "2小时30分钟", "aircraft": "A320", "depart_airport": "广州白云", "arrive_airport": "成都天府"},
        {"id": "3U8734", "airline": "四川航空", "departure": "16:00", "arrival": "18:30", "duration": "2小时30分钟", "aircraft": "A321", "depart_airport": "广州白云", "arrive_airport": "成都双流"},
    ],
    "北京-西安": [
        {"id": "MU2101", "airline": "东方航空", "departure": "07:30", "arrival": "09:45", "duration": "2小时15分钟", "aircraft": "A320", "depart_airport": "北京首都", "arrive_airport": "西安咸阳"},
        {"id": "CA1201", "airline": "中国国航", "departure": "10:00", "arrival": "12:15", "duration": "2小时15分钟", "aircraft": "B737", "depart_airport": "北京首都", "arrive_airport": "西安咸阳"},
        {"id": "MU2107", "airline": "东方航空", "departure": "15:00", "arrival": "17:15", "duration": "2小时15分钟", "aircraft": "A321", "depart_airport": "北京大兴", "arrive_airport": "西安咸阳"},
    ],
    "上海-西安": [
        {"id": "MU2151", "airline": "东方航空", "departure": "07:00", "arrival": "09:30", "duration": "2小时30分钟", "aircraft": "A320", "depart_airport": "上海虹桥", "arrive_airport": "西安咸阳"},
        {"id": "HO1007", "airline": "吉祥航空", "departure": "10:30", "arrival": "13:00", "duration": "2小时30分钟", "aircraft": "A320", "depart_airport": "上海浦东", "arrive_airport": "西安咸阳"},
        {"id": "CA1215", "airline": "中国国航", "departure": "15:00", "arrival": "17:30", "duration": "2小时30分钟", "aircraft": "B737", "depart_airport": "上海虹桥", "arrive_airport": "西安咸阳"},
    ],
    "成都-西安": [
        {"id": "3U8301", "airline": "四川航空", "departure": "08:00", "arrival": "09:30", "duration": "1小时30分钟", "aircraft": "A320", "depart_airport": "成都双流", "arrive_airport": "西安咸阳"},
        {"id": "MU2321", "airline": "东方航空", "departure": "12:00", "arrival": "13:30", "duration": "1小时30分钟", "aircraft": "A319", "depart_airport": "成都天府", "arrive_airport": "西安咸阳"},
    ],
    "成都-昆明": [
        {"id": "3U8601", "airline": "四川航空", "departure": "07:30", "arrival": "09:00", "duration": "1小时30分钟", "aircraft": "A320", "depart_airport": "成都双流", "arrive_airport": "昆明长水"},
        {"id": "MU5841", "airline": "东方航空", "departure": "10:30", "arrival": "12:00", "duration": "1小时30分钟", "aircraft": "B737", "depart_airport": "成都天府", "arrive_airport": "昆明长水"},
        {"id": "8L9942", "airline": "祥鹏航空", "departure": "15:00", "arrival": "16:30", "duration": "1小时30分钟", "aircraft": "B737", "depart_airport": "成都双流", "arrive_airport": "昆明长水"},
    ],
    "北京-昆明": [
        {"id": "MU5701", "airline": "东方航空", "departure": "07:00", "arrival": "10:30", "duration": "3小时30分钟", "aircraft": "A330", "depart_airport": "北京大兴", "arrive_airport": "昆明长水"},
        {"id": "CA1401", "airline": "中国国航", "departure": "11:00", "arrival": "14:30", "duration": "3小时30分钟", "aircraft": "B787", "depart_airport": "北京首都", "arrive_airport": "昆明长水"},
        {"id": "CZ3998", "airline": "南方航空", "departure": "16:00", "arrival": "19:30", "duration": "3小时30分钟", "aircraft": "A321", "depart_airport": "北京大兴", "arrive_airport": "昆明长水"},
    ],
    "上海-昆明": [
        {"id": "MU5801", "airline": "东方航空", "departure": "07:30", "arrival": "10:45", "duration": "3小时15分钟", "aircraft": "B787", "depart_airport": "上海虹桥", "arrive_airport": "昆明长水"},
        {"id": "HO1119", "airline": "吉祥航空", "departure": "13:00", "arrival": "16:15", "duration": "3小时15分钟", "aircraft": "A320", "depart_airport": "上海浦东", "arrive_airport": "昆明长水"},
    ],
    "广州-三亚": [
        {"id": "CZ6732", "airline": "南方航空", "departure": "08:00", "arrival": "09:30", "duration": "1小时30分钟", "aircraft": "A320", "depart_airport": "广州白云", "arrive_airport": "三亚凤凰"},
        {"id": "HU7302", "airline": "海南航空", "departure": "12:00", "arrival": "13:30", "duration": "1小时30分钟", "aircraft": "B737", "depart_airport": "广州白云", "arrive_airport": "三亚凤凰"},
    ],
    "深圳-北京": [
        {"id": "CZ3151", "airline": "南方航空", "departure": "07:30", "arrival": "10:40", "duration": "3小时10分钟", "aircraft": "A350", "depart_airport": "深圳宝安", "arrive_airport": "北京大兴"},
        {"id": "CA1304", "airline": "中国国航", "departure": "11:00", "arrival": "14:10", "duration": "3小时10分钟", "aircraft": "B787", "depart_airport": "深圳宝安", "arrive_airport": "北京首都"},
        {"id": "ZH9101", "airline": "深圳航空", "departure": "16:00", "arrival": "19:10", "duration": "3小时10分钟", "aircraft": "A330", "depart_airport": "深圳宝安", "arrive_airport": "北京首都"},
    ],
    "北京-杭州": [
        {"id": "CA1701", "airline": "中国国航", "departure": "07:00", "arrival": "09:15", "duration": "2小时15分钟", "aircraft": "A320", "depart_airport": "北京首都", "arrive_airport": "杭州萧山"},
        {"id": "MU5131", "airline": "东方航空", "departure": "10:30", "arrival": "12:45", "duration": "2小时15分钟", "aircraft": "A321", "depart_airport": "北京大兴", "arrive_airport": "杭州萧山"},
        {"id": "CA1709", "airline": "中国国航", "departure": "16:00", "arrival": "18:15", "duration": "2小时15分钟", "aircraft": "B737", "depart_airport": "北京首都", "arrive_airport": "杭州萧山"},
    ],
    "上海-厦门": [
        {"id": "MU5571", "airline": "东方航空", "departure": "07:30", "arrival": "09:15", "duration": "1小时45分钟", "aircraft": "A320", "depart_airport": "上海虹桥", "arrive_airport": "厦门高崎"},
        {"id": "MF8502", "airline": "厦门航空", "departure": "11:00", "arrival": "12:45", "duration": "1小时45分钟", "aircraft": "B737", "depart_airport": "上海虹桥", "arrive_airport": "厦门高崎"},
        {"id": "SC4942", "airline": "山东航空", "departure": "16:00", "arrival": "17:45", "duration": "1小时45分钟", "aircraft": "B737", "depart_airport": "上海浦东", "arrive_airport": "厦门高崎"},
    ],
    "成都-重庆": [
        {"id": "3U8621", "airline": "四川航空", "departure": "08:00", "arrival": "08:50", "duration": "50分钟", "aircraft": "A319", "depart_airport": "成都双流", "arrive_airport": "重庆江北"},
        {"id": "CA4351", "airline": "中国国航", "departure": "13:00", "arrival": "13:50", "duration": "50分钟", "aircraft": "A320", "depart_airport": "成都天府", "arrive_airport": "重庆江北"},
    ],
    "西安-兰州": [
        {"id": "MU2221", "airline": "东方航空", "departure": "08:00", "arrival": "09:10", "duration": "1小时10分钟", "aircraft": "A320", "depart_airport": "西安咸阳", "arrive_airport": "兰州中川"},
        {"id": "CA2875", "airline": "中国国航", "departure": "14:00", "arrival": "15:10", "duration": "1小时10分钟", "aircraft": "B737", "depart_airport": "西安咸阳", "arrive_airport": "兰州中川"},
    ],
    "广州-海口": [
        {"id": "CZ6772", "airline": "南方航空", "departure": "07:30", "arrival": "08:40", "duration": "1小时10分钟", "aircraft": "A320", "depart_airport": "广州白云", "arrive_airport": "海口美兰"},
        {"id": "HU7002", "airline": "海南航空", "departure": "12:00", "arrival": "13:10", "duration": "1小时10分钟", "aircraft": "B737", "depart_airport": "广州白云", "arrive_airport": "海口美兰"},
        {"id": "CZ6788", "airline": "南方航空", "departure": "19:00", "arrival": "20:10", "duration": "1小时10分钟", "aircraft": "A321", "depart_airport": "广州白云", "arrive_airport": "海口美兰"},
    ],
}


async def search_flights(
    from_city: str,
    to_city: str,
    date: str,
    prefer_direct: bool = True,
) -> list[dict]:
    """
    查询两地之间的航班

    Args:
        from_city: 出发城市名
        to_city: 到达城市名
        date: 日期 YYYY-MM-DD
        prefer_direct: 是否优先直飞

    Returns:
        标准化航班列表
    """
    flights = []

    # 1. 尝试聚合数据 API
    if JUHE_FLIGHT_API_KEY:
        try:
            flights = await search_flights_juhe(from_city, to_city, date)
        except Exception as e:
            print(f"[FlightService] 聚合数据查询失败: {e}")

    # 2. Fallback 到内置数据
    if not flights:
        flights = _search_builtin_flights(from_city, to_city)

    # 按出发时间排序
    flights.sort(key=lambda f: f.get("departure", "99:99"))

    print(f"[FlightService] {from_city} → {to_city}: 找到 {len(flights)} 个航班")
    return flights


def _search_builtin_flights(from_city: str, to_city: str) -> list[dict]:
    """从内置数据中查找航班"""
    from_clean = from_city.rstrip("市")
    to_clean = to_city.rstrip("市")

    key = f"{from_clean}-{to_clean}"
    if key in BUILTIN_FLIGHTS:
        raw_flights = BUILTIN_FLIGHTS[key]
        flights = []
        for f in raw_flights:
            from_airport = _find_airport(from_clean)
            to_airport = _find_airport(to_clean)

            flights.append({
                "id": f.get("id", ""),
                "airline": f.get("airline", ""),
                "from_airport": f.get("depart_airport", from_airport["name"] if from_airport else from_clean),
                "to_airport": f.get("arrive_airport", to_airport["name"] if to_airport else to_clean),
                "from_code": from_airport["code"] if from_airport else "",
                "to_code": to_airport["code"] if to_airport else "",
                "departure": f.get("departure", ""),
                "arrival": f.get("arrival", ""),
                "time": f"{f.get('departure', '')} - {f.get('arrival', '')}",
                "duration": f.get("duration", ""),
                "aircraft": f.get("aircraft", ""),
                "price": f.get("price", ""),
                "desc": f"{f.get('airline', '')} · {f.get('depart_airport', '')} → {f.get('arrive_airport', '')}",
                "source": "典型航线数据",
            })
        return flights

    return []


def get_airport_info(city: str) -> Optional[dict]:
    """获取城市机场信息"""
    return _find_airport(city)
