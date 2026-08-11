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
                "StockSnap educational project contact@stocksnap.app",
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

    async def sec_tickers(self) -> dict[str, Any]:
        url = "https://www.sec.gov/files/company_tickers.json"
        cached = self._cache.get(url)
        if cached and time.monotonic() - cached[0] < self.ttl_seconds:
            return cached[1]
        response = await self._get(url, headers=self._sec_headers)
        payload = response.json()
        self._cache[url] = (time.monotonic(), payload)
        return payload

    async def alpha_json(self, function_name: str, symbol: str, api_key: str) -> dict[str, Any]:
        url = f"https://www.alphavantage.co/query?function={function_name}&symbol={symbol}&apikey={api_key}"
        cached = self._cache.get(url)
        if cached and time.monotonic() - cached[0] < self.ttl_seconds:
            return cached[1]
        response = await self._get(url, headers={"Accept": "application/json"})
        payload = response.json()
        if payload.get("Note") or payload.get("Information"):
            raise httpx.HTTPStatusError(
                payload.get("Note") or payload.get("Information"),
                request=response.request,
                response=response,
            )
        self._cache[url] = (time.monotonic(), payload)
        return payload

    async def twelve_json(self, symbol: str, api_key: str) -> dict[str, Any]:
        url = f"https://api.twelvedata.com/time_series?symbol={symbol}&interval=1day&outputsize=260&order=asc"
        cached = self._cache.get(url)
        if cached and time.monotonic() - cached[0] < self.ttl_seconds:
            return cached[1]
        response = await self._get(
            url,
            headers={"Accept": "application/json", "Authorization": f"apikey {api_key}"},
        )
        payload = response.json()
        if payload.get("status") == "error" or payload.get("code"):
            raise httpx.HTTPStatusError(
                payload.get("message", "Twelve Data returned an error"),
                request=response.request,
                response=response,
            )
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
