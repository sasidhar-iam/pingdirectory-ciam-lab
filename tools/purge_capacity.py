"""Sizing model and UTC daily disk deltas; never connects to a directory."""
import argparse
import csv
import json
import math
from datetime import datetime, timezone


def capacity(backlog, expired_per_second, delete_per_second, window_hours,
             change_rate, change_bytes, retention_days, overhead_factor):
    values = (backlog, expired_per_second, delete_per_second, window_hours,
              change_rate, change_bytes, retention_days, overhead_factor)
    if any(not math.isfinite(x) or x < 0 for x in values):
        raise ValueError('Inputs must be finite and nonnegative')
    if window_hours <= 0 or window_hours > 24 or retention_days <= 0 or overhead_factor < 1:
        raise ValueError('Window must be in (0,24], retention positive, overhead >= 1')
    net = delete_per_second - expired_per_second
    drain = 0 if backlog == 0 else (backlog / net if net > 0 else None)
    budget = delete_per_second * window_hours * 3600
    arrivals = expired_per_second * 86400
    return {'drain_seconds': drain, 'clears_start_backlog_in_window': drain is not None and drain <= window_hours * 3600,
            'daily_delete_budget': budget, 'daily_expired_arrivals': arrivals,
            'daily_capacity_exceeds_arrivals': budget > arrivals,
            'estimated_replication_bytes_per_node': change_rate * change_bytes * 86400 * retention_days * overhead_factor}


def daily_deltas(rows):
    latest = {}
    for row in rows:
        timestamp = datetime.fromisoformat(row['timestamp_utc'].replace('Z', '+00:00'))
        if timestamp.tzinfo is None:
            raise ValueError('Timestamp needs timezone')
        timestamp = timestamp.astimezone(timezone.utc)
        allocated, apparent = int(row['allocated_bytes']), int(row['apparent_bytes'])
        if allocated < 0 or apparent < 0:
            raise ValueError('Negative size')
        key = (row['host'], row['path'], timestamp.date())
        if key not in latest or timestamp > latest[key][0]:
            latest[key] = (timestamp, allocated, apparent)
    previous = {}
    result = []
    for (host, path, day), (_, allocated, apparent) in sorted(latest.items()):
        prior = previous.get((host, path))
        gap = (day - prior[0]).days if prior else None
        result.append({'day_utc': str(day), 'host': host, 'path': path,
                       'allocated_bytes': allocated, 'apparent_bytes': apparent,
                       'days_since_previous': gap,
                       'daily_allocated_delta': allocated - prior[1] if gap == 1 else None,
                       'daily_apparent_delta': apparent - prior[2] if gap == 1 else None})
        previous[(host, path)] = (day, allocated, apparent)
    return result


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--daily')
    for name in ['backlog', 'expired-per-second', 'delete-per-second', 'window-hours',
                 'change-rate', 'change-bytes', 'retention-days', 'overhead-factor']:
        p.add_argument('--' + name, type=float)
    args = vars(p.parse_args())
    daily = args.pop('daily')
    if daily:
        with open(daily, newline='') as f:
            result = daily_deltas(csv.DictReader(f))
    else:
        if any(v is None for v in args.values()):
            p.error('Provide all sizing options, or --daily CSV')
        result = capacity(**args)
    print(json.dumps(result, indent=2, allow_nan=False))


if __name__ == '__main__':
    main()
