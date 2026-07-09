import json
from datetime import datetime
from pathlib import Path
from typing import Any


def load_station_cache(
    cache_file: Path,
    *,
    ttl_seconds: int,
    fallback: dict[str, list[tuple[str, str]]],
    now: datetime | None = None,
) -> dict[str, list[tuple[str, str]]]:
    """Load station cache when fresh; otherwise return fallback station data."""
    current_time = now or datetime.now()
    try:
        if not cache_file.exists():
            return fallback
        cache = json.loads(cache_file.read_text(encoding="utf-8"))
        updated = datetime.fromisoformat(cache.get("updated_at", "2000-01-01"))
        if (current_time - updated).total_seconds() >= ttl_seconds:
            return fallback
        return normalize_station_map(cache.get("stations", {})) or fallback
    except Exception:
        return fallback


def write_station_cache(cache_file: Path, station_map: dict[str, list[tuple[str, str]]]) -> None:
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    cache_data = {
        "updated_at": datetime.now().isoformat(),
        "stations": station_map,
    }
    cache_file.write_text(json.dumps(cache_data, ensure_ascii=False), encoding="utf-8")


def normalize_station_map(raw: Any) -> dict[str, list[tuple[str, str]]]:
    if not isinstance(raw, dict):
        return {}

    normalized: dict[str, list[tuple[str, str]]] = {}
    for city, stations in raw.items():
        if not isinstance(city, str) or not isinstance(stations, list):
            continue
        rows: list[tuple[str, str]] = []
        for station in stations:
            if (
                isinstance(station, (list, tuple))
                and len(station) >= 2
                and isinstance(station[0], str)
                and isinstance(station[1], str)
            ):
                rows.append((station[0], station[1]))
        if rows:
            normalized[city] = rows
    return normalized


def build_code_to_name(station_map: dict[str, list[tuple[str, str]]]) -> dict[str, str]:
    code_to_name: dict[str, str] = {}
    for stations in station_map.values():
        for code, name in stations:
            code_to_name[code] = name
    return code_to_name
