import { NextResponse } from "next/server";
import { getDemoMarketSnapshot, type MarketSnapshot, type PricePoint } from "../../lib/market";

type AlphaDailyResponse = {
  "Meta Data"?: Record<string, string>;
  "Time Series (Daily)"?: Record<string, { "4. close": string; "5. volume": string }>;
  Note?: string;
  Information?: string;
};

type AlphaOverview = Record<string, string>;

type TwelveTimeSeriesResponse = {
  meta?: {
    currency?: string;
  };
  values?: Array<{
    datetime: string;
    high?: string | null;
    low?: string | null;
    close?: string | null;
    volume?: string | null;
  }>;
  code?: number;
  message?: string;
  status?: string;
};

function numberOrNull(value: string | number | null | undefined): number | null {
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

async function alphaSnapshot(ticker: string, apiKey: string): Promise<MarketSnapshot> {
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

async function twelveSnapshot(ticker: string, apiKey: string): Promise<MarketSnapshot> {
  const url = new URL("https://api.twelvedata.com/time_series");
  url.searchParams.set("symbol", ticker);
  url.searchParams.set("interval", "1day");
  url.searchParams.set("outputsize", "260");
  url.searchParams.set("order", "asc");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `apikey ${apiKey}`,
    },
    next: { revalidate: 21_600 },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Market provider responded with ${response.status}`);

  const body = await response.json() as TwelveTimeSeriesResponse;
  if (body.status === "error" || body.code) {
    throw new Error(body.message || "Market provider returned an error");
  }

  const observations = (body.values ?? [])
    .flatMap((item) => {
      const close = numberOrNull(item.close);
      return close === null ? [] : [{
        date: item.datetime.slice(0, 10),
        close,
        high: numberOrNull(item.high),
        low: numberOrNull(item.low),
        volume: numberOrNull(item.volume),
      }];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  if (observations.length < 2) throw new Error("Market provider returned no daily prices");

  const latest = observations.at(-1) as (typeof observations)[number];
  const previous = observations.at(-2) as (typeof observations)[number];
  const change = latest.close - previous.close;
  const recentVolumes = observations
    .slice(-20)
    .map((item) => item.volume)
    .filter((value): value is number => value !== null);
  const yearObservations = observations.slice(-252);
  const highs = yearObservations.map((item) => item.high).filter((value): value is number => value !== null);
  const lows = yearObservations.map((item) => item.low).filter((value): value is number => value !== null);

  return {
    ticker,
    price: latest.close,
    previousClose: previous.close,
    change,
    changePercent: (change / previous.close) * 100,
    asOf: latest.date,
    currency: body.meta?.currency || "USD",
    volume: latest.volume,
    averageVolume: recentVolumes.length
      ? recentVolumes.reduce((total, value) => total + value, 0) / recentVolumes.length
      : null,
    marketCap: null,
    peRatio: null,
    eps: null,
    dividendYield: null,
    beta: null,
    high52Week: highs.length ? Math.max(...highs) : null,
    low52Week: lows.length ? Math.min(...lows) : null,
    history: observations.map(({ date, close }) => ({ date, close })),
    mode: "live",
    source: "Twelve Data daily market data",
  };
}

export async function GET(request: Request) {
  const ticker = validTicker(new URL(request.url).searchParams.get("ticker"));
  if (!ticker) return NextResponse.json({ error: "Enter a valid US ticker symbol." }, { status: 400 });

  const twelveDataKey = process.env.TWELVE_DATA_API_KEY;
  const alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY;
  const providers: Array<() => Promise<MarketSnapshot>> = [];
  if (twelveDataKey) providers.push(() => twelveSnapshot(ticker, twelveDataKey));
  if (alphaVantageKey) providers.push(() => alphaSnapshot(ticker, alphaVantageKey));

  if (!providers.length) {
    const sample = getDemoMarketSnapshot(ticker);
    if (sample) return NextResponse.json(sample, { headers: { "Cache-Control": "public, max-age=3600" } });
    return NextResponse.json(
      { error: "Live market data is not configured for this deployment.", requiresProvider: true },
      { status: 503 },
    );
  }

  const providerErrors: string[] = [];
  for (const provider of providers) {
    try {
      const snapshot = await provider();
      return NextResponse.json(snapshot, {
        headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" },
      });
    } catch (error) {
      providerErrors.push(error instanceof Error ? error.message : "Live provider unavailable");
    }
  }

  const sample = getDemoMarketSnapshot(ticker);
  if (sample) return NextResponse.json({ ...sample, providerNotice: providerErrors.join("; ") });
  return NextResponse.json({ error: "Market data is temporarily unavailable." }, { status: 502 });
}
