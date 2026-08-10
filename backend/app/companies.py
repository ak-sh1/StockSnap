from typing import TypedDict


class Company(TypedDict):
    ticker: str
    name: str
    cik: str
    sector: str
    exchange: str


COMPANIES: tuple[Company, ...] = (
    {"ticker": "AAPL", "name": "Apple", "cik": "0000320193", "sector": "Technology", "exchange": "NASDAQ"},
    {"ticker": "MSFT", "name": "Microsoft", "cik": "0000789019", "sector": "Technology", "exchange": "NASDAQ"},
    {"ticker": "NVDA", "name": "NVIDIA", "cik": "0001045810", "sector": "Technology", "exchange": "NASDAQ"},
    {"ticker": "AMZN", "name": "Amazon", "cik": "0001018724", "sector": "Consumer", "exchange": "NASDAQ"},
    {"ticker": "GOOGL", "name": "Alphabet", "cik": "0001652044", "sector": "Technology", "exchange": "NASDAQ"},
    {"ticker": "META", "name": "Meta Platforms", "cik": "0001326801", "sector": "Technology", "exchange": "NASDAQ"},
    {"ticker": "TSLA", "name": "Tesla", "cik": "0001318605", "sector": "Automotive", "exchange": "NASDAQ"},
    {"ticker": "JPM", "name": "JPMorgan Chase", "cik": "0000019617", "sector": "Financials", "exchange": "NYSE"},
    {"ticker": "WMT", "name": "Walmart", "cik": "0000104169", "sector": "Consumer", "exchange": "NYSE"},
    {"ticker": "KO", "name": "Coca-Cola", "cik": "0000021344", "sector": "Consumer", "exchange": "NYSE"},
    {"ticker": "XOM", "name": "Exxon Mobil", "cik": "0000034088", "sector": "Energy", "exchange": "NYSE"},
    {"ticker": "JNJ", "name": "Johnson & Johnson", "cik": "0000200406", "sector": "Healthcare", "exchange": "NYSE"},
)


def find_company(ticker: str) -> Company | None:
    normalized = ticker.upper()
    return next((company for company in COMPANIES if company["ticker"] == normalized), None)
