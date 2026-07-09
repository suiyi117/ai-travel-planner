import re
from collections.abc import Callable
from typing import Optional


def classify_train(train_code: str) -> str:
    """Classify a train by its public train code prefix."""
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


def parse_train_result(
    fields: list[str],
    from_name: str,
    to_name: str,
    station_name_lookup: Callable[[str], Optional[str]],
) -> Optional[dict]:
    """Parse one 12306 leftTicket/queryZ result row into the app train shape."""
    if len(fields) < 12:
        return None

    code_candidates = [
        fields[3] if len(fields) > 3 else "",
        fields[4] if len(fields) > 4 else "",
    ]
    train_code = next(
        (c for c in code_candidates if re.fullmatch(r"[GDCKTZSLY]?\d{1,4}", c or "")),
        code_candidates[0] or code_candidates[1],
    )
    from_station_tele = fields[6]
    to_station_tele = fields[7]
    depart_time = fields[8]
    arrive_time = fields[9]
    duration_str = fields[10]

    train_type = classify_train(train_code)

    duration_parts = duration_str.split(":")
    if len(duration_parts) == 2:
        hours, minutes = int(duration_parts[0]), int(duration_parts[1])
        duration_display = f"{hours}小时{minutes}分钟" if hours > 0 else f"{minutes}分钟"
        duration_minutes = hours * 60 + minutes
    else:
        duration_display = duration_str
        duration_minutes = 0

    seats = {}
    seat_fields = {
        "二等座": 30,
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

    train_id = fields[2] if len(fields) > 2 else train_code
    from_station_display = station_name_lookup(from_station_tele or "") or from_name
    to_station_display = station_name_lookup(to_station_tele or "") or to_name

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
        "desc": f"{train_type} 路 {from_station_display} → {to_station_display}",
        "source": "12306",
    }
