"""
12306 火车/高铁查询服务
直接调用 12306 公开 JSON 接口，无需 API Key 或登录
"""
import asyncio
import json
import re
import time
import os
from pathlib import Path
from typing import Optional
from datetime import datetime, timedelta

import httpx

# ===== 配置 =====
# 车站数据缓存文件
STATION_CACHE_DIR = Path(__file__).parent / ".cache"
STATION_CACHE_FILE = STATION_CACHE_DIR / "station_map.json"
STATION_CACHE_TTL = 7 * 24 * 3600  # 7 天更新一次

# 12306 接口
STATION_LIST_URL = "https://kyfw.12306.cn/otn/resources/js/framework/station_name.js"
TICKET_QUERY_URL = "https://kyfw.12306.cn/otn/leftTicket/queryZ"
TRAIN_SEARCH_URL = "https://search.12306.cn/search/v1/train/search"
PRICE_QUERY_URL = "https://kyfw.12306.cn/otn/leftTicket/queryTicketPrice"

# 请求控制
REQUEST_DELAY = 0.4  # 请求间隔（秒），避免被封
_last_request_time = 0.0
_rate_lock = asyncio.Lock()

# 车站映射进程内缓存（避免每次查询都重新读取/解析缓存文件）
_station_mem_cache: Optional[dict] = None
_station_mem_cache_at = 0.0
STATION_MEM_CACHE_TTL = 60  # 秒
_code_to_name: dict = {}

