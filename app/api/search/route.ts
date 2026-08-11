import { NextResponse } from "next/server";
import { companies, type Company } from "../../lib/companies";

const SEC_HEADERS = {
  Accept: "application/json",
  "User-Agent": "StockSnap educational project contact@stocksnap.app",
};

type SecTickerEntry = {
  cik_str: number;
  ticker: string;
  title: string;
};

function matches(company: Company, query: string): boolean {
  return company.ticker.toLowerCase().startsWith(query) || company.name.toLowerCase().includes(query);
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
  if (!query) return NextResponse.json({ items: companies.slice(0, 8) });

  const curated = companies.filter((company) => matches(company, query));

  try {
    const response = await fetch("https://www.sec.gov/files/company_tickers.json", { headers: SEC_HEADERS });
    if (!response.ok) throw new Error(`SEC responded with ${response.status}`);
    const payload = (await response.json()) as Record<string, SecTickerEntry>;
    const curatedTickers = new Set(curated.map((company) => company.ticker));
    const discovered = Object.values(payload)
      .filter((entry) => {
        const ticker = entry.ticker.toLowerCase();
        const name = entry.title.toLowerCase();
        return !curatedTickers.has(entry.ticker) && (ticker.startsWith(query) || name.includes(query));
      })
      .slice(0, Math.max(0, 8 - curated.length))
      .map((entry): Company => ({
        ticker: entry.ticker,
        name: entry.title,
        cik: String(entry.cik_str).padStart(10, "0"),
        sector: "US public company",
        exchange: "US market",
      }));

    return NextResponse.json({ items: [...curated, ...discovered].slice(0, 8) }, {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
    });
  } catch {
    return NextResponse.json({ items: curated.slice(0, 8), partial: true });
  }
}
