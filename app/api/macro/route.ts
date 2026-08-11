import { NextResponse } from "next/server";

type Observation = { date: string; value: number };

function parseCsv(text: string): Observation[] {
  return text
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      const [date, rawValue] = line.split(",");
      return { date, value: Number(rawValue) };
    })
    .filter((item) => item.date && Number.isFinite(item.value));
}

async function series(id: string): Promise<Observation[]> {
  const response = await fetch(
    `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=2024-01-01`,
    { headers: { Accept: "text/csv" }, signal: AbortSignal.timeout(6_000) },
  );
  if (!response.ok) throw new Error(`FRED ${id} responded with ${response.status}`);
  return parseCsv(await response.text());
}

export async function GET() {
  try {
    const tenYear = await series("DGS10");
    const latest = tenYear.at(-1)!;
    const latestTime = Date.parse(`${latest.date}T00:00:00Z`);
    const oneYear = tenYear.filter(
      (item) => latestTime - Date.parse(`${item.date}T00:00:00Z`) <= 366 * 86_400_000,
    );
    const monthTarget = latestTime - 30 * 86_400_000;
    const monthAgo = [...tenYear]
      .reverse()
      .find((item) => Date.parse(`${item.date}T00:00:00Z`) <= monthTarget) ?? tenYear[0];

    return NextResponse.json(
      {
        items: [
          { label: "10Y Treasury", ...latest, suffix: "%", decimals: 2 },
          { label: "30-day move", date: latest.date, value: (latest.value - monthAgo.value) * 100, suffix: " bp", decimals: 0 },
          { label: "12-month high", date: latest.date, value: Math.max(...oneYear.map((item) => item.value)), suffix: "%", decimals: 2 },
          { label: "12-month low", date: latest.date, value: Math.min(...oneYear.map((item) => item.value)), suffix: "%", decimals: 2 },
        ],
        source: "Federal Reserve Economic Data — 10-Year Treasury Rate",
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
        },
      },
    );
  } catch (error) {
    console.error("FRED ingestion failed", error);
    return NextResponse.json({
      items: [
        { label: "10Y Treasury", date: "2026-08-06", value: 4.69, suffix: "%", decimals: 2 },
        { label: "30-day move", date: "2026-08-06", value: 14, suffix: " bp", decimals: 0 },
        { label: "12-month high", date: "2026-08-06", value: 4.75, suffix: "%", decimals: 2 },
        { label: "12-month low", date: "2026-08-06", value: 3.97, suffix: "%", decimals: 2 },
      ],
      source: "Cached FRED snapshot; upstream feed temporarily unavailable",
    });
  }
}
