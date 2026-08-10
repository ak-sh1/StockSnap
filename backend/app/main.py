from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from os import getenv

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .companies import COMPANIES, find_company
from .normalize import build_snapshot
from .sec_client import PublicDataClient


app = FastAPI(
    title="FilingScope API",
    description="Normalized public-company fundamentals sourced from SEC EDGAR.",
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


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}


@app.get("/api/companies")
async def list_companies() -> dict[str, object]:
    return {"items": COMPANIES, "count": len(COMPANIES)}


@app.get("/api/company")
async def company_snapshot(
    ticker: str = Query(min_length=1, max_length=8),
    as_of: date = Query(default_factory=date.today),
) -> dict[str, object]:
    company = find_company(ticker)
    if not company:
        raise HTTPException(status_code=404, detail="Ticker is not in the supported company list.")

    try:
        company_facts = await client.sec_json(f"api/xbrl/companyfacts/CIK{company['cik']}.json")
        submissions = await client.sec_json(f"submissions/CIK{company['cik']}.json")
        return build_snapshot(company, company_facts, submissions, as_of.isoformat())
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail="SEC EDGAR is temporarily unavailable.") from error


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
