from __future__ import annotations

from datetime import date
from typing import Any

from .companies import Company


TAGS = {
    "revenue": ("RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"),
    "net_income": ("NetIncomeLoss", "ProfitLoss"),
    "assets": ("Assets",),
    "assets_current": ("AssetsCurrent",),
    "liabilities": ("Liabilities",),
    "liabilities_current": ("LiabilitiesCurrent",),
    "equity": ("StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"),
    "operating_cash": ("NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"),
    "capex": ("PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"),
}


def _usd_facts(company_facts: dict[str, Any], tags: tuple[str, ...]) -> list[dict[str, Any]]:
    gaap = company_facts.get("facts", {}).get("us-gaap", {})
    for tag in tags:
        if tag in gaap:
            return gaap[tag].get("units", {}).get("USD", [])
    return []


def _eligible(fact: dict[str, Any], as_of: str) -> bool:
    return fact.get("form") in {"10-K", "10-K/A", "10-Q", "10-Q/A"} and fact.get("filed", "") <= as_of


def _annual_facts(company_facts: dict[str, Any], tags: tuple[str, ...], as_of: str) -> list[dict[str, Any]]:
    values: list[dict[str, Any]] = []
    for fact in _usd_facts(company_facts, tags):
        if not _eligible(fact, as_of) or fact.get("fp") != "FY" or not fact.get("start"):
            continue
        duration = (date.fromisoformat(fact["end"]) - date.fromisoformat(fact["start"])).days
        if duration >= 300:
            values.append(fact)

    values.sort(key=lambda item: (item["end"], item.get("filed", "")))
    by_period = {item["end"]: item for item in values}
    return list(by_period.values())


def _latest(company_facts: dict[str, Any], tags: tuple[str, ...], as_of: str) -> float | None:
    values = [fact for fact in _usd_facts(company_facts, tags) if _eligible(fact, as_of)]
    values.sort(key=lambda item: (item.get("end", ""), item.get("filed", "")), reverse=True)
    return values[0].get("val") if values else None


def _change(current: float | None, previous: float | None) -> float | None:
    if current is None or previous in (None, 0):
        return None
    return (current - previous) / abs(previous) * 100


def _ratio(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator in (None, 0):
        return None
    return numerator / denominator


def _recent_filings(company: Company, submissions: dict[str, Any], as_of: str) -> list[dict[str, Any]]:
    recent = submissions.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    filings: list[dict[str, Any]] = []
    numeric_cik = str(int(company["cik"]))

    for index, form in enumerate(forms):
        filed_at = recent.get("filingDate", [])[index]
        if form not in {"10-K", "10-Q", "8-K"} or filed_at > as_of:
            continue
        accession = recent.get("accessionNumber", [])[index]
        primary_document = recent.get("primaryDocument", [])[index]
        descriptions = recent.get("primaryDocDescription", [])
        report_dates = recent.get("reportDate", [])
        filings.append(
            {
                "accessionNumber": accession,
                "form": form,
                "filedAt": filed_at,
                "reportDate": report_dates[index] or filed_at,
                "description": descriptions[index] or f"{form} filing",
                "url": f"https://www.sec.gov/Archives/edgar/data/{numeric_cik}/{accession.replace('-', '')}/{primary_document}",
            }
        )
        if len(filings) == 8:
            break
    return filings


def build_snapshot(
    company: Company,
    company_facts: dict[str, Any],
    submissions: dict[str, Any],
    as_of: str,
) -> dict[str, Any]:
    annual_sources = {
        name: {item["end"]: item for item in _annual_facts(company_facts, tags, as_of)}
        for name, tags in {
            "revenue": TAGS["revenue"],
            "netIncome": TAGS["net_income"],
            "operatingCash": TAGS["operating_cash"],
            "capex": TAGS["capex"],
        }.items()
    }
    period_ends = list(annual_sources["revenue"].keys())[-5:]
    annuals: list[dict[str, Any]] = []
    for period_end in period_ends:
        values = {
            name: source.get(period_end, {}).get("val")
            for name, source in annual_sources.items()
        }
        operating_cash = values["operatingCash"]
        capex = values["capex"]
        annuals.append(
            {
                "year": period_end[:4],
                "periodEnd": period_end,
                **values,
                "freeCashFlow": operating_cash - capex if operating_cash is not None and capex is not None else None,
            }
        )

    latest = annuals[-1] if annuals else {}
    previous = annuals[-2] if len(annuals) > 1 else {}
    assets = _latest(company_facts, TAGS["assets"], as_of)
    current_assets = _latest(company_facts, TAGS["assets_current"], as_of)
    current_liabilities = _latest(company_facts, TAGS["liabilities_current"], as_of)
    liabilities = _latest(company_facts, TAGS["liabilities"], as_of)
    equity = _latest(company_facts, TAGS["equity"], as_of)

    return {
        "company": {**company, "legalName": company_facts.get("entityName") or company["name"]},
        "asOf": as_of,
        "metrics": {
            "revenue": latest.get("revenue"),
            "revenueChange": _change(latest.get("revenue"), previous.get("revenue")),
            "netIncome": latest.get("netIncome"),
            "netIncomeChange": _change(latest.get("netIncome"), previous.get("netIncome")),
            "assets": assets,
            "freeCashFlow": latest.get("freeCashFlow"),
            "profitMargin": _ratio(latest.get("netIncome"), latest.get("revenue")),
            "currentRatio": _ratio(current_assets, current_liabilities),
            "liabilitiesToEquity": _ratio(liabilities, equity),
        },
        "annuals": annuals,
        "filings": _recent_filings(company, submissions, as_of),
        "source": "SEC EDGAR company facts and submissions",
    }