# ===== 内置车站映射（fallback，覆盖主要旅游城市） =====
BUILTIN_STATION_MAP = {
    # 直辖市
    "北京": [("BJP", "北京"), ("VNP", "北京南"), ("BXP", "北京西"), ("BAP", "北京北"), ("IJP", "北京东"), ("MOP", "北京朝阳")],
    "上海": [("SHH", "上海"), ("AOH", "上海虹桥"), ("SNH", "上海南"), ("SXH", "上海西")],
    "天津": [("TJP", "天津"), ("TXP", "天津西"), ("TIP", "天津南")],
    "重庆": [("CQW", "重庆"), ("CXW", "重庆西"), ("CRW", "重庆北"), ("CNW", "重庆南")],
    # 省会城市
    "广州": [("GZQ", "广州"), ("IZQ", "广州南"), ("GGQ", "广州东"), ("GAQ", "广州北")],
    "深圳": [("SZQ", "深圳"), ("NZQ", "深圳北"), ("OSQ", "深圳东"), ("SIQ", "深圳西")],
    "成都": [("CDW", "成都"), ("ICW", "成都东"), ("CNW", "成都南"), ("CMW", "成都西")],
    "杭州": [("HZH", "杭州"), ("XHH", "杭州东"), ("HHH", "杭州南"), ("ECH", "杭州西")],
    "武汉": [("WHN", "武汉"), ("LFN", "武昌"), ("GGN", "汉口"), ("XKN", "武汉东")],
    "西安": [("XAY", "西安"), ("EAY", "西安北"), ("CAY", "西安南")],
    "南京": [("NJH", "南京"), ("NKH", "南京南")],
    "长沙": [("CSQ", "长沙"), ("CWQ", "长沙南")],
    "郑州": [("ZZF", "郑州"), ("ZAF", "郑州东")],
    "合肥": [("HFH", "合肥"), ("HTH", "合肥南")],
    "福州": [("FZS", "福州"), ("FYS", "福州南")],
    "南昌": [("NCG", "南昌"), ("NXG", "南昌西")],
    "济南": [("JNK", "济南"), ("JXK", "济南西"), ("MDK", "济南东")],
    "昆明": [("KMM", "昆明"), ("KOM", "昆明南")],
    "贵阳": [("GIW", "贵阳"), ("KEW", "贵阳北"), ("KVW", "贵阳东")],
    "南宁": [("NNZ", "南宁"), ("NFZ", "南宁东")],
    "海口": [("VUQ", "海口"), ("HMQ", "海口东")],
    "石家庄": [("SJP", "石家庄"), ("SXP", "石家庄北")],
    "太原": [("TYV", "太原"), ("TNV", "太原南")],
    "呼和浩特": [("HHC", "呼和浩特"), ("NDC", "呼和浩特东")],
    "沈阳": [("SYT", "沈阳"), ("SOT", "沈阳北"), ("SDT", "沈阳南")],
    "长春": [("CCT", "长春"), ("CRT", "长春西")],
    "哈尔滨": [("HBB", "哈尔滨"), ("VBB", "哈尔滨西"), ("HTB", "哈尔滨北")],
    "兰州": [("LZJ", "兰州"), ("LEJ", "兰州西")],
    "西宁": [("XNO", "西宁")],
    "银川": [("YIJ", "银川")],
    "乌鲁木齐": [("WMR", "乌鲁木齐"), ("WAR", "乌鲁木齐南")],
    "拉萨": [("LSO", "拉萨")],
    # 热门旅游城市
    "苏州": [("SZH", "苏州"), ("OHH", "苏州北"), ("ITH", "苏州园区")],
    "无锡": [("WXH", "无锡"), ("WGH", "无锡东")],
    "宁波": [("NGH", "宁波")],
    "青岛": [("QDK", "青岛"), ("QWQ", "青岛北"), ("QDK", "青岛西")],
    "大连": [("DLT", "大连"), ("DFT", "大连北")],
    "厦门": [("XMS", "厦门"), ("XKS", "厦门北")],
    "珠海": [("ZHQ", "珠海"), ("ZIQ", "珠海北")],
    "三亚": [("SEQ", "三亚")],
    "桂林": [("GLZ", "桂林"), ("GEZ", "桂林北"), ("GBZ", "桂林西")],
    "丽江": [("LHM", "丽江")],
    "大理": [("DKM", "大理")],
    "张家界": [("DIQ", "张家界"), ("JXQ", "张家界西")],
    "黄山": [("HKH", "黄山"), ("HSH", "黄山北")],
    "洛阳": [("LYF", "洛阳"), ("LDF", "洛阳龙门")],
    "开封": [("KFF", "开封"), ("KBF", "开封北")],
    "秦皇岛": [("QTP", "秦皇岛"), ("UAP", "北戴河")],
    "威海": [("WKK", "威海"), ("WBK", "威海北")],
    "烟台": [("YAK", "烟台"), ("YBK", "烟台南")],
    "遵义": [("ZIW", "遵义")],
    "延边": [("YAL", "延吉西")],
    "湘西": [("JXG", "吉首东")],
    # 补充更多
    "徐州": [("XCH", "徐州"), ("UUH", "徐州东")],
    "常州": [("CZH", "常州"), ("CWH", "常州北")],
    "南通": [("NUH", "南通"), ("NMH", "南通西")],
    "绍兴": [("SOH", "绍兴"), ("SLH", "绍兴北")],
    "温州": [("RZH", "温州"), ("WRH", "温州南")],
    "嘉兴": [("JXH", "嘉兴"), ("JNH", "嘉兴南")],
    "湖州": [("VZH", "湖州")],
    "金华": [("JBH", "金华"), ("RNH", "金华南")],
    "台州": [("TZH", "台州"), ("TUH", "台州西")],
    "泉州": [("QYS", "泉州"), ("QGS", "泉州南")],
    "漳州": [("ZUS", "漳州")],
    "佛山": [("FSQ", "佛山"), ("FOQ", "佛山西")],
    "东莞": [("RTQ", "东莞"), ("DAQ", "东莞南")],
    "中山": [("ZSQ", "中山"), ("ZAQ", "中山北")],
    "惠州": [("HCQ", "惠州"), ("KNQ", "惠州南")],
    "江门": [("JWQ", "江门"), ("JNQ", "江门东")],
    "肇庆": [("ZVQ", "肇庆"), ("FCQ", "肇庆东")],
    "汕头": [("OTQ", "汕头"), ("JSQ", "汕头南")],
    "湛江": [("ZJZ", "湛江"), ("ZWZ", "湛江西")],
    "北海": [("BHZ", "北海")],
    "柳州": [("LZZ", "柳州")],
    "宜昌": [("YCN", "宜昌"), ("HAN", "宜昌东")],
    "襄阳": [("XFN", "襄阳"), ("XDW", "襄阳东")],
    "岳阳": [("YYQ", "岳阳"), ("YIQ", "岳阳东")],
    "衡阳": [("HYQ", "衡阳"), ("HVQ", "衡阳东")],
    "九江": [("JJG", "九江")],
    "赣州": [("GZG", "赣州"), ("GXG", "赣州西")],
    "景德镇": [("JCG", "景德镇"), ("JPG", "景德镇北")],
    "泰山": [("TAK", "泰山"), ("TMK", "泰安")],
    "曲阜": [("QFK", "曲阜"), ("QEK", "曲阜东")],
    "大同": [("DTV", "大同"), ("UDV", "大同南")],
    "平遥": [("PYV", "平遥古城")],
    "敦煌": [("DHJ", "敦煌")],
    "嘉峪关": [("JGJ", "嘉峪关"), ("JBJ", "嘉峪关南")],
    "西双版纳": [("XMR", "西双版纳")],
    "香格里拉": [("XPM", "香格里拉")],
    "阿坝": [("HMO", "黄龙九寨")],
    "腾冲": [("TDW", "腾冲")],
    "扬州": [("YLH", "扬州"), ("YZH", "扬州东")],
    "镇江": [("ZJH", "镇江"), ("ZNH", "镇江南")],
    "盐城": [("AFH", "盐城")],
    "连云港": [("UIH", "连云港"), ("UNH", "连云港东")],
    "日照": [("RZK", "日照"), ("RZK", "日照西")],
    "保定": [("BDP", "保定"), ("BOP", "保定东")],
    "承德": [("CDP", "承德"), ("COP", "承德南")],
}


