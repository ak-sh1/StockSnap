import type { CompanySnapshot } from "./finance";

export const sampleSnapshot: CompanySnapshot = {
  company: {
    ticker: "AAPL",
    name: "Apple",
    legalName: "Apple Inc.",
    cik: "0000320193",
    sector: "Technology",
  },
  asOf: "2024-11-01",
  metrics: {
    revenue: 391_035_000_000,
    revenueChange: 2.02,
    netIncome: 93_736_000_000,
    netIncomeChange: -3.36,
    assets: 364_980_000_000,
    freeCashFlow: 108_807_000_000,
    profitMargin: 0.2397,
    currentRatio: 0.867,
    liabilitiesToEquity: 5.41,
  },
  annuals: [
    { year: "2020", periodEnd: "2020-09-26", revenue: 274_515_000_000, netIncome: 57_411_000_000, operatingCash: 80_674_000_000, capex: 7_309_000_000, freeCashFlow: 73_365_000_000 },
    { year: "2021", periodEnd: "2021-09-25", revenue: 365_817_000_000, netIncome: 94_680_000_000, operatingCash: 104_038_000_000, capex: 11_085_000_000, freeCashFlow: 92_953_000_000 },
    { year: "2022", periodEnd: "2022-09-24", revenue: 394_328_000_000, netIncome: 99_803_000_000, operatingCash: 122_151_000_000, capex: 10_708_000_000, freeCashFlow: 111_443_000_000 },
    { year: "2023", periodEnd: "2023-09-30", revenue: 383_285_000_000, netIncome: 96_995_000_000, operatingCash: 110_543_000_000, capex: 10_959_000_000, freeCashFlow: 99_584_000_000 },
    { year: "2024", periodEnd: "2024-09-28", revenue: 391_035_000_000, netIncome: 93_736_000_000, operatingCash: 118_254_000_000, capex: 9_447_000_000, freeCashFlow: 108_807_000_000 },
  ],
  filings: [],
  source: "Cached SEC EDGAR sample",
};
