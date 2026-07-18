"""Deterministic door-to-door itinerary scheduling.

The language model proposes places and approximate durations. This module turns
that proposal into an executable timeline after transport data has been loaded.
It deliberately prefers a lighter day or an explicit alternative over silently
overlapping transport, meals, opening hours, and attraction visits.
"""

from __future__ import annotations

import copy
import math
import re
from datetime import datetime, timedelta

from planner.transport import haversine_km, segment_departure_offsets


TRANSPORT_BUFFERS = {
    "train": {
        "pre": 80,
        "post": 60,
        "pre_label": "市内前往车站 45 分钟 + 提前进站 35 分钟",
        "post_label": "出站 15 分钟 + 前往酒店/景点 45 分钟",
    },
    "plane": {
        "pre": 150,
        "post": 105,
        "pre_label": "前往机场 60 分钟 + 值机安检 90 分钟",
        "post_label": "落地取行李 45 分钟 + 进城 60 分钟",
    },
    "driving": {
        "pre": 15,
        "post": 20,
        "pre_label": "取车与装载 15 分钟",
        "post_label": "停车与入住 20 分钟",
    },
}


def parse_time_range(value: str) -> tuple[int, int] | None:
    """Parse a clock range into minutes, preserving overnight arrival."""
    match = re.search(
        r"(\d{1,2}):(\d{2})\s*(?:-|–|—|~|至|到)\s*(?:次日\s*)?(\d{1,2}):(\d{2})",
        str(value or ""),
    )
    if not match:
        return None
    start_hour, start_minute, end_hour, end_minute = (int(item) for item in match.groups())
    if start_hour > 23 or end_hour > 23 or start_minute > 59 or end_minute > 59:
        return None
    start = start_hour * 60 + start_minute
    end = end_hour * 60 + end_minute
    if end <= start:
        end += 1440
    return start, end


def parse_duration_minutes(value) -> int:
    if isinstance(value, (int, float)):
        return max(0, int(value))
    text = str(value or "")
    total = 0.0
    hour_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:小时|小時|h(?:ours?)?)", text, re.IGNORECASE)
    minute_match = re.search(r"(\d+)\s*(?:分钟|分鐘|min(?:utes?)?)", text, re.IGNORECASE)
    if hour_match:
        total += float(hour_match.group(1)) * 60
    if minute_match:
        total += int(minute_match.group(1))
    if not total:
        colon_match = re.fullmatch(r"\s*(\d{1,2}):(\d{2})\s*", text)
        if colon_match:
            total = int(colon_match.group(1)) * 60 + int(colon_match.group(2))
    return max(0, int(round(total)))


def format_clock(minutes: int) -> str:
    marker = ""
    if minutes < 0:
        marker = "前一日 "
    elif minutes >= 1440:
        marker = "次日 "
    normalized = minutes % 1440
    return f"{marker}{normalized // 60:02d}:{normalized % 60:02d}"


def format_time_range(start: int, end: int) -> str:
    return f"{format_clock(start)} - {format_clock(end)}"


def _date_with_offset(start_date: str, offset: int) -> str:
    if not start_date:
        return ""
    try:
        base = datetime.strptime(str(start_date)[:10], "%Y-%m-%d")
    except ValueError:
        return str(start_date)
    return (base + timedelta(days=max(0, offset))).strftime("%Y-%m-%d")


def _city_name(destination) -> str:
    if isinstance(destination, dict):
        return str(destination.get("name") or "")
    return str(getattr(destination, "name", "") or "")


def _city_token(value: object | None) -> str:
    return str(value or "").strip().rstrip("市")


def _is_return_segment(segment: dict, destinations: list) -> bool:
    if len(destinations) < 2:
        return False
    return (
        _city_token(segment.get("from_city")) == _city_token(_city_name(destinations[-1]))
        and _city_token(segment.get("to_city")) == _city_token(_city_name(destinations[0]))
    )


def _transport_duration_hint(segment: dict) -> int:
    for option in segment.get("options") or []:
        parsed = parse_duration_minutes(option.get("duration"))
        if parsed:
            return parsed
        parsed_range = parse_time_range(option.get("time", ""))
        if parsed_range:
            return parsed_range[1] - parsed_range[0]
    parsed = parse_duration_minutes(segment.get("advice"))
    return parsed or 180


