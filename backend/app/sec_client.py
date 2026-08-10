from __future__ import annotations

import asyncio
import os
import time
from typing import Any

import httpx


class PublicDataClient:
    """Small async client with bounded concurrency and an in-memory TTL cache."""

    def __init__(self, ttl_seconds: int = 21_600) -> None:
        self.ttl_seconds = ttl_seconds
        self._cache: dict[str, tuple[float, Any]] = {}
        self._semaphore = asyncio.Semaphore(4)
        self._sec_headers = {
            "Accept": "application/json",
            "User-Agent": os.getenv(
                "SEC_USER_AGENT",
                "FilingScope educational project contact@filingscope.app",
            ),
        }

    async def _get(self, url: str, *, headers: dict[str, str] | None = None) -> httpx.Response:
        cached = self._cache.get(url)
        if cached and time.monotonic() - cached[0] < self.ttl_seconds:
            return httpx.Response(200, json=cached[1], request=httpx.Request("GET", url))

        async with self._semaphore, httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            return response

    async def sec_json(self, path: str) -> dict[str, Any]:
        url = f"https://data.sec.gov/{path}"
        cached = self._cache.get(url)
        if cached and time.monotonic() - cached[0] < self.ttl_seconds:
            return cached[1]
        response = await self._get(url, headers=self._sec_headers)
        payload = response.json()
        self._cache[url] = (time.monotonic(), payload)
        return payload

    async def fred_series(self, series_id: str) -> list[dict[str, Any]]:
        url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}&cosd=2024-01-01"
        cached = self._cache.get(url)
        if cached and time.monotonic() - cached[0] < self.ttl_seconds:
            return cached[1]
        response = await self._get(url, headers={"Accept": "text/csv"})
        observations: list[dict[str, Any]] = []
        for line in response.text.strip().splitlines()[1:]:
            observation_date, raw_value = line.split(",", maxsplit=1)
            try:
                observations.append({"date": observation_date, "value": float(raw_value)})
            except ValueError:
                continue
        self._cache[url] = (time.monotonic(), observations)
        return observations
