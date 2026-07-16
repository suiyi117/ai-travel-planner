import json
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from services.train_station_cache import build_code_to_name, load_station_cache, normalize_station_map, write_station_cache


class TrainStationCacheTests(unittest.TestCase):
    def test_load_station_cache_returns_fresh_normalized_cache(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            cache_file = Path(temp_dir) / "station_map.json"
            cache_file.write_text(
                json.dumps(
                    {
                        "updated_at": "2026-07-09T12:00:00",
                        "stations": {"北京": [["BJP", "北京"], ["BXP", "北京西"]]},
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            result = load_station_cache(
                cache_file,
                ttl_seconds=3600,
                fallback={"fallback": [("FBK", "Fallback")]},
                now=datetime(2026, 7, 9, 12, 30, 0),
            )

        self.assertEqual(result, {"北京": [("BJP", "北京"), ("BXP", "北京西")]})

    def test_load_station_cache_uses_fallback_when_expired(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            cache_file = Path(temp_dir) / "station_map.json"
            cache_file.write_text(
                json.dumps({"updated_at": "2026-07-01T12:00:00", "stations": {"北京": [["BJP", "北京"]]}}),
                encoding="utf-8",
            )

            result = load_station_cache(
                cache_file,
                ttl_seconds=3600,
                fallback={"fallback": [("FBK", "Fallback")]},
                now=datetime(2026, 7, 9, 12, 30, 0),
            )

        self.assertEqual(result, {"fallback": [("FBK", "Fallback")]})

    def test_write_station_cache_round_trips_and_builds_reverse_lookup(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            cache_file = Path(temp_dir) / "station_map.json"
            write_station_cache(cache_file, {"北京": [("BJP", "北京")]})

            raw = json.loads(cache_file.read_text(encoding="utf-8"))
            normalized = normalize_station_map(raw["stations"])

        self.assertEqual(normalized, {"北京": [("BJP", "北京")]})
        self.assertEqual(build_code_to_name(normalized), {"BJP": "北京"})


if __name__ == "__main__":
    unittest.main()
