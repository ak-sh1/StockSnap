import { NextResponse } from "next/server";
import { findCompany } from "../../lib/companies";
import { buildSnapshot } from "../../lib/finance";

export const runtime = "edge";

const SEC_HEADERS = {
  Accept: "application/json",
  "User-Agent": "FilingScope educational project contact@filingscope.app",
};

function validDate(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date().toISOString().slice(0, 10);
  }
  return value;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const company = findCompany(url.searchParams.get("ticker"));
  const asOf = validDate(url.searchParams.get("as_of"));

  if (!company) {
    return NextResponse.json(
      { error: "Choose a company from the supported list." },
      { status: 400 },
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
