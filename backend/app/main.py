from __future__ import annotations

import asyncio
from datetime import date, datetime, timedelta, timezone
from os import getenv
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .companies import COMPANIES, Company, find_company
from .normalize import build_snapshot
from .sec_client import PublicDataClient


app = FastAPI(
    title="StockSnap API",
    description="Stock price history and normalized SEC fundamentals for public US companies.",
    version="1.0.0",
)
allowed_origins = [origin.strip() for origin in getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)
client = PublicDataClient()


def dynamic_company(entry: dict[str, Any]) -> Company:
    return {
        "ticker": str(entry["ticker"]).upper(),
        "name": str(entry["title"]),
        "cik": str(entry["cik_str"]).zfill(10),
        "sector": "US public company",
        "exchange": "US market",
    }


async def resolve_company(ticker: str) -> Company | None:
    curated = find_company(ticker)
    if curated:
        return curated
    directory = await client.sec_tickers()
    normalized = ticker.upper()
    entry = next((item for item in directory.values() if str(item["ticker"]).upper() == normalized), None)
    return dynamic_company(entry) if entry else None


def optional_number(value: Any) -> float | None:
    if value in (None, "", "None", "-"):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def build_twelve_market_snapshot(symbol: str, payload: dict[str, Any]) -> dict[str, object]:
    observations = []
    for item in payload.get("values", []):
        close = optional_number(item.get("close"))
        if close is None:
            continue
        observations.append(
            {
                "date": str(item.get("datetime", ""))[:10],
                "close": close,
                "high": optional_number(item.get("high")),
                "low": optional_number(item.get("low")),
                "volume": optional_number(item.get("volume")),
            }
        )
    observations.sort(key=lambda item: item["date"])
    if len(observations) < 2:
        raise ValueError("The market data provider returned no daily prices.")

    latest, previous = observations[-1], observations[-2]
    latest_close = float(latest["close"])
    previous_close = float(previous["close"])
    change = latest_close - previous_close
    recent_volumes = [float(item["volume"]) for item in observations[-20:] if item["volume"] is not None]
    year_observations = observations[-252:]
    highs = [float(item["high"]) for item in year_observations if item["high"] is not None]
    lows = [float(item["low"]) for item in year_observations if item["low"] is not None]

    return {
        "ticker": symbol,
        "price": latest_close,
        "previousClose": previous_close,
        "change": change,
        "changePercent": change / previous_close * 100,
        "asOf": latest["date"],
        "currency": payload.get("meta", {}).get("currency", "USD"),
        "volume": latest["volume"],
        "averageVolume": sum(recent_volumes) / len(recent_volumes) if recent_volumes else None,
        "marketCap": None,
        "peRatio": None,
        "eps": None,
        "dividendYield": None,
        "beta": None,
        "high52Week": max(highs) if highs else None,
        "low52Week": min(lows) if lows else None,
        "history": [{"date": item["date"], "close": item["close"]} for item in observations],
        "mode": "live",
        "source": "Twelve Data daily market data",
    }


async def alpha_market_snapshot(symbol: str, api_key: str) -> dict[str, object]:
    daily, overview = await asyncio.gather(
        client.alpha_json("TIME_SERIES_DAILY", symbol, api_key),
        client.alpha_json("OVERVIEW", symbol, api_key),
    )
    series = daily.get("Time Series (Daily)", {})
    history = sorted(
        (
            {"date": observation_date, "close": float(values["4. close"])}
            for observation_date, values in series.items()
        ),
        key=lambda item: item["date"],
    )
    if len(history) < 2:
        raise ValueError("The market data provider returned no daily prices.")
    latest, previous = history[-1], history[-2]
    change = latest["close"] - previous["close"]
    latest_volume = series[latest["date"]].get("5. volume")
    return {
        "ticker": symbol,
        "price": latest["close"],
        "previousClose": previous["close"],
        "change": change,
        "changePercent": change / previous["close"] * 100,
        "asOf": latest["date"],
        "currency": overview.get("Currency", "USD"),
        "volume": optional_number(latest_volume),
        "averageVolume": None,
        "marketCap": optional_number(overview.get("MarketCapitalization")),
        "peRatio": optional_number(overview.get("PERatio")),
        "eps": optional_number(overview.get("EPS")),
        "dividendYield": optional_number(overview.get("DividendYield")),
        "beta": optional_number(overview.get("Beta")),
        "high52Week": optional_number(overview.get("52WeekHigh")),
        "low52Week": optional_number(overview.get("52WeekLow")),
        "history": history,
        "mode": "live",
        "source": "Alpha Vantage daily market data",
    }


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}