async def _rate_limit():
    """控制请求频率（用 asyncio.Lock 保护检查+sleep+更新时间戳，避免并发任务同时放行导致 12306 请求瞬时集中）"""
    global _last_request_time
    async with _rate_lock:
        now = time.time()
        elapsed = now - _last_request_time
        if elapsed < REQUEST_DELAY:
            await _async_sleep(REQUEST_DELAY - elapsed)
        _last_request_time = time.time()


async def _async_sleep(seconds: float):
    """异步等待"""
    await asyncio.sleep(seconds)


async def download_station_map() -> dict[str, list[tuple[str, str]]]:
    """从 12306 下载最新车站列表并解析"""
    STATION_CACHE_DIR.mkdir(parents=True, exist_ok=True)

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(STATION_LIST_URL)
            if resp.status_code != 200:
                raise Exception(f"HTTP {resp.status_code}")

            # 解析 JS 格式: var station_names ='@bjb|北京北|VAP|beijingbei|bj|...'
            text = resp.text
            # 提取 station_names 变量值
            match = re.search(r"station_names\s*=\s*'([^']*)'", text)
            if not match:
                raise Exception("无法解析车站数据格式")

            stations_str = match.group(1)
            stations = stations_str.split("@") if stations_str else []

            # 构建搜索结构: 按城市名聚合
            city_map: dict[str, list[tuple[str, str]]] = {}
            for s in stations:
                if not s.strip():
                    continue
                parts = s.split("|")
                if len(parts) >= 3:
                    name = parts[1]  # 中文站名
                    code = parts[2]  # 电报码
                    # 提取城市名（去掉"南/北/东/西"等方向词）
                    city = _extract_city(name)
                    if city not in city_map:
                        city_map[city] = []
                    city_map[city].append((code, name))

            # 缓存到本地
            cache_data = {
                "updated_at": datetime.now().isoformat(),
                "stations": {k: v for k, v in city_map.items()},
            }
            STATION_CACHE_FILE.write_text(json.dumps(cache_data, ensure_ascii=False), encoding="utf-8")
            print(f"[TrainService] 车站数据已更新: {len(city_map)} 个城市")
            return city_map

    except Exception as e:
        print(f"[TrainService] 下载车站数据失败: {e}，使用内置映射")
        return {}


def _extract_city(station_name: str) -> str:
    """从站名提取城市名"""
    # 常见的站名后缀
    suffixes = ["南", "北", "东", "西", "站"]
    city = station_name
    # 去掉尾部的"站"
    if city.endswith("站"):
        city = city[:-1]
    # 特殊处理：如果站名长度 > 3 且以方向词结尾，去掉方向词
    for suffix in ["南", "北", "东", "西"]:
        if len(city) >= 3 and city.endswith(suffix):
            # 检查去掉后的名称是否合理
            base = city[:-1]
            # 双字城市 + 方向词 = 完整城市名
            if len(base) == 2:
                return base
            # 三字+方向词的情况，保留原样（如"秦皇岛"本身不是 "秦皇" + 方向）
    return city


