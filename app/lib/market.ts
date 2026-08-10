export type PricePoint = {
  date: string;
  close: number;
};

export type MarketSnapshot = {
  ticker: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  asOf: string;
  currency: string;
  volume: number | null;
  averageVolume: number | null;
  marketCap: number | null;
  peRatio: number | null;
  eps: number | null;
  dividendYield: number | null;
  beta: number | null;
  high52Week: number | null;
  low52Week: number | null;
  history: PricePoint[];
  mode: "live" | "demo";
  source: string;
};

type DemoQuote = Omit<MarketSnapshot, "ticker" | "previousClose" | "change" | "changePercent" | "history" | "mode" | "source" | "asOf" | "currency"> & {
  price: number;
  dayChangePercent: number;
  yearChangePercent: number;
  volatility: number;
};

const demoQuotes: Record<string, DemoQuote> = {
  AAPL: { price: 229.98, dayChangePercent: 0.62, yearChangePercent: 28.4, volatility: 1.15, volume: 47_800_000, averageVolume: 52_100_000, marketCap: 3_460_000_000_000, peRatio: 37.8, eps: 6.08, dividendYield: 0.0043, beta: 1.18, high52Week: 260.10, low52Week: 164.08 },
  MSFT: { price: 418.79, dayChangePercent: -0.31, yearChangePercent: 13.1, volatility: 1.0, volume: 18_900_000, averageVolume: 21_700_000, marketCap: 3_110_000_000_000, peRatio: 34.6, eps: 12.10, dividendYield: 0.0079, beta: 0.89, high52Week: 468.35, low52Week: 344.77 },
  NVDA: { price: 138.31, dayChangePercent: 1.74, yearChangePercent: 171.2, volatility: 2.1, volume: 246_000_000, averageVolume: 302_000_000, marketCap: 3_390_000_000_000, peRatio: 54.4, eps: 2.54, dividendYield: 0.0003, beta: 1.66, high52Week: 152.89, low52Week: 47.32 },
  AMZN: { price: 220.22, dayChangePercent: 1.06, yearChangePercent: 43.5, volatility: 1.35, volume: 31_400_000, averageVolume: 38_700_000, marketCap: 2_320_000_000_000, peRatio: 47.1, eps: 4.68, dividendYield: null, beta: 1.15, high52Week: 233.00, low52Week: 144.05 },
  GOOGL: { price: 189.43, dayChangePercent: 0.20, yearChangePercent: 35.4, volatility: 1.2, volume: 23_900_000, averageVolume: 28_100_000, marketCap: 2_330_000_000_000, peRatio: 25.1, eps: 7.54, dividendYield: 0.0042, beta: 1.02, high52Week: 201.42, low52Week: 130.67 },
  META: { price: 599.24, dayChangePercent: 0.89, yearChangePercent: 72.8, volatility: 1.45, volume: 12_900_000, averageVolume: 15_200_000, marketCap: 1_510_000_000_000, peRatio: 30.5, eps: 19.64, dividendYield: 0.0033, beta: 1.19, high52Week: 638.40, low52Week: 340.01 },
  TSLA: { price: 379.28, dayChangePercent: -1.43, yearChangePercent: 51.7, volatility: 2.4, volume: 91_000_000, averageVolume: 94_000_000, marketCap: 1_220_000_000_000, peRatio: 103.2, eps: 3.67, dividendYield: null, beta: 2.29, high52Week: 488.54, low52Week: 138.80 },
  JPM: { price: 239.87, dayChangePercent: 0.44, yearChangePercent: 37.6, volatility: 0.9, volume: 8_500_000, averageVolume: 9_200_000, marketCap: 675_000_000_000, peRatio: 13.4, eps: 17.90, dividendYield: 0.020, beta: 1.07, high52Week: 254.31, low52Week: 164.30 },
  WMT: { price: 90.35, dayChangePercent: -0.18, yearChangePercent: 71.4, volatility: 0.72, volume: 14_200_000, averageVolume: 17_600_000, marketCap: 726_000_000_000, peRatio: 37.2, eps: 2.43, dividendYield: 0.0092, beta: 0.52, high52Week: 96.18, low52Week: 51.87 },
  KO: { price: 62.26, dayChangePercent: 0.16, yearChangePercent: 6.8, volatility: 0.55, volume: 12_600_000, averageVolume: 14_300_000, marketCap: 268_000_000_000, peRatio: 25.7, eps: 2.42, dividendYield: 0.031, beta: 0.61, high52Week: 73.53, low52Week: 57.47 },
  XOM: { price: 108.22, dayChangePercent: -0.52, yearChangePercent: 8.3, volatility: 0.95, volume: 13_900_000, averageVolume: 15_700_000, marketCap: 475_000_000_000, peRatio: 13.5, eps: 8.01, dividendYield: 0.036, beta: 0.89, high52Week: 126.34, low52Week: 95.77 },
  JNJ: { price: 144.62, dayChangePercent: 0.27, yearChangePercent: -8.9, volatility: 0.62, volume: 6_300_000, averageVolume: 7_400_000, marketCap: 348_000_000_000, peRatio: 21.0, eps: 6.89, dividendYield: 0.034, beta: 0.51, high52Week: 168.85, low52Week: 143.13 },
};

export const demoTickers = Object.keys(demoQuotes);

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4_294_967_296;
  };
}

function tickerSeed(ticker: string): number {
  return [...ticker].reduce((total, character) => total * 31 + character.charCodeAt(0), 17);
}

function demoHistory(ticker: string, quote: DemoQuote): PricePoint[] {
  const random = seededRandom(tickerSeed(ticker));
  const points: PricePoint[] = [];
  const sessions = 252;
  const startPrice = quote.price / (1 + quote.yearChangePercent / 100);
  const targetLogReturn = Math.log(quote.price / startPrice);
  let price = startPrice;
  const end = new Date("2025-01-02T00:00:00Z");

  for (let index = 0; index < sessions; index += 1) {
    const progress = index / (sessions - 1);
    const remaining = sessions - index;
    const trend = targetLogReturn / sessions;
    const noise = (random() - 0.5) * 0.034 * quote.volatility;
    const correction = Math.log(quote.price / price) / Math.max(remaining, 1);
    price *= Math.exp(trend * (0.45 + progress * 0.1) + noise + correction * 0.55);
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (sessions - 1 - index) * 1.45);
    points.push({ date: date.toISOString().slice(0, 10), close: Number(price.toFixed(2)) });
  }

  points[points.length - 1] = { date: "2025-01-02", close: quote.price };
  return points;
}

export function getDemoMarketSnapshot(ticker: string): MarketSnapshot | null {
  const normalized = ticker.toUpperCase();
  const quote = demoQuotes[normalized];
  if (!quote) return null;
  const previousClose = quote.price / (1 + quote.dayChangePercent / 100);
  const change = quote.price - previousClose;
  return {
    ticker: normalized,
    price: quote.price,
    previousClose: Number(previousClose.toFixed(2)),
    change: Number(change.toFixed(2)),
    changePercent: quote.dayChangePercent,
    asOf: "2025-01-02",
    currency: "USD",
    volume: quote.volume,
    averageVolume: quote.averageVolume,
    marketCap: quote.marketCap,
    peRatio: quote.peRatio,
    eps: quote.eps,
    dividendYield: quote.dividendYield,
    beta: quote.beta,
    high52Week: quote.high52Week,
    low52Week: quote.low52Week,
    history: demoHistory(normalized, quote),
    mode: "demo",
    source: "Curated demonstration snapshot",
  };
}

export const sampleMarketSnapshot = getDemoMarketSnapshot("AAPL") as MarketSnapshot;
