import { NextResponse } from "next/server";
import { findCompany, type Company } from "../../lib/companies";
import { buildSnapshot } from "../../lib/finance";

const SEC_HEADERS = {
  Accept: "application/json",
  "User-Agent": "StockSnap educational project contact@stocksnap.app",
};

type SecTickerEntry = { cik_str: number; ticker: string; title: string };

async function resolveCompany(tickerValue: string | null): Promise<Company | undefined> {
  const ticker = tickerValue?.trim().toUpperCase();
  if (!ticker || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) return undefined;
  const curated = findCompany(ticker);
  if (curated) return curated;

  const response = await fetch("https://www.sec.gov/files/company_tickers.json", { headers: SEC_HEADERS });
  if (!response.ok) return undefined;
  const payload = (await response.json()) as Record<string, SecTickerEntry>;
  const entry = Object.values(payload).find((item) => item.ticker.toUpperCase() === ticker);
  if (!entry) return undefined;
  return {
    ticker: entry.ticker,
    name: entry.title,
    cik: String(entry.cik_str).padStart(10, "0"),
    sector: "US public company",
    exchange: "US market",
  };
}

function validDate(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date().toISOString().slice(0, 10);
  }
  return value;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const company = await resolveCompany(url.searchParams.get("ticker"));
  const asOf = validDate(url.searchParams.get("as_of"));

  if (!company) {
    return NextResponse.json(
      { error: "We could not match that ticker to a public US company." },
      { status: 404 },
    );
  }

  try {
    const [factsResponse, submissionsResponse] = await Promise.all([
      fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${company.cik}.json`, {
        headers: SEC_HEADERS,
      }),
      fetch(`https://data.sec.gov/submissions/CIK${company.cik}.json`, {
        headers: SEC_HEADERS,
      }),
    ]);

    if (!factsResponse.ok || !submissionsResponse.ok) {
      throw new Error(`SEC responded with ${factsResponse.status}/${submissionsResponse.status}`);
    }

    const snapshot = buildSnapshot(
      company,
      await factsResponse.json(),
      await submissionsResponse.json(),
      asOf,
    );

    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("SEC ingestion failed", error);
    return NextResponse.json(
      { error: "Live SEC data is temporarily unavailable. Try again shortly." },
      { status: 502 },
    );
  }
}
