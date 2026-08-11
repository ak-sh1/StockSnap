import { NextResponse } from "next/server";
import { getDemoMarketSnapshot, type MarketSnapshot, type PricePoint } from "../../lib/market";

type AlphaDailyResponse = {
  "Meta Data"?: Record<string, string>;
  "Time Series (Daily)"?: Record<string, { "4. close": string; "5. volume": string }>;
  Note?: string;
  Information?: string;
};

type AlphaOverview = Record<string, string>;

function numberOrNull(value: string | undefined): number | null {
  if (!value || value === "None" || value === "-") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validTicker(value: string | null): string | null {
  const ticker = value?.trim().toUpperCase() ?? "";
  return /^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker) ? ticker : null;
}

async function alphaJson(functionName: string, ticker: string, apiKey: string): Promise<AlphaDailyResponse | AlphaOverview> {
  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", functionName);
  url.searchParams.set("symbol", ticker);
  url.searchParams.set("apikey", apiKey);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Market provider responded with ${response.status}`);
  const body = await response.json() as AlphaDailyResponse | AlphaOverview;
  if ("Note" in body || "Information" in body) throw new Error(body.Note || body.Information || "Market provider limit reached");
  return body;
}

async function liveSnapshot(ticker: string, apiKey: string): Promise<MarketSnapshot> {
  const [dailyBody, overviewBody] = await Promise.all([
    alphaJson("TIME_SERIES_DAILY", ticker, apiKey),
    alphaJson("OVERVIEW", ticker, apiKey),
  ]);
  const daily = dailyBody as AlphaDailyResponse;
  const overview = overviewBody as AlphaOverview;
  const history: PricePoint[] = Object.entries(daily["Time Series (Daily)"] ?? {})
    .map(([date, item]) => ({ date, close: Number(item["4. close"]) }))
    .filter((item) => Number.isFinite(item.close))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (history.length < 2) throw new Error("Market provider returned no daily prices");
  const latest = history.at(-1) as PricePoint;
  const previous = history.at(-2) as PricePoint;
  const latestVolume = (daily["Time Series (Daily)"] ?? {})[latest.date]?.["5. volume"];
  const change = latest.close - previous.close;

  return {
    ticker,
    price: latest.close,
    previousClose: previous.close,
    change,
    changePercent: (change / previous.close) * 100,
    asOf: latest.date,
    currency: overview.Currency || "USD",
    volume: numberOrNull(latestVolume),
    averageVolume: null,
    marketCap: numberOrNull(overview.MarketCapitalization),
    peRatio: numberOrNull(overview.PERatio),
    eps: numberOrNull(overview.EPS),
    dividendYield: numberOrNull(overview.DividendYield),
    beta: numberOrNull(overview.Beta),
    high52Week: numberOrNull(overview["52WeekHigh"]),
    low52Week: numberOrNull(overview["52WeekLow"]),
    history,
    mode: "live",
    source: "Alpha Vantage daily market data",
  };
}

export async function GET(request: Request) {
  const ticker = validTicker(new URL(request.url).searchParams.get("ticker"));
  if (!ticker) return NextResponse.json({ error: "Enter a valid US ticker symbol." }, { status: 400 });

  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    const sample = getDemoMarketSnapshot(ticker);
    if (sample) return NextResponse.json(sample, { headers: { "Cache-Control": "public, max-age=3600" } });
    return NextResponse.json(
      { error: "Live market data is not configured for this deployment.", requiresProvider: true },
      { status: 503 },
    );
  }

  try {
    const snapshot = await liveSnapshot(ticker, apiKey);
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" },
    });
  } catch (error) {
    const sample = getDemoMarketSnapshot(ticker);
    if (sample) {
      return NextResponse.json({ ...sample, providerNotice: error instanceof Error ? error.message : "Live provider unavailable" });
    }
    return NextResponse.json({ error: "Market data is temporarily unavailable." }, { status: 502 });
  }
}
