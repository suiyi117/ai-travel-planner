import asyncio
import math
import re

from services.flight_service import search_flights
from services.train_service import search_trains


def build_segments_from_destinations(
    destinations: list,
    global_transport: str,
    ai_guide: list[dict],
) -> list[dict]:
    """Build stable inter-city transport segments from the destination list."""
    segments = []
    guide_len = len(ai_guide) if ai_guide else 0

    for i in range(1, len(destinations)):
        prev = destinations[i - 1]
        curr = destinations[i]
        ai_seg = ai_guide[i - 1] if (i - 1) < guide_len else {}

        tool = None
        if curr.transport in ("train", "plane", "driving"):
            tool = curr.transport
        elif global_transport in ("train", "plane", "driving"):
            tool = global_transport
        else:
            ai_tool = ai_seg.get("tool")
            if ai_tool in ("train", "plane"):
                tool = ai_tool
        if not tool:
            tool = "train"

        segments.append({
            "segment": f"{prev.name} → {curr.name}",
            "from_city": prev.name,
            "to_city": curr.name,
            "tool": tool,
            "advice": ai_seg.get("advice", ""),
            "options": ai_seg.get("options", []),
        })

    expected_len = max(0, len(destinations) - 1)
    if guide_len > expected_len:
        print(
            f"[TransportSegments] AI 返回的 transport_guide 段数 ({guide_len}) 多于目的地分段数 "
            f"({expected_len})，丢弃多余 {guide_len - expected_len} 段"
        )

    return segments


async def enrich_one_segment(segment: dict, travel_date: str, budget: str = "") -> dict:
    """Enhance one transport segment. Never raises bare exceptions to callers."""
    try:
        seg_str = segment.get("segment", "")
        tool = segment.get("tool", "train")

        if tool == "driving":
            seg = segment.copy()
            seg["options"] = segment.get("options", [])
            seg["data_source"] = "ai_fallback"
            seg["source_label"] = "自驾（AI 预估）"
            return seg

        from_city = segment.get("from_city") or ""
        to_city = segment.get("to_city") or ""
        if not from_city or not to_city:
            from_city, to_city = parse_segment_cities(seg_str)

        if not from_city or not to_city:
            seg = segment.copy()
            seg["options"] = segment.get("options", [])
            seg["data_source"] = "ai_fallback"
            return seg

        print(f"[TransportEnrich] 查询真实车次: {from_city} → {to_city} (tool={tool})")

        real_options = []
        options_source = "ai_fallback"

        if tool == "train":
            try:
                trains = await search_trains(from_city, to_city, travel_date, prefer_train_type=resolve_train_type_pref(budget))
                if trains:
                    options_source = "real"
                    for t in trains[:8]:
                        price = estimate_train_price(t.get("duration_minutes", 0), t.get("train_type", ""))

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

                        real_options.append({
                            "id": t.get("id") or t.get("train_no", ""),
                            "time": t.get("time", ""),
                            "duration": t.get("duration", ""),
                            "price": price,
                            "desc": desc,
                            "from_station": t.get("from_station", ""),
                            "to_station": t.get("to_station", ""),
                            "train_type": t.get("train_type", ""),
                            "seats": seats,
                            "source": "12306",
                        })
                else:
                    real_options = segment.get("options", [])
            except Exception as e:
                print(f"[TransportEnrich] 火车查询失败: {e}")
                real_options = segment.get("options", [])

        elif tool == "plane":
            try:
                flights = await search_flights(from_city, to_city, travel_date)
                if flights:
                    flight_sources = {str(f.get("source", "")) for f in flights}
                    options_source = "reference" if "典型航线数据" in flight_sources else "real"
                    for f in flights[:8]:
                        price = f.get("price", "")
                        if price and not str(price).startswith("¥"):
                            price = f"¥{price}"
                        elif not price:
                            price = estimate_flight_price(
                                from_city, to_city, parse_duration_minutes(f.get("duration", ""))
                            )

                        real_options.append({
                            "id": f.get("id", ""),
                            "time": f.get("time", ""),
                            "duration": f.get("duration", ""),
                            "price": price,
                            "desc": f.get("desc", ""),
                            "from_station": f.get("from_airport", ""),
                            "to_station": f.get("to_airport", ""),
                            "airline": f.get("airline", ""),
                            "aircraft": f.get("aircraft", ""),
                            "source": f.get("source", ""),
                        })
                else:
                    real_options = segment.get("options", [])
            except Exception as e:
                print(f"[TransportEnrich] 航班查询失败: {e}")
                real_options = segment.get("options", [])
        else:
            real_options = segment.get("options", [])

        seg = segment.copy()
        real_options, removed_count = filter_direction_options(real_options, from_city, to_city, tool)
        if removed_count:
            seg["direction_warning"] = f"已过滤 {removed_count} 个方向不一致的交通选项"

        if real_options and tool == "train" and options_source == "real":
            seg["options"] = real_options
            seg["data_source"] = "real"
            seg["source_label"] = "12306 实时数据"
        elif real_options and tool == "plane" and options_source in ("real", "reference"):
            seg["options"] = real_options
            if options_source == "reference":
                seg["data_source"] = "reference"
                seg["source_label"] = "典型参考数据"
            else:
                seg["data_source"] = "real"
                seg["source_label"] = "实时航班数据"
        else:
            seg["options"] = real_options
            seg["data_source"] = "ai_fallback"
            seg["source_label"] = "AI 预估，需确认"

        return seg
    except Exception as e:
        print(f"[TransportEnrich] 分段处理异常: {e}")
        seg = segment.copy()
        seg["options"] = segment.get("options", [])
        seg["data_source"] = "ai_fallback"
        seg.setdefault("source_label", "AI 预估，需确认")
        return seg


