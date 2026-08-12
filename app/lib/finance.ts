import type { Company } from "./companies";

type SecFact = {
  start?: string;
  end: string;
  val: number;
  accn: string;
  fy?: number;
  fp?: string;
  form: string;
  filed: string;
  frame?: string;
};

type SecConcept = {
  label: string;
  description: string;
  units: Record<string, SecFact[]>;
};

type CompanyFacts = {
  entityName: string;
  facts: {
    "us-gaap"?: Record<string, SecConcept>;
  };
};

type Submissions = {
  filings?: {
    recent?: Record<string, unknown[]>;
  };
};

type AnnualPoint = {
  year: string;
  periodEnd: string;
  revenue: number | null;
  netIncome: number | null;
  operatingCash: number | null;
  capex: number | null;
  freeCashFlow: number | null;
};

type Filing = {
  accessionNumber: string;
  form: string;
  filedAt: string;
  reportDate: string;
  description: string;
  url: string;
};

export type CompanySnapshot = {
  company: Company & { legalName: string };
  asOf: string;
  metrics: {
    revenue: number | null;
    revenueChange: number | null;
    netIncome: number | null;
    netIncomeChange: number | null;
    assets: number | null;
    freeCashFlow: number | null;
    profitMargin: number | null;
    currentRatio: number | null;
    liabilitiesToEquity: number | null;
  };
  annuals: AnnualPoint[];
  filings: Filing[];
  source: string;
};

const tagGroups = {
  revenue: [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues",
    "SalesRevenueNet",
  ],
  netIncome: ["NetIncomeLoss", "ProfitLoss"],
  assets: ["Assets"],
  assetsCurrent: ["AssetsCurrent"],
  liabilities: ["Liabilities"],
  liabilitiesCurrent: ["LiabilitiesCurrent"],
  equity: [
    "StockholdersEquity",
    "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
  ],
  operatingCash: [
    "NetCashProvidedByUsedInOperatingActivities",
    "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
  ],
  capex: [
    "PaymentsToAcquirePropertyPlantAndEquipment",
    "PaymentsToAcquireProductiveAssets",
  ],
};

function concept(
  facts: CompanyFacts,
  tags: string[],
): SecConcept | undefined {
  const gaap = facts.facts["us-gaap"] ?? {};
  for (const tag of tags) {
    if (gaap[tag]) return gaap[tag];
  }
  return undefined;
}

function usdFacts(facts: CompanyFacts, tags: string[]): SecFact[] {
  return concept(facts, tags)?.units.USD ?? [];
}

function eligible(fact: SecFact, asOf: string): boolean {
  return ["10-K", "10-K/A", "10-Q", "10-Q/A"].includes(fact.form) && fact.filed <= asOf;
}

function annualFacts(facts: CompanyFacts, tags: string[], asOf: string): SecFact[] {
  const values = usdFacts(facts, tags)
    .filter(
      (fact) =>
        eligible(fact, asOf) &&
        fact.fp === "FY" &&
        fact.start &&
        Math.round(
          (Date.parse(fact.end) - Date.parse(fact.start)) / 86_400_000,
        ) >= 300,
    )
    .sort((a, b) => a.end.localeCompare(b.end) || a.filed.localeCompare(b.filed));

  const byPeriod = new Map<string, SecFact>();
  for (const value of values) byPeriod.set(value.end, value);
  return [...byPeriod.values()];
}

function latestInstant(facts: CompanyFacts, tags: string[], asOf: string): SecFact | undefined {
  return usdFacts(facts, tags)
    .filter((fact) => eligible(fact, asOf))
    .sort((a, b) => b.end.localeCompare(a.end) || b.filed.localeCompare(a.filed))[0];
}

function percentChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function safeDivide(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
}

function factValue(fact: SecFact | undefined): number | null {
  return fact?.val ?? null;
}