def _get_station_map() -> dict[str, list[tuple[str, str]]]:
    """获取车站映射（优先进程内内存缓存 60 秒，其次磁盘缓存，最后内置映射）"""
    global _station_mem_cache, _station_mem_cache_at, _code_to_name

    now = time.time()
    if _station_mem_cache is not None and (now - _station_mem_cache_at) < STATION_MEM_CACHE_TTL:
        return _station_mem_cache

    station_map = BUILTIN_STATION_MAP
    try:
        if STATION_CACHE_FILE.exists():
            cache = json.loads(STATION_CACHE_FILE.read_text(encoding="utf-8"))
            # 检查缓存是否过期
            updated = datetime.fromisoformat(cache.get("updated_at", "2000-01-01"))
            if (datetime.now() - updated).total_seconds() < STATION_CACHE_TTL:
                station_map = cache.get("stations", {})
    except Exception:
        pass

    # 构建反查表（telecode -> 中文站名），供 _get_station_name_by_code 做 O(1) 查找
    code_to_name = {}
    for stations in station_map.values():
        for code, name in stations:
            code_to_name[code] = name

    _station_mem_cache = station_map
    _station_mem_cache_at = now
    _code_to_name = code_to_name

    return station_map


def _find_station_code(city_name: str, prefer_highspeed: bool = True) -> Optional[tuple[str, str]]:
    """根据城市名查找车站电报码"""
    station_map = _get_station_map()

    # 1. 精确匹配
    if city_name in station_map:
        stations = station_map[city_name]
        if stations:
            return _select_best_station(stations, prefer_highspeed)

    # 2. 去掉"市"后缀再匹配
    clean_name = city_name.rstrip("市")
    if clean_name in station_map:
        stations = station_map[clean_name]
        if stations:
            return _select_best_station(stations, prefer_highspeed)

    # 3. 模糊匹配（站名以城市名开头）
    for city, stations in station_map.items():
        if city.startswith(clean_name) or clean_name.startswith(city):
            return _select_best_station(stations, prefer_highspeed)

    return None


def _select_best_station(stations: list[tuple[str, str]], prefer_highspeed: bool) -> tuple[str, str]:
    """从多个车站中选择最佳的一个"""
    if not stations:
        return ("", "")
    if len(stations) == 1:
        return stations[0]

    # 12306 对主站电报码（站名=城市名，如 北京→BJP）按全市口径返回各车站的车次，
    # 因此主站优先能查到最全的结果；选了方向站（如 北京东）反而只剩极少数车次。
    # 方向站 = 末字为方位词且站名长度≥3（避免把 北京/西安 这类自带方位字的城市名误判）。
    directions = ("东", "南", "西", "北")
    def _is_directional(name: str) -> bool:
        return len(name) >= 3 and name[-1] in directions

    mains = [s for s in stations if not _is_directional(s[1])]
    if mains:
        # 多个非方向站时，站名最短的最接近城市名本身
        return min(mains, key=lambda s: len(s[1]))

    if prefer_highspeed:
        # 无主站时优先选高铁新站常在的方向
        for suffix in ("南", "西", "北", "东"):
            for code, name in stations:
                if name.endswith(suffix):
                    return (code, name)

    # 返回第一个
    return stations[0]


