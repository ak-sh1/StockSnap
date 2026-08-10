from typing import TypedDict


class Company(TypedDict):
    ticker: str
    name: str
    cik: str
    sector: str


COMPANIES: tuple[Company, ...] = (
    {"ticker": "AAPL", "name": "Apple", "cik": "0000320193", "sector": "Technology"},
    {"ticker": "MSFT", "name": "Microsoft", "cik": "0000789019", "sector": "Technology"},
    {"ticker": "NVDA", "name": "NVIDIA", "cik": "0001045810", "sector": "Technology"},
    {"ticker": "AMZN", "name": "Amazon", "cik": "0001018724", "sector": "Consumer"},
    {"ticker": "GOOGL", "name": "Alphabet", "cik": "0001652044", "sector": "Technology"},
    {"ticker": "META", "name": "Meta Platforms", "cik": "0001326801", "sector": "Technology"},
    {"ticker": "TSLA", "name": "Tesla", "cik": "0001318605", "sector": "Automotive"},
    {"ticker": "JPM", "name": "JPMorgan Chase", "cik": "0000019617", "sector": "Financials"},
    {"ticker": "WMT", "name": "Walmart", "cik": "0000104169", "sector": "Consumer"},
    {"ticker": "KO", "name": "Coca-Cola", "cik": "0000021344", "sector": "Consumer"},
    {"ticker": "XOM", "name": "Exxon Mobil", "cik": "0000034088", "sector": "Energy"},
    {"ticker": "JNJ", "name": "Johnson & Johnson", "cik": "0000200406", "sector": "Healthcare"},
)


def find_company(ticker: str) -> Company | None:
    normalized = ticker.upper()
    return next((company for company in COMPANIES if company["ticker"] == normalized), None)
