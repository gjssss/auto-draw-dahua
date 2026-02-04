#!/usr/bin/env python3
import json
import math
import statistics as stats
from pathlib import Path
from typing import Any, List, Tuple, Dict


def parse_value(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        raw = value.strip()
        if raw.endswith("%"):
            raw = raw[:-1]
        try:
            return float(raw)
        except ValueError:
            return None
    return None


def load_events(path: Path) -> Tuple[List[float], List[float], Dict[str, int], int]:
    data = json.loads(path.read_text())
    xs: List[float] = []
    ys: List[float] = []
    counts = {"down": 0, "up": 0, "move": 0}

    if not isinstance(data, list):
        return xs, ys, counts, 0

    for item in data:
        if not isinstance(item, list) or len(item) < 4:
            continue
        action = item[2]
        if action == "mouse left down":
            counts["down"] += 1
        elif action == "mouse left up":
            counts["up"] += 1
        elif action == "mouse move":
            counts["move"] += 1

        coords = item[3]
        if not isinstance(coords, list) or len(coords) < 2:
            continue
        x = parse_value(coords[0])
        y = parse_value(coords[1])
        if x is None or y is None:
            continue
        xs.append(x)
        ys.append(y)

    return xs, ys, counts, len(data)


def summarize(values: List[float]) -> Dict[str, float]:
    if not values:
        return {"min": math.nan, "max": math.nan, "range": math.nan, "mean": math.nan}
    return {
        "min": min(values),
        "max": max(values),
        "range": max(values) - min(values),
        "mean": stats.fmean(values),
    }


def scale_hint(values: List[float]) -> str:
    if not values:
        return "empty"
    max_v = max(values)
    if max_v <= 1.5:
        return "normalized(0~1)"
    if max_v <= 100:
        return "percent(0~100)"
    return "unknown"


def print_report(label: str, xs: List[float], ys: List[float], counts: Dict[str, int], total: int) -> None:
    x_stat = summarize(xs)
    y_stat = summarize(ys)
    ratio = y_stat["range"] / x_stat["range"] if x_stat["range"] and not math.isnan(x_stat["range"]) else math.nan

    print(f"== {label} ==")
    print(f"events: {total}  (down={counts['down']}, up={counts['up']}, move={counts['move']})")
    print(f"x: min={x_stat['min']:.6f} max={x_stat['max']:.6f} range={x_stat['range']:.6f} mean={x_stat['mean']:.6f} scale={scale_hint(xs)}")
    print(f"y: min={y_stat['min']:.6f} max={y_stat['max']:.6f} range={y_stat['range']:.6f} mean={y_stat['mean']:.6f} scale={scale_hint(ys)}")
    print(f"range ratio (y/x): {ratio:.6f}")
    print("")


def main() -> None:
    import sys

    if len(sys.argv) < 3:
        print("Usage: analyze_coords.py <file1> <file2>")
        raise SystemExit(1)

    file1 = Path(sys.argv[1])
    file2 = Path(sys.argv[2])

    xs1, ys1, counts1, total1 = load_events(file1)
    xs2, ys2, counts2, total2 = load_events(file2)

    print_report(file1.name, xs1, ys1, counts1, total1)
    print_report(file2.name, xs2, ys2, counts2, total2)

    if xs1 and ys1 and xs2 and ys2:
        y_ratio = (max(ys1) - min(ys1)) / (max(ys2) - min(ys2))
        x_ratio = (max(xs1) - min(xs1)) / (max(xs2) - min(xs2))
        print("== Compare ==")
        print(f"x range ratio (file1/file2): {x_ratio:.6f}")
        print(f"y range ratio (file1/file2): {y_ratio:.6f}")


if __name__ == "__main__":
    main()