def _normalize_transport_option(option: dict, tool: str, *, is_return: bool, duration_hint: int) -> dict:
    normalized = copy.deepcopy(option)
    vehicle_range = parse_time_range(normalized.get("time", ""))
    duration = parse_duration_minutes(normalized.get("duration")) or duration_hint
    buffers = TRANSPORT_BUFFERS.get(tool, TRANSPORT_BUFFERS["train"])
    pre_buffer = buffers["pre"]
    post_buffer = buffers["post"]
    assert isinstance(pre_buffer, int)
    assert isinstance(post_buffer, int)
    if not vehicle_range:
        if tool == "driving" and duration > 120:
            duration += max(0, (duration - 1) // 120) * 15
        if is_return:
            departure = max(
                8 * 60,
                min(16 * 60 + 30, 22 * 60 + 30 - post_buffer - duration),
            )
        else:
            departure = 8 * 60 + 30
        vehicle_range = departure, departure + max(30, duration)
        normalized["time"] = format_time_range(*vehicle_range)
        normalized.setdefault("duration", f"{max(30, duration) // 60}小时{max(30, duration) % 60}分钟")

    blocked_start = vehicle_range[0] - pre_buffer
    blocked_end = vehicle_range[1] + post_buffer
    schedule = {
        "vehicle_start_minutes": vehicle_range[0],
        "vehicle_end_minutes": vehicle_range[1],
        "blocked_start_minutes": blocked_start,
        "blocked_end_minutes": blocked_end,
        "pre_buffer_minutes": pre_buffer,
        "post_buffer_minutes": post_buffer,
        "pre_buffer_label": buffers["pre_label"],
        "post_buffer_label": buffers["post_label"],
        "vehicle_time": format_time_range(*vehicle_range),
        "door_to_door_time": format_time_range(blocked_start, blocked_end),
    }
    normalized["schedule"] = schedule
    normalized["door_to_door_time"] = schedule["door_to_door_time"]
    normalized["recommended"] = False
    return normalized


def _option_score(option: dict, *, is_return: bool, earliest_start: int | None) -> float:
    schedule = option["schedule"]
    start = int(schedule["blocked_start_minutes"])
    end = int(schedule["blocked_end_minutes"])
    score: float
    if is_return:
        score = float(-start)
        score += max(0, 15 * 60 - start) * 3
        score += max(0, end - (23 * 60 + 30)) * 12
        return score

    score = float(end)
    score += max(0, 6 * 60 - start) * 20
    score += max(0, end - 18 * 60) * 3
    if earliest_start is not None and start < earliest_start:
        score += 10000 + (earliest_start - start) * 10
    return score


def _prepare_transport_schedule(
    itinerary: dict,
    destinations: list,
    *,
    start_date: str,
) -> tuple[dict[int, list[dict]], list[dict]]:
    guide = itinerary.get("transport_guide") or []
    total_days = max(
        [int(day.get("day") or 0) for day in itinerary.get("days") or []] or [1]
    )
    offsets = segment_departure_offsets(destinations, guide)
    transfers_by_day: dict[int, list[dict]] = {}
    warnings: list[dict] = []
    previous_end_by_day: dict[int, int] = {}

    for segment_index, (segment, offset) in enumerate(zip(guide, offsets)):
        is_return = _is_return_segment(segment, destinations) and segment_index >= len(destinations) - 1
        day_number = total_days if is_return else min(total_days, max(1, offset + 1))
        travel_date = segment.get("travel_date") or _date_with_offset(start_date, offset)
        tool = str(segment.get("tool") or "train")
        raw_options = segment.get("options") or []
        if not raw_options and tool == "driving":
            raw_options = [
                {
                    "id": "自驾",
                    "duration": f"{_transport_duration_hint(segment)}分钟",
                    "desc": "按城市间自驾时长估算，出发前请用导航复核实时路况。",
                }
            ]

        duration_hint = _transport_duration_hint(segment)
        options = [
            _normalize_transport_option(
                option,
                tool,
                is_return=is_return,
                duration_hint=duration_hint,
            )
            for option in raw_options
        ]
        if not options:
            segment["scheduled_day"] = day_number
            segment["travel_date"] = travel_date
            warnings.append(
                {
                    "level": "warn",
                    "code": "transport_time_unavailable",
                    "message": f"{segment.get('segment', '城际交通')}：没有可排程时刻，无法锁定跨城日的可用时间。",
                }
            )
            continue

        connection_start = previous_end_by_day.get(day_number)
        if connection_start is not None:
            connection_start += 30
        selected_index = min(
            range(len(options)),
            key=lambda index: _option_score(
                options[index],
                is_return=is_return,
                earliest_start=connection_start,
            ),
        )
        selected = options[selected_index]
        selected["recommended"] = True
        options = [selected, *[option for index, option in enumerate(options) if index != selected_index]]
        segment["options"] = options
        segment["recommended_option_id"] = selected.get("id") or ""
        segment["recommended_option_index"] = 0
        segment["scheduled_day"] = day_number
        segment["travel_date"] = travel_date
        segment["door_to_door_time"] = selected["door_to_door_time"]

        schedule = selected["schedule"]
        previous_end = previous_end_by_day.get(day_number)
        if previous_end is not None and int(schedule["blocked_start_minutes"]) < previous_end + 30:
            warnings.append(
                {
                    "level": "error",
                    "code": "transport_connection_conflict",
                    "message": f"Day {day_number}：{segment.get('segment')} 与上一段交通缺少 30 分钟换乘缓冲。",
                }
            )
        previous_end_by_day[day_number] = int(schedule["blocked_end_minutes"])

        option_id = selected.get("id") or ("自驾" if tool == "driving" else "首选班次")
        if is_return:
            action = f"最晚从 {format_clock(int(schedule['blocked_start_minutes']))} 开始返程准备"
        else:
            action = f"抵达并完成进城接驳后，最早 {format_clock(int(schedule['blocked_end_minutes']))} 安排景点"
        advice = (
            f"优先 {option_id}（运行 {selected.get('time', '')}）；"
            f"门到门需预留 {selected['door_to_door_time']}，{action}。"
        )
        if segment.get("advice") and segment.get("advice") != advice:
            segment["ai_advice"] = segment["advice"]
        segment["advice"] = advice
        segment["schedule_advice"] = advice

        transfer = {
            "segment": segment.get("segment") or "",
            "from_city": segment.get("from_city") or "",
            "to_city": segment.get("to_city") or "",
            "tool": tool,
            "option_id": option_id,
            "time": selected["door_to_door_time"],
            "vehicle_time": selected.get("time") or "",
            "duration": selected.get("duration") or "",
            "travel_date": travel_date,
            "pre_buffer_minutes": schedule["pre_buffer_minutes"],
            "post_buffer_minutes": schedule["post_buffer_minutes"],
            "blocked_start_minutes": schedule["blocked_start_minutes"],
            "blocked_end_minutes": schedule["blocked_end_minutes"],
            "is_return": is_return,
        }
        transfers_by_day.setdefault(day_number, []).append(transfer)

        if int(schedule["blocked_start_minutes"]) < 6 * 60:
            warnings.append(
                {
                    "level": "warn",
                    "code": "impractical_early_departure",
                    "message": f"Day {day_number}：{segment.get('segment')} 的门到门准备早于 06:00。",
                }
            )
        if int(schedule["blocked_end_minutes"]) > 23 * 60 + 30:
            warnings.append(
                {
                    "level": "warn",
                    "code": "impractical_late_arrival",
                    "message": f"Day {day_number}：{segment.get('segment')} 的门到门抵达晚于 23:30。",
                }
            )

    return transfers_by_day, warnings


def _day_window(pace: str) -> tuple[int, int]:
    value = str(pace or "")
    if any(token in value for token in ("休闲", "轻松", "松弛", "慢")):
        return 9 * 60 + 30, 19 * 60 + 30
    if any(token in value for token in ("紧凑", "特种兵", "高强度", "快")):
        return 8 * 60 + 30, 20 * 60 + 30
    return 9 * 60, 20 * 60


def _subtract_intervals(window: tuple[int, int], blocks: list[tuple[int, int]]) -> list[tuple[int, int]]:
    start, end = window
    normalized = sorted(
        (max(start, block_start), min(end, block_end))
        for block_start, block_end in blocks
        if block_end > start and block_start < end
    )
    free: list[tuple[int, int]] = []
    cursor = start
    for block_start, block_end in normalized:
        if block_start > cursor:
            free.append((cursor, block_start))
        cursor = max(cursor, block_end)
    if cursor < end:
        free.append((cursor, end))
    return free


def _choose_lunch(free: list[tuple[int, int]]) -> tuple[tuple[int, int] | None, bool]:
    target = 12 * 60 + 30
    for duration in (60, 45, 30):
        candidates: list[tuple[float, int, int]] = []
        for start, end in free:
            if end - start < duration:
                continue
            lunch_start = min(max(target, start), end - duration)
            outside_penalty = 0 if 11 * 60 + 30 <= lunch_start <= 15 * 60 else 240
            candidates.append((abs(lunch_start - target) + outside_penalty, lunch_start, duration))
        if candidates:
            _score, lunch_start, chosen_duration = min(candidates)
            return (lunch_start, lunch_start + chosen_duration), chosen_duration < 45
    return None, True


def _spot_duration(spot: dict) -> int:
    duration = parse_duration_minutes(spot.get("duration_minutes"))
    if not duration:
        duration = parse_duration_minutes(spot.get("tips"))
    if not duration:
        original_range = parse_time_range(spot.get("time", ""))
        if original_range:
            duration = original_range[1] - original_range[0]
    if not duration and any(token in str(spot.get("name") or "") for token in ("迪士尼", "环球影城", "长隆", "欢乐谷")):
        duration = 360
    return min(480, max(45, duration or 120))


def _opening_intervals(spot: dict, date: str) -> tuple[list[tuple[int, int]] | None, str | None]:
    text = str(spot.get("opentime") or "").strip()
    if not text or any(token in text for token in ("全天", "24小时", "24 小时")):
        return None, None
    if date:
        try:
            weekday = "一二三四五六日"[datetime.strptime(date, "%Y-%m-%d").weekday()]
        except ValueError:
            weekday = ""
        if weekday and re.search(rf"(?:周|星期){weekday}[^；;,]*?(?:闭馆|不开放|休息)", text):
            return [], f"{date} 按开放信息为闭馆/休息日"

    intervals = []
    for match in re.finditer(r"(\d{1,2}):(\d{2})\s*[-–—~至到]\s*(\d{1,2}):(\d{2})", text):
        start = int(match.group(1)) * 60 + int(match.group(2))
        end = int(match.group(3)) * 60 + int(match.group(4))
        if 0 <= start < 1440 and 0 < end <= 1440:
            if end <= start:
                end += 1440
            intervals.append((start, end))
    return (intervals or None), None


def _transfer_estimate(previous: dict | None, current: dict) -> dict:
    if not previous:
        return {"minutes": 0, "distance_km": 0, "mode": "arrival", "source": "included_in_day_start"}
    try:
        if not all(float(item.get(field) or 0) for item in (previous, current) for field in ("lat", "lng")):
            raise ValueError
        distance = haversine_km(previous, current) * 1.25
    except (TypeError, ValueError):
        return {"minutes": 15, "distance_km": None, "mode": "local_transit", "source": "conservative_default"}

    if distance <= 1.5:
        mode = "walk"
        minutes = distance / 4.5 * 60 + 5
    elif distance <= 12:
        mode = "local_transit"
        minutes = distance / 18 * 60 + 15
    else:
        mode = "taxi_or_transit"
        minutes = distance / 25 * 60 + 20
    rounded = max(10, int(math.ceil(minutes / 5) * 5))
    return {
        "minutes": min(120, rounded),
        "distance_km": round(distance, 1),
        "mode": mode,
        "source": "geo_estimate",
    }


def _fit_spot(
    spot: dict,
    *,
    earliest: int,
    interval_end: int,
    duration: int,
    date: str,
) -> tuple[int, int, int] | None:
    opening, closed_reason = _opening_intervals(spot, date)
    if closed_reason:
        spot["_schedule_rejection"] = closed_reason
        return None
    if opening is None:
        if earliest + duration <= interval_end:
            return earliest, earliest + duration, 10**9
        return None
    for open_start, open_end in opening:
        start = max(earliest, open_start)
        end = start + duration
        if end <= min(interval_end, open_end):
            return start, end, open_end
    return None


def _normalize_stay_city(day: dict, route_cities: set[str]) -> dict | None:
    """Keep the overnight stay in the day's city until a transfer actually occurs."""
    current_city = _city_token(day.get("city"))
    stay_text = str(day.get("stay") or "").strip()
    if not current_city or not stay_text or current_city in stay_text:
        return None
    mismatched = sorted(
        city for city in route_cities
        if city and city != current_city and city in stay_text
    )
    if not mismatched:
        return None
    day["ai_stay"] = stay_text
    day["stay"] = (
        f"建议住宿在{day.get('city')}市区，优先选择靠近次日路线或交通枢纽的区域。"
    )
    return {
        "level": "warn",
        "code": "cross_city_stay_corrected",
        "message": (
            f"Day {max(1, int(day.get('day') or 1))}：住宿建议原本指向"
            f"{'、'.join(mismatched)}，已调整为当日城市{day.get('city')}。"
        ),
    }


def _schedule_spots(
    spots: list[dict],
    free: list[tuple[int, int]],
    *,
    date: str,
) -> tuple[list[dict], list[dict]]:
    pending = [copy.deepcopy(spot) for spot in spots if isinstance(spot, dict) and spot.get("name")]
    for index, spot in enumerate(pending):
        spot["_original_rank"] = index
    scheduled: list[dict] = []
    previous: dict | None = None

    for interval_start, interval_end in free:
        cursor = interval_start
        while pending:
            candidates = []
            for index, spot in enumerate(pending):
                duration = _spot_duration(spot)
                transfer = _transfer_estimate(previous, spot)
                fitted = _fit_spot(
                    spot,
                    earliest=cursor + int(transfer["minutes"]),
                    interval_end=interval_end,
                    duration=duration,
                    date=date,
                )
                if not fitted:
                    continue
                start, end, closing = fitted
                candidates.append(
                    (
                        closing,
                        int(transfer["minutes"]),
                        start,
                        int(spot.get("_original_rank") or 0),
                        index,
                        end,
                        duration,
                        transfer,
                    )
                )
            if not candidates:
                break
            _closing, _travel, start, _rank, selected_index, end, duration, transfer = min(candidates)
            spot = pending.pop(selected_index)
            spot.pop("_original_rank", None)
            spot.pop("_schedule_rejection", None)
            spot["time"] = format_time_range(start, end)
            spot["duration_minutes"] = duration
            spot["transfer_from_previous"] = transfer
            spot["schedule_status"] = "scheduled"
            spot["_scheduled_start"] = start
            scheduled.append(spot)
            previous = spot
            cursor = end

    alternatives = []
    for spot in pending:
        rejection = spot.pop("_schedule_rejection", None)
        spot.pop("_original_rank", None)
        spot["schedule_status"] = "alternative"
        spot["schedule_reason"] = rejection or "当日门到门交通、用餐和开放时间约束下容量不足"
        alternatives.append(spot)
    return scheduled, alternatives


def _schedule_day(
    day: dict,
    transfers: list[dict],
    *,
    start_date: str,
    pace: str,
    route_cities: set[str],
) -> list[dict]:
    day_number = max(1, int(day.get("day") or 1))
    date = _date_with_offset(start_date, day_number - 1)
    day_start, day_end = _day_window(pace)
    city = _city_token(day.get("city"))
    activity_start, activity_end = day_start, day_end

    for transfer in transfers:
        blocked_start = int(transfer["blocked_start_minutes"])
        blocked_end = int(transfer["blocked_end_minutes"])
        if not transfer.get("is_return") and _city_token(transfer.get("to_city")) == city:
            activity_start = max(activity_start, blocked_end)
        if transfer.get("is_return") or (
            _city_token(transfer.get("from_city")) == city
            and _city_token(transfer.get("to_city")) != city
        ):
            activity_end = min(activity_end, blocked_start)

    warnings: list[dict] = []
    if activity_end <= activity_start:
        free_before_lunch: list[tuple[int, int]] = []
    else:
        free_before_lunch = [(activity_start, activity_end)]
    lunch, short_lunch = _choose_lunch(free_before_lunch)
    free = _subtract_intervals(
        (activity_start, activity_end),
        [lunch] if lunch else [],
    ) if activity_end > activity_start else []

    if lunch:
        day["lunch_time"] = format_time_range(*lunch)
        day["lunch_duration_minutes"] = lunch[1] - lunch[0]
        if short_lunch:
            warnings.append(
                {
                    "level": "warn",
                    "code": "short_meal_break",
                    "message": f"Day {day_number}：只能保留 {lunch[1] - lunch[0]} 分钟用餐时间。",
                }
            )
    else:
        day["lunch_time"] = ""
        warnings.append(
            {
                "level": "warn",
                "code": "meal_break_unavailable",
                "message": f"Day {day_number}：交通占用过多，未找到可用的正餐窗口。",
            }
        )

    spots = []
    cross_city_alternatives = []
    for spot in [*(day.get("morning") or []), *(day.get("afternoon") or [])]:
        spot_city = _city_token(spot.get("city")) if isinstance(spot, dict) else ""
        if spot_city and city and spot_city != city:
            alternative = copy.deepcopy(spot)
            alternative["schedule_status"] = "alternative"
            alternative["schedule_reason"] = (
                f"景点位于{spot.get('city')}，与 Day {day_number} 的主要城市{day.get('city')}不一致"
            )
            cross_city_alternatives.append(alternative)
        else:
            spots.append(spot)
    scheduled, alternatives = _schedule_spots(spots, free, date=date)
    alternatives = [*cross_city_alternatives, *alternatives]
    morning: list[dict] = []
    afternoon: list[dict] = []
    for spot in scheduled:
        scheduled_start = int(spot.pop("_scheduled_start", 0))
        (morning if scheduled_start < 12 * 60 else afternoon).append(spot)
    day["morning"] = morning
    day["afternoon"] = afternoon
    day["alternatives"] = alternatives
    day["date"] = date
    day["transfers"] = transfers
    if any(transfer.get("is_return") for transfer in transfers):
        day["stay"] = ""
    else:
        stay_warning = _normalize_stay_city(day, route_cities)
        if stay_warning:
            warnings.append(stay_warning)

    planned_minutes = sum(int(spot.get("duration_minutes") or 0) for spot in scheduled)
    local_transfer_minutes = sum(
        int((spot.get("transfer_from_previous") or {}).get("minutes") or 0)
        for spot in scheduled
    )
    available_minutes = sum(end - start for start, end in free)
    day["schedule"] = {
        "status": "review" if alternatives or not free else "feasible",
        "source": "deterministic_v1",
        "day_window": format_time_range(day_start, day_end),
        "activity_window": (
            format_time_range(activity_start, activity_end)
            if activity_end > activity_start
            else ""
        ),
        "planned_visit_minutes": planned_minutes,
        "local_transfer_minutes": local_transfer_minutes,
        "available_activity_minutes": available_minutes,
        "remaining_buffer_minutes": max(0, available_minutes - planned_minutes - local_transfer_minutes),
    }
    if alternatives:
        names = "、".join(str(spot.get("name") or "") for spot in alternatives[:3])
        warnings.append(
            {
                "level": "warn",
                "code": "spots_moved_to_alternatives",
                "message": f"Day {day_number}：{names} 因容量或开放时间限制已降为备选。",
            }
        )
    return warnings


def reconcile_itinerary_schedule(
    itinerary: dict,
    *,
    destinations: list,
    start_date: str = "",
    pace: str = "",
) -> dict:
    """Return a copy of the itinerary with a conflict-aware executable schedule."""
    result = copy.deepcopy(itinerary)
    transfers_by_day, warnings = _prepare_transport_schedule(
        result,
        destinations,
        start_date=start_date,
    )
    route_cities = {
        token
        for destination in destinations
        if (token := _city_token(_city_name(destination)))
    }
    for day in result.get("days") or []:
        day_number = max(1, int(day.get("day") or 1))
        warnings.extend(
            _schedule_day(
                day,
                transfers_by_day.get(day_number, []),
                start_date=start_date,
                pace=pace,
                route_cities=route_cities,
            )
        )
    result["schedule_version"] = "deterministic_v1"
    result["schedule_warnings"] = warnings
    return result
