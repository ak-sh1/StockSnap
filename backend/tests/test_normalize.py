from backend.app.companies import find_company
from backend.app.normalize import build_snapshot


def fact(value: int, end: str, filed: str, *, start: str | None = None, fp: str = "FY") -> dict:
    result = {
        "end": end,
        "val": value,
        "accn": f"accession-{end}",
        "fy": int(end[:4]),
        "fp": fp,
        "form": "10-K" if fp == "FY" else "10-Q",
        "filed": filed,
    }
    if start:
        result["start"] = start
    return result


def concept(values: list[dict]) -> dict:
    return {"label": "fixture", "description": "fixture", "units": {"USD": values}}


def test_snapshot_is_point_in_time_aware() -> None:
    company = find_company("AAPL")
    assert company is not None
    company_facts = {
        "entityName": "Example Inc.",
        "facts": {
            "us-gaap": {
                "RevenueFromContractWithCustomerExcludingAssessedTax": concept(
                    [
                        fact(100, "2023-12-31", "2024-02-01", start="2023-01-01"),
                        fact(120, "2024-12-31", "2025-02-01", start="2024-01-01"),
                    ]
                ),
                "NetIncomeLoss": concept(
                    [
                        fact(10, "2023-12-31", "2024-02-01", start="2023-01-01"),
                        fact(15, "2024-12-31", "2025-02-01", start="2024-01-01"),
                    ]
                ),
                "Assets": concept([fact(300, "2024-12-31", "2025-02-01")]),
            }
        },
    }

    before_filing = build_snapshot(company, company_facts, {}, "2025-01-15")
    after_filing = build_snapshot(company, company_facts, {}, "2025-03-01")

    assert before_filing["metrics"]["revenue"] == 100
    assert after_filing["metrics"]["revenue"] == 120
    assert after_filing["metrics"]["profitMargin"] == 0.125


def test_unknown_ticker_returns_none() -> None:
    assert find_company("NOTREAL") is None
