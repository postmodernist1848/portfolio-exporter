#!/usr/bin/env python3
"""Fetch public-only evidence into a temporary cache; no credentials or .env."""
import argparse
import concurrent.futures
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

HL = ["0x36c56c5f4b084244b1b0137e1cbb76af200fee5b",
      "0x735b97415cd925daa56d2e2979eda5ddca056d55"]


def request(url, body=None):
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, data=json.dumps(body).encode() if body else None,
                                         headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=45) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code not in (408, 429) and error.code < 500:
                raise
            if attempt == 2:
                raise
        except urllib.error.URLError:
            if attempt == 2:
                raise
        time.sleep(2 ** attempt)


def fetch(name, url, body, directory):
    data = request(url, body)
    if body and body["type"] in ("userFillsByTime", "userNonFundingLedgerUpdates"):
        limit = 2000 if body["type"] == "userFillsByTime" else 500
        # Never silently accept a potentially truncated range. Large histories
        # need a deliberate pagination update, including same-millisecond ties.
        if len(data) >= limit:
            raise ValueError("History limit reached: implement pagination before importing")
    path = directory / (name + ".json")
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data))
    tmp.replace(path)
    return name


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True,
                        help="Temporary cache outside the public repository, e.g. /tmp/btc-research")
    args = parser.parse_args()
    args.directory.mkdir(parents=True, exist_ok=True)
    jobs = [("spot-meta", "https://api.hyperliquid.xyz/info", {"type": "spotMeta"})]
    for i, address in enumerate(HL, 1):
        for kind in ["userFillsByTime", "userNonFundingLedgerUpdates", "subAccounts", "spotClearinghouseState"]:
            body = dict(type=kind, user=address)
            if kind in ("userFillsByTime", "userNonFundingLedgerUpdates"):
                body["startTime"] = 0
            if kind == "userFillsByTime":
                body["aggregateByTime"] = False
            jobs.append((f"hl-{i}-{kind}", "https://api.hyperliquid.xyz/info", body))
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(fetch, *job, args.directory) for job in jobs]
        for future in concurrent.futures.as_completed(futures):
            print("Fetched", future.result(), flush=True)