@app.get("/api/companies")
async def list_companies() -> dict[str, object]:
    return {"items": COMPANIES, "count": len(COMPANIES)}


@app.get("/api/search")
async def search_companies(q: str = Query(min_length=1, max_length=80)) -> dict[str, object]:
    normalized = q.strip().lower()
    try:
        directory = await client.sec_tickers()
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail="The SEC company directory is temporarily unavailable.") from error
    items = [
        dynamic_company(entry)
        for entry in directory.values()
        if str(entry["ticker"]).lower().startswith(normalized) or normalized in str(entry["title"]).lower()
    ][:8]
    return {"items": items}


@app.get("/api/company")
async def company_snapshot(
    ticker: str = Query(min_length=1, max_length=10),
    as_of: date = Query(default_factory=date.today),
) -> dict[str, object]:
    try:
        company = await resolve_company(ticker)
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail="The SEC company directory is temporarily unavailable.") from error
    if not company:
        raise HTTPException(status_code=404, detail="Ticker was not found in the SEC company directory.")

    try:
        company_facts = await client.sec_json(f"api/xbrl/companyfacts/CIK{company['cik']}.json")
        submissions = await client.sec_json(f"submissions/CIK{company['cik']}.json")
        return build_snapshot(company, company_facts, submissions, as_of.isoformat())
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail="SEC EDGAR is temporarily unavailable.") from error


@app.get("/api/stock")
async def stock_snapshot(ticker: str = Query(pattern=r"^[A-Za-z][A-Za-z0-9.\-]{0,9}$")) -> dict[str, object]:
    symbol = ticker.upper()
    twelve_data_key = getenv("TWELVE_DATA_API_KEY")
    alpha_vantage_key = getenv("ALPHA_VANTAGE_API_KEY")
    if not twelve_data_key and not alpha_vantage_key:
        raise HTTPException(
            status_code=503,
            detail="Set TWELVE_DATA_API_KEY or ALPHA_VANTAGE_API_KEY to enable market prices.",
        )

    provider_error: Exception | None = None
    if twelve_data_key:
        try:
            payload = await client.twelve_json(symbol, twelve_data_key)
            return build_twelve_market_snapshot(symbol, payload)
        except (httpx.HTTPError, ValueError) as error:
            provider_error = error

    if alpha_vantage_key:
        try:
            return await alpha_market_snapshot(symbol, alpha_vantage_key)
        except (httpx.HTTPError, ValueError) as error:
            provider_error = error

    raise HTTPException(status_code=502, detail="The market data provider is temporarily unavailable.") from provider_error


@app.get("/api/macro")
async def macro_snapshot() -> dict[str, object]:
    try:
        observations = await client.fred_series("DGS10")
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail="FRED is temporarily unavailable.") from error

    if not observations:
        raise HTTPException(status_code=502, detail="FRED returned no observations.")

    latest = observations[-1]
    latest_date = date.fromisoformat(latest["date"])
    year = [item for item in observations if date.fromisoformat(item["date"]) >= latest_date - timedelta(days=366)]
    month_ago = next(
        (item for item in reversed(observations) if date.fromisoformat(item["date"]) <= latest_date - timedelta(days=30)),
        observations[0],
    )
    return {
        "items": [
            {"label": "10Y Treasury", **latest, "suffix": "%", "decimals": 2},
            {"label": "30-day move", "date": latest["date"], "value": (latest["value"] - month_ago["value"]) * 100, "suffix": " bp", "decimals": 0},
            {"label": "12-month high", "date": latest["date"], "value": max(item["value"] for item in year), "suffix": "%", "decimals": 2},
            {"label": "12-month low", "date": latest["date"], "value": min(item["value"] for item in year), "suffix": "%", "decimals": 2},
        ],
        "source": "Federal Reserve Economic Data — 10-Year Treasury Rate",
    }