async def search_trains(
    from_city: str,
    to_city: str,
    date: str,
    prefer_train_type: str = "GDC"  # G=高铁, D=动车, C=城际, 默认GDC优先
) -> list[dict]:
    """
    查询两地之间的火车班次

    Args:
        from_city: 出发城市名
        to_city: 到达城市名
        date: 日期 YYYY-MM-DD
        prefer_train_type: 优先车次类型 G/D/C/K/T/Z

    Returns:
        标准化车次列表
    """
    await _rate_limit()

    # 查找车站码
    from_station = _find_station_code(from_city, prefer_highspeed=True)
    to_station = _find_station_code(to_city, prefer_highspeed=True)

    if not from_station:
        print(f"[TrainService] 未找到出发城市 '{from_city}' 的车站映射")
        return []
    if not to_station:
        print(f"[TrainService] 未找到到达城市 '{to_city}' 的车站映射")
        return []

    from_code, from_name = from_station
    to_code, to_name = to_station

    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            # 先访问 init 页面获取必要的 Cookie
            try:
                init_headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "zh-CN,zh;q=0.9",
                }
                await client.get("https://kyfw.12306.cn/otn/leftTicket/init", headers=init_headers)
            except Exception:
                pass  # Cookie 获取失败不阻塞

            # 构造 12306 查询请求
            params = {
                "leftTicketDTO.train_date": date,
                "leftTicketDTO.from_station": from_code,
                "leftTicketDTO.to_station": to_code,
                "purpose_codes": "ADULT",
            }

            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                "Referer": "https://kyfw.12306.cn/otn/leftTicket/init",
                "Accept": "*/*",
                "Accept-Language": "zh-CN,zh;q=0.9",
                "Cache-Control": "no-cache",
                "X-Requested-With": "XMLHttpRequest",
                "If-Modified-Since": "0",
            }

            resp = await client.get(TICKET_QUERY_URL, params=params, headers=headers)

            if resp.status_code != 200:
                print(f"[TrainService] 12306 API 返回 {resp.status_code}: {resp.text[:200]}")
                return []

            data = resp.json()
            if not data.get("status") and data.get("httpstatus") != 200:
                print(f"[TrainService] 12306 API 状态异常: {data.get('messages', '')}")
                return []

            # 解析结果
            result = data.get("data", {}).get("result", [])
            train_map = data.get("data", {}).get("map", {})

            trains = []
            for raw in result:
                fields = raw.split("|")
                if len(fields) < 36:
                    continue

                train_info = _parse_train_result(fields, from_name, to_name)

                # 按车次类型过滤
                train_no = train_info.get("train_no", "")
                train_code = train_info.get("id", "")
                # 如果指定了 prefer_train_type，过滤非高铁/动车
                if prefer_train_type and prefer_train_type != "ALL":
                    allowed = list(prefer_train_type)
                    if not any(train_code.startswith(t) for t in allowed):
                        continue

                if train_info:
                    trains.append(train_info)

            # 按出发时间排序
            trains.sort(key=lambda t: t.get("departure", "99:99"))

            print(f"[TrainService] {from_city} → {to_city}: 找到 {len(trains)} 个车次")
            return trains

    except httpx.TimeoutException:
        print(f"[TrainService] 12306 API 请求超时")
        return []
    except Exception as e:
        print(f"[TrainService] 查询车次失败: {e}")
        return []