async def enrich_transport_guide(
    transport_guide: list[dict],
    destinations: list,
    travel_date: str,
    budget: str = "",
) -> list[dict]:
    """Enhance transport guide options with real or reference transport data."""
    return list(await asyncio.gather(*(enrich_one_segment(seg, travel_date, budget) for seg in transport_guide)))


def city_token(city: str) -> str:
    return str(city or "").strip().rstrip("市")


def text_has_city(text: str, city: str) -> bool:
    token = city_token(city)
    return bool(token and token in str(text or ""))


def arrow_sides(text: str) -> tuple[str, str] | None:
    value = str(text or "")
    for sep in ("→", "->", "到", "至"):
        if sep in value:
            left, right = value.split(sep, 1)
            return left, right
    return None


def option_matches_direction(option: dict, from_city: str, to_city: str, tool: str) -> bool:
    """Filter clearly reversed transport options; conservatively allow incomplete data."""
    from_station = option.get("from_station") or option.get("from_airport") or ""
    to_station = option.get("to_station") or option.get("to_airport") or ""
    desc = option.get("desc", "")

    if from_station or to_station:
        if from_station and not text_has_city(from_station, from_city):
            return False
        if to_station and not text_has_city(to_station, to_city):
            return False
        return True

    sides = arrow_sides(desc)
    if sides:
        left, right = sides
        if text_has_city(left, to_city) and text_has_city(right, from_city):
            return False
        if text_has_city(left, from_city) and text_has_city(right, to_city):
            return True

    return True


def filter_direction_options(options: list[dict], from_city: str, to_city: str, tool: str) -> tuple[list[dict], int]:
    valid = [option for option in options if option_matches_direction(option, from_city, to_city, tool)]
    return valid, len(options) - len(valid)


def mentioned_transport_ids(text: str) -> set[str]:
    ids = set()
    for item in re.findall(r"\b(?:[A-Z]{1,3})?\d{2,5}\b", str(text or "").upper()):
        if item.isdigit():
            continue
        ids.add(item)
    return ids


