import re
from pathlib import Path


SYSTEM_PROMPT = "你是一位专业的中国旅行规划师，擅长串联多个城市，根据景点数据和用户偏好规划完美的旅行路线。请始终输出合法的 JSON 格式。"

PROMPT_TEMPLATE_PATH = Path(__file__).resolve().parents[1] / "prompts" / "itinerary.md"


def load_itinerary_prompt_template() -> str:
    return PROMPT_TEMPLATE_PATH.read_text(encoding="utf-8")


def build_destination_detail(destinations: list, route_shape: str = "one_way") -> tuple[str, str]:
    detail_rows = []
    names = []
    for city in destinations:
        names.append(city.name)
        plan_stay = getattr(city, "plan_stay", None)
        days = city.days
        if plan_stay is False or days == 0:
            detail_rows.append(f"- {city.name}（仅出发/过境，不要安排当地游玩日与景点）")
            continue
        days_info = f"（规划 {days} 天）" if days else "（停留天数未指定，请由你根据景点分配天数）"
        detail_rows.append(f"- {city.name}{days_info}")
    route = " -> ".join(names)
    if route_shape == "round_trip" and names:
        route = f"{route} -> {names[0]}"
        detail_rows.append(
            f"- 【环线闭合】行程必须回到起点 {names[0]}："
            "transport_guide 须包含最后一城回到起点的段；"
            "可在最后一天上午游玩末城、下午/晚上返回起点，"
            "返回段可不新增景点（除非起点本身安排了游玩日）。"
        )
    return "\n".join(detail_rows), route


def build_transport_rules(destinations: list, global_transport: str, route_shape: str = "one_way") -> str:
    transport_labels = {
        "auto": "智能混合推荐",
        "train": "高铁/火车优先",
        "plane": "飞机优先",
        "driving": "自驾优先",
    }
    rules = [f"- 【全局城际出行偏好】：{transport_labels.get(global_transport, '智能混合推荐')}"]

    for i in range(1, len(destinations)):
        previous = destinations[i - 1].name
        current = destinations[i].name
        transport = destinations[i].transport
        if transport and transport != "auto":
            transport_zh = {"train": "高铁", "plane": "飞机", "driving": "自驾", "bus": "大巴"}.get(transport, "智能推荐")
            rules.append(f"- 【特指分段出行限制】：从 【{previous}】 前往 【{current}】 时，必须使用【{transport_zh}】进行城际转移。")

    if route_shape == "round_trip" and len(destinations) >= 2:
        origin = destinations[0].name
        last = destinations[-1].name
        if origin != last:
            tool = global_transport if global_transport in ("train", "plane", "driving") else "auto"
            transport_zh = {"train": "高铁", "plane": "飞机", "driving": "自驾", "auto": "与全局偏好一致的方式"}.get(tool, "合适交通")
            rules.append(
                f"- 【环线回程】：行程结束时必须从 【{last}】 返回 【{origin}】，"
                f"transport_guide 必须包含 `{last} → {origin}` 段，交通方式优先【{transport_zh}】。"
            )

    return "\n".join(rules)


def build_poi_list_text(city_data: list[dict], total_days: int, destination_count: int) -> tuple[str, list[dict]]:
    poi_list_text = ""
    all_pois = []
    for city_item in city_data:
        city_name = city_item.get("city", "")
        pois = city_item.get("pois", [])
        all_pois.extend(pois)

        c_days = city_item.get("days") or (total_days // destination_count) or 2
        max_pois = min(20, max(12, c_days * 6))

        poi_list_text += f"\n### {city_name} 的可用候选景点：\n"
        if not pois:
            poi_list_text += "（无高德景点数据，请直接根据你的知识库规划该城市的知名景点）\n"
        for i, poi in enumerate(pois[:max_pois], 1):
            rating = f"评分{poi.get('rating','')}" if poi.get("rating") else ""
            poi_list_text += f"{i}. {poi['name']}（{poi.get('type','')}，{rating}，地址:{poi.get('address','')}）\n"

    return poi_list_text, all_pois


def build_weather_text(city_weather: dict) -> str:
    weather_text = ""
    for city_name, casts in city_weather.items():
        weather_text += f"\n### {city_name} 天气预报：\n"
        for cast in casts:
            weather_text += (
                f"- {cast.get('date', '')}：白天{cast.get('dayweather', '')}"
                f"/夜间{cast.get('nightweather', '')}，"
                f"气温 {cast.get('nighttemp', '')}~{cast.get('daytemp', '')}℃\n"
            )
    return weather_text


def render_prompt(template: str, replacements: dict[str, str]) -> str:
    def replace_placeholder(match: re.Match) -> str:
        key = match.group(1)
        return replacements.get(key, match.group(0))

    return re.sub(r"\[([A-Z_]+)\]", replace_placeholder, template)


def build_itinerary_prompt(request, city_weather: dict) -> tuple[str, list[dict]]:
    route_shape = getattr(request, "route_shape", None) or "one_way"
    playable = [
        city
        for city in request.destinations
        if getattr(city, "plan_stay", None) is not False and (city.days is None or city.days > 0)
    ]
    destination_count = max(1, len(playable) or len(request.destinations))
    cities_detail, route = build_destination_detail(request.destinations, route_shape)
    poi_list_text, all_pois = build_poi_list_text(
        request.city_data,
        request.days,
        destination_count,
    )
    weather_text = build_weather_text(city_weather)
    transport_rules = build_transport_rules(
        request.destinations, request.global_transport, route_shape
    )

    prompt = render_prompt(
        load_itinerary_prompt_template(),
        {
            "WEATHER_INFO": weather_text or "（暂无天气数据，按常规安排）",
            "DAYS": str(request.days),
            "DEPARTURE": request.departure or "未指定",
            "ROUTE": route,
            "CITIES_DETAIL": cities_detail,
            "PACE": request.pace,
            "BUDGET": request.budget,
            "INTERESTS": request.interests or "无特殊偏好",
            "TRANSPORT_RULES": transport_rules,
            "POI_LIST": poi_list_text,
        },
    )
    return prompt, all_pois