def _parse_train_result(fields: list[str], from_name: str, to_name: str) -> Optional[dict]:
    """
    解析 12306 leftTicket/queryZ 返回的单条车次数据

    字段索引参考（12306 接口约定）:
      0: 车票标识
      1: 未知
      2: 未知
      3: train_no (内部编号)
      4: station_train_code (显示车次号)
      5: start_station_telecode
      6: end_station_telecode
      7: from_station_telecode
      8: to_station_telecode
      9: start_time (出发时间 HH:MM)
      10: arrive_time (到达时间 HH:MM)
      11: lishi (历时)
      12: canWebBuy
      13: yp_info
      14: start_train_date
      15: train_seat_feature
      16: location_code
      17: from_station_no
      18: to_station_no
      19: is_support_card
      20: controlled_train_flag
      21: 未知
      22: 未知
      23: 未知
      24: 未知
      25: 二等座余票 (或 "--"/"无"/数字)
      26: gr_num (高级软卧)
      27: qt_num (其他)
      28: rw_num (软卧)
      29: rz_num (软座)
      30: tz_num (特等座)
      31: wz_num (无座)
      32: yb_num (硬卧)
      33: yw_num (硬卧)
      34: yz_num (硬座)
      35: edz_num (二等座)
      36:一等座信息 (字段索引根据实际情况可能不同)
    """
    if len(fields) < 12:
        return None

    # 12306 不同接口版本的字段布局有差异：标准布局下 fields[3] 是显示车次号
    # （如 G1025）、fields[4] 是始发站电报码（如 TJP）；旧布局则相反。
    # 显示车次号有固定模式（可选一位字母 + 1-4 位数字），按模式匹配取值最稳。
    _code_candidates = [
        fields[3] if len(fields) > 3 else "",
        fields[4] if len(fields) > 4 else "",
    ]
    train_code = next(
        (c for c in _code_candidates if re.fullmatch(r"[GDCKTZSLY]?\d{1,4}", c or "")),
        _code_candidates[0] or _code_candidates[1],
    )
    from_station_tele = fields[6]
    to_station_tele = fields[7]
    depart_time = fields[8]
    arrive_time = fields[9]
    duration_str = fields[10]  # 格式: "04:31"

    # 车次类型
    train_type = _classify_train(train_code)

    # 解析历时
    duration_parts = duration_str.split(":")
    if len(duration_parts) == 2:
        hours, minutes = int(duration_parts[0]), int(duration_parts[1])
        duration_display = f"{hours}小时{minutes}分钟" if hours > 0 else f"{minutes}分钟"
        duration_minutes = hours * 60 + minutes
    else:
        duration_display = duration_str
        duration_minutes = 0

    # 座位和票价（从字段中提取，12306 不直接在列表中返回票价）
    seats = {}
    # 余票信息
    seat_fields = {
        "二等座": 30,  # edz_num
        "一等座": 31,
        "商务座": 32,
        "特等座": 25,
        "软卧": 23,
        "硬卧": 28,
        "硬座": 29,
        "无座": 26,
    }
    for seat_name, idx in seat_fields.items():
        if idx < len(fields) and fields[idx] not in ("", "--", "无", "*"):
            seats[seat_name] = fields[idx] if fields[idx] != "" else "有票"

    # 生成唯一标识
    train_id = fields[2] if len(fields) > 2 else train_code

    # 获取出发和到达车站的 telecode
    from_tele = from_station_tele if from_station_tele else ""
    to_tele = to_station_tele if to_station_tele else ""

    # 使用车站映射获取中文站名
    from_station_display = _get_station_name_by_code(from_tele) or from_name
    to_station_display = _get_station_name_by_code(to_tele) or to_name

    return {
        "id": train_code,
        "train_no": train_id,
        "from_station": from_station_display,
        "to_station": to_station_display,
        "departure": depart_time,
        "arrival": arrive_time,
        "time": f"{depart_time} - {arrive_time}",
        "duration": duration_display,
        "duration_minutes": duration_minutes,
        "train_type": train_type,
        "seats": seats,
        "desc": f"{train_type} · {from_station_display} → {to_station_display}",
        "source": "12306",
    }


def _classify_train(train_code: str) -> str:
    """根据车次号判断列车类型"""
    if not train_code:
        return "未知"
    prefix = train_code[0].upper()
    type_map = {
        "G": "高铁",
        "D": "动车",
        "C": "城际",
        "Z": "直达",
        "T": "特快",
        "K": "快速",
        "L": "临客",
        "Y": "旅游",
        "S": "市郊",
    }
    return type_map.get(prefix, "普速")


def _get_station_name_by_code(telecode: str) -> Optional[str]:
    """根据电报码查找站名（O(1) 反查表，由 _get_station_map() 构建/刷新）"""
    _get_station_map()  # 确保 _code_to_name 已按当前缓存状态构建
    return _code_to_name.get(telecode)


async def search_train_by_number(train_no: str, date: str) -> Optional[dict]:
    """按车次号搜索列车信息"""
    await _rate_limit()

    try:
        params = {
            "keyword": train_no,
            "date": date,
        }
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json",
            "Referer": "https://www.12306.cn/",
        }

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(TRAIN_SEARCH_URL, params=params, headers=headers)

        if resp.status_code != 200:
            print(f"[TrainService] 车次搜索失败: HTTP {resp.status_code}")
            return None

        data = resp.json()
        results = data.get("data", [])
        if results:
            first = results[0]
            return {
                "id": first.get("station_train_code", train_no),
                "train_no": first.get("train_no", train_no),
                "from_station": first.get("from_station_name", ""),
                "to_station": first.get("to_station_name", ""),
                "departure": first.get("start_time", ""),
                "arrival": first.get("arrive_time", ""),
                "duration": first.get("lishi", ""),
            }
        return None

    except Exception as e:
        print(f"[TrainService] 车次搜索异常: {e}")
        return None


async def init_station_data():
    """在服务启动时初始化车站数据"""
    print("[TrainService] 正在初始化车站数据...")
    try:
        await download_station_map()
    except Exception as e:
        print(f"[TrainService] 初始化车站数据失败（将使用内置映射）: {e}")