function getRecentFilings(company: Company, submissions: Submissions, asOf: string): Filing[] {
  const recent = submissions.filings?.recent;
  if (!recent) return [];

  const forms = (recent.form ?? []) as string[];
  const accessions = (recent.accessionNumber ?? []) as string[];
  const filingDates = (recent.filingDate ?? []) as string[];
  const reportDates = (recent.reportDate ?? []) as string[];
  const primaryDocuments = (recent.primaryDocument ?? []) as string[];
  const descriptions = (recent.primaryDocDescription ?? []) as string[];
  const numericCik = String(Number(company.cik));

  return forms
    .map((form, index) => ({ form, index }))
    .filter(({ form, index }) =>
      ["10-K", "10-Q", "8-K"].includes(form) && filingDates[index] <= asOf,
    )
    .slice(0, 8)
    .map(({ form, index }) => {
      const accession = accessions[index];
      return {
        accessionNumber: accession,
        form,
        filedAt: filingDates[index],
        reportDate: reportDates[index] || filingDates[index],
        description: descriptions[index] || `${form} filing`,
        url: `https://www.sec.gov/Archives/edgar/data/${numericCik}/${accession.replaceAll("-", "")}/${primaryDocuments[index]}`,
      };
    });
}

export function buildSnapshot(
  company: Company,
  facts: CompanyFacts,
  submissions: Submissions,
  asOf: string,
): CompanySnapshot {
  const revenue = annualFacts(facts, tagGroups.revenue, asOf);
  const netIncome = annualFacts(facts, tagGroups.netIncome, asOf);
  const operatingCash = annualFacts(facts, tagGroups.operatingCash, asOf);
  const capex = annualFacts(facts, tagGroups.capex, asOf);

  const periodEnds = [...new Set(revenue.map((item) => item.end))].slice(-5);
  const byEnd = (items: SecFact[]) => new Map(items.map((item) => [item.end, item]));
  const revenueByEnd = byEnd(revenue);
  const incomeByEnd = byEnd(netIncome);
  const cashByEnd = byEnd(operatingCash);
  const capexByEnd = byEnd(capex);

  const annuals = periodEnds.map((periodEnd): AnnualPoint => {
    const revenueValue = factValue(revenueByEnd.get(periodEnd));
    const incomeValue = factValue(incomeByEnd.get(periodEnd));
    const operatingCashValue = factValue(cashByEnd.get(periodEnd));
    const capexValue = factValue(capexByEnd.get(periodEnd));
    return {
      year: periodEnd.slice(0, 4),
      periodEnd,
      revenue: revenueValue,
      netIncome: incomeValue,
      operatingCash: operatingCashValue,
      capex: capexValue,
      freeCashFlow:
        operatingCashValue !== null && capexValue !== null
          ? operatingCashValue - capexValue
          : null,
    };
  });

  const latest = annuals.at(-1);
  const previous = annuals.at(-2);
  const latestAssets = factValue(latestInstant(facts, tagGroups.assets, asOf));
  const currentAssets = factValue(latestInstant(facts, tagGroups.assetsCurrent, asOf));
  const currentLiabilities = factValue(latestInstant(facts, tagGroups.liabilitiesCurrent, asOf));
  const liabilities = factValue(latestInstant(facts, tagGroups.liabilities, asOf));
  const equity = factValue(latestInstant(facts, tagGroups.equity, asOf));

  return {
    company: { ...company, legalName: facts.entityName || company.name },
    asOf,
    metrics: {
      revenue: latest?.revenue ?? null,
      revenueChange: percentChange(latest?.revenue ?? null, previous?.revenue ?? null),
      netIncome: latest?.netIncome ?? null,
      netIncomeChange: percentChange(latest?.netIncome ?? null, previous?.netIncome ?? null),
      assets: latestAssets,
      freeCashFlow: latest?.freeCashFlow ?? null,
      profitMargin: safeDivide(latest?.netIncome ?? null, latest?.revenue ?? null),
      currentRatio: safeDivide(currentAssets, currentLiabilities),
      liabilitiesToEquity: safeDivide(liabilities, equity),
    },
    annuals,
    filings: getRecentFilings(company, submissions, asOf),
    source: "SEC EDGAR company facts and submissions",
  };
}
