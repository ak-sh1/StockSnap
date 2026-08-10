export type Company = {
  ticker: string;
  name: string;
  cik: string;
  sector: string;
  exchange: string;
};

export const companies: Company[] = [
  { ticker: "AAPL", name: "Apple", cik: "0000320193", sector: "Technology", exchange: "NASDAQ" },
  { ticker: "MSFT", name: "Microsoft", cik: "0000789019", sector: "Technology", exchange: "NASDAQ" },
  { ticker: "NVDA", name: "NVIDIA", cik: "0001045810", sector: "Technology", exchange: "NASDAQ" },
  { ticker: "AMZN", name: "Amazon", cik: "0001018724", sector: "Consumer", exchange: "NASDAQ" },
  { ticker: "GOOGL", name: "Alphabet", cik: "0001652044", sector: "Technology", exchange: "NASDAQ" },
  { ticker: "META", name: "Meta Platforms", cik: "0001326801", sector: "Technology", exchange: "NASDAQ" },
  { ticker: "TSLA", name: "Tesla", cik: "0001318605", sector: "Automotive", exchange: "NASDAQ" },
  { ticker: "JPM", name: "JPMorgan Chase", cik: "0000019617", sector: "Financials", exchange: "NYSE" },
  { ticker: "V", name: "Visa", cik: "0001403161", sector: "Financials", exchange: "NYSE" },
  { ticker: "MA", name: "Mastercard", cik: "0001141391", sector: "Financials", exchange: "NYSE" },
  { ticker: "WMT", name: "Walmart", cik: "0000104169", sector: "Consumer", exchange: "NYSE" },
  { ticker: "COST", name: "Costco", cik: "0000909832", sector: "Consumer", exchange: "NASDAQ" },
  { ticker: "KO", name: "Coca-Cola", cik: "0000021344", sector: "Consumer", exchange: "NYSE" },
  { ticker: "PEP", name: "PepsiCo", cik: "0000077476", sector: "Consumer", exchange: "NASDAQ" },
  { ticker: "MCD", name: "McDonald’s", cik: "0000063908", sector: "Consumer", exchange: "NYSE" },
  { ticker: "NKE", name: "Nike", cik: "0000320187", sector: "Consumer", exchange: "NYSE" },
  { ticker: "XOM", name: "Exxon Mobil", cik: "0000034088", sector: "Energy", exchange: "NYSE" },
  { ticker: "CVX", name: "Chevron", cik: "0000093410", sector: "Energy", exchange: "NYSE" },
  { ticker: "JNJ", name: "Johnson & Johnson", cik: "0000200406", sector: "Healthcare", exchange: "NYSE" },
  { ticker: "UNH", name: "UnitedHealth", cik: "0000731766", sector: "Healthcare", exchange: "NYSE" },
  { ticker: "LLY", name: "Eli Lilly", cik: "0000059478", sector: "Healthcare", exchange: "NYSE" },
  { ticker: "PFE", name: "Pfizer", cik: "0000078003", sector: "Healthcare", exchange: "NYSE" },
  { ticker: "HD", name: "Home Depot", cik: "0000354950", sector: "Consumer", exchange: "NYSE" },
  { ticker: "DIS", name: "Walt Disney", cik: "0001744489", sector: "Communication", exchange: "NYSE" },
  { ticker: "NFLX", name: "Netflix", cik: "0001065280", sector: "Communication", exchange: "NASDAQ" },
  { ticker: "CRM", name: "Salesforce", cik: "0001108524", sector: "Technology", exchange: "NYSE" },
  { ticker: "ORCL", name: "Oracle", cik: "0001341439", sector: "Technology", exchange: "NYSE" },
  { ticker: "AMD", name: "AMD", cik: "0000002488", sector: "Technology", exchange: "NASDAQ" },
  { ticker: "INTC", name: "Intel", cik: "0000050863", sector: "Technology", exchange: "NASDAQ" },
  { ticker: "BA", name: "Boeing", cik: "0000012927", sector: "Industrials", exchange: "NYSE" },
  { ticker: "CAT", name: "Caterpillar", cik: "0000018230", sector: "Industrials", exchange: "NYSE" },
];

export function findCompany(ticker: string | null): Company | undefined {
  if (!ticker) return undefined;
  return companies.find((company) => company.ticker === ticker.toUpperCase());
}