def build_quality_checks(itinerary: dict) -> dict:
    items: list[dict] = []
    guide = itinerary.get("transport_guide") or []

    for segment in guide:
        from_city = segment.get("from_city") or ""
        to_city = segment.get("to_city") or ""
        label = segment.get("segment") or f"{from_city} → {to_city}"
        tool = segment.get("tool", "")
        options = segment.get("options") or []
        source_label = segment.get("source_label") or ""

        if segment.get("direction_warning"):
            items.append({"level": "error", "message": f"{label}：{segment['direction_warning']}。"})

        if not options and tool != "driving":
            items.append({"level": "warn", "message": f"{label}：暂无可用班次，需要人工确认交通。"})

        if "AI 预估" in source_label or segment.get("data_source") == "ai_fallback":
            items.append({"level": "warn", "message": f"{label}：交通为 AI 预估，交付前需核对。"})
        elif segment.get("data_source") == "reference":
            items.append({"level": "warn", "message": f"{label}：使用典型参考数据，不代表实时余票或票价。"})

        for option in options:
            if not option_matches_direction(option, from_city, to_city, tool):
                option_id = option.get("id") or "交通选项"
                items.append({"level": "error", "message": f"{label}：{option_id} 方向与路线不一致。"})

        advice_ids = mentioned_transport_ids(segment.get("advice", ""))
        if advice_ids and options:
            option_ids = {str(option.get("id", "")).upper() for option in options}
            if not advice_ids.intersection(option_ids):
                items.append({"level": "warn", "message": f"{label}：交通建议提到的班次未出现在候选列表中。"})

    if not items:
        return {
            "status": "pass",
            "summary": "可交付",
            "items": [{"level": "ok", "message": "交通方向和数据来源检查通过。"}],
        }

    has_error = any(item["level"] == "error" for item in items)
    return {
        "status": "error" if has_error else "review",
        "summary": "存在问题" if has_error else "需人工确认",
        "items": items,
    }


def resolve_train_type_pref(budget: str) -> str:
    """Resolve train class filter from budget preference."""
    return "GDCKTZ" if any(k in (budget or "") for k in ("经济", "预算", "穷游")) else "GDC"


def parse_segment_cities(segment: str) -> tuple:
    """Parse a segment string like '北京 → 西安'."""
    if not segment:
        return (None, None)

    for sep in [" → ", "→", " -> ", "->", " - ", "-", " 到 ", "至"]:
        parts = segment.split(sep)
        if len(parts) == 2:
            return (parts[0].strip(), parts[1].strip())

    return (None, None)


def parse_duration_minutes(duration_str: str) -> int:
    """Parse Chinese duration text into minutes."""
    if not duration_str:
        return 0
    total = 0
    hour_match = re.search(r"(\d+)\s*小时", duration_str)
    min_match = re.search(r"(\d+)\s*分钟", duration_str)
    if hour_match:
        total += int(hour_match.group(1)) * 60
    if min_match:
        total += int(min_match.group(1))
    return total


def estimate_train_price(duration_minutes: int, train_type: str) -> str:
    """Estimate train ticket price from duration and train class."""
    if train_type in ("高铁", "动车", "城际"):
        price = max(20, int(duration_minutes * 1.9))
    elif train_type == "直达":
        price = max(15, int(duration_minutes * 0.4))
    else:
        price = max(10, int(duration_minutes * 0.25))
    return f"¥{price}"


def estimate_flight_price(from_city: str, to_city: str, duration_minutes: int = 0) -> str:
    """Estimate flight price from duration."""
    if duration_minutes <= 90:
        price = "¥300-500"
    elif duration_minutes <= 150:
        price = "¥500-1000"
    elif duration_minutes <= 210:
        price = "¥800-1500"
    else:
        price = "¥1500-2500"
    return price


def haversine_km(a: dict, b: dict) -> float:
    """Calculate distance between two {lat, lng} points in kilometers."""
    lat1, lng1 = math.radians(a.get("lat", 0)), math.radians(a.get("lng", 0))
    lat2, lng2 = math.radians(b.get("lat", 0)), math.radians(b.get("lng", 0))
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(h))


def nearest_neighbor_order(spots: list) -> list:
    """Order same-slot POIs by greedy nearest-neighbor routing."""
    if not isinstance(spots, list) or len(spots) < 2:
        return spots

    with_coords = [s for s in spots if isinstance(s, dict) and s.get("lat") and s.get("lng")]
    without_coords = [s for s in spots if not (isinstance(s, dict) and s.get("lat") and s.get("lng"))]

    if len(with_coords) < 2:
        return spots

    remaining = with_coords[:]
    ordered = [remaining.pop(0)]
    while remaining:
        current = ordered[-1]
        nearest_idx = min(range(len(remaining)), key=lambda i: haversine_km(current, remaining[i]))
        ordered.append(remaining.pop(nearest_idx))

    return ordered + without_coords
