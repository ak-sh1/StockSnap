"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { companies, type Company } from "../lib/companies";
import type { CompanySnapshot } from "../lib/finance";
import { sampleSnapshot } from "../lib/sample";

type MacroItem = {
  label: string;
  date: string;
  value: number | null;
  suffix: string;
  decimals?: number;
};

type Tab = "overview" | "filings";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "";

function formatMoney(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Not reported";
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (absolute >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (absolute >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value: number | null, fraction = false): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${(fraction ? value * 100 : value).toFixed(1)}%`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function metricTone(value: number | null): string {
  if (value === null || value === 0) return "neutral";
  return value > 0 ? "positive" : "negative";
}

function MetricCard({
  label,
  value,
  change,
  detail,
}: {
  label: string;
  value: string;
  change?: number | null;
  detail: string;
}) {
  return (
    <article className="metric-card">
      <div className="metric-topline">
        <span>{label}</span>
        <span className="metric-dot" aria-hidden="true" />
      </div>
      <strong>{value}</strong>
      <div className="metric-context">
        {change !== undefined && (
          <span className={`change ${metricTone(change)}`}>
            {change !== null && change >= 0 ? "+" : ""}{formatPercent(change)}
          </span>
        )}
        <span>{detail}</span>
      </div>
    </article>
  );
}

export function Dashboard() {
  const [snapshot, setSnapshot] = useState<CompanySnapshot>(sampleSnapshot);
  const [query, setQuery] = useState("AAPL");
  const [selectedTicker, setSelectedTicker] = useState("AAPL");
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [macro, setMacro] = useState<MacroItem[]>([]);

  const maxRevenue = useMemo(
    () => Math.max(...snapshot.annuals.map((item) => item.revenue ?? 0), 1),
    [snapshot.annuals],
  );

  async function loadCompany(company: Company) {
    setLoading(true);
    setNotice(null);
    setSelectedTicker(company.ticker);
    setQuery(company.ticker);
    setActiveTab("overview");
    try {
      const response = await fetch(`${API_BASE}/api/company?ticker=${company.ticker}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load company data.");
      setSnapshot(body);
    } catch (error) {
      if (company.ticker === "AAPL") {
        setSnapshot(sampleSnapshot);
        setNotice("Live data is unavailable, so a verified cached SEC snapshot is shown.");
      } else {
        setNotice(error instanceof Error ? error.message : "Unable to load company data.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetch(`${API_BASE}/api/company?ticker=AAPL`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Unable to load company data.");
        return body;
      })
      .then((body) => setSnapshot(body))
      .catch(() => setNotice("Live data is unavailable, so a verified cached SEC snapshot is shown."))
      .finally(() => setLoading(false));

    fetch(`${API_BASE}/api/macro`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Macro request failed");
        return response.json();
      })
      .then((body) => setMacro(body.items ?? []))
      .catch(() => setMacro([]));
  }, []);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = query.trim().toLowerCase();
    const company = companies.find(
      (item) =>
        item.ticker.toLowerCase() === normalized ||
        item.name.toLowerCase().includes(normalized),
    );
    if (!company) {
      setNotice("Try one of the supported companies shown below the search box.");
      return;
    }
    loadCompany(company);
  }

  const latestPeriod = snapshot.annuals.at(-1)?.periodEnd;

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="FilingScope home">
          <span className="brand-mark" aria-hidden="true">F</span>
          <span>FilingScope</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#dashboard">Dashboard</a>
          <a href="#methodology">Methodology</a>
          <a className="source-link" href="https://www.sec.gov/search-filings" target="_blank" rel="noreferrer">
            SEC source ↗
          </a>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow"><span /> Public company fundamentals</div>
        <h1>Understand the business<br />behind the ticker.</h1>
        <p className="hero-copy">
          Clean financial statements, useful ratios, and recent filings—sourced directly from public SEC data.
        </p>

        <form className="company-search" onSubmit={submitSearch} role="search">
          <label htmlFor="company-search">Search by company or ticker</label>
          <div className="search-control">
            <span className="search-icon" aria-hidden="true">⌕</span>
            <input
              id="company-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try Apple or AAPL"
              autoComplete="off"
            />
            <button type="submit">View company <span aria-hidden="true">→</span></button>
          </div>
        </form>

        <div className="quick-picks" aria-label="Popular companies">
          <span>Popular</span>
          {companies.slice(0, 6).map((company) => (
            <button
              key={company.ticker}
              className={selectedTicker === company.ticker ? "active" : ""}
              onClick={() => loadCompany(company)}
              type="button"
            >
              {company.ticker}
            </button>
          ))}
        </div>
      </section>

      <section className="macro-strip" aria-label="US macroeconomic snapshot">
        <div className="macro-title">
          <span className="live-pulse" />
          <div><strong>US macro snapshot</strong><small>Latest official observations</small></div>
        </div>
        {macro.length > 0 ? macro.map((item) => (
          <div className="macro-item" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value === null ? "—" : `${item.value.toFixed(item.decimals ?? 2)}${item.suffix}`}</strong>
            <small>{formatDate(item.date)}</small>
          </div>
        )) : (
          <div className="macro-loading">Macro series update when the public feed is available.</div>
        )}
      </section>

      <section className={`dashboard ${loading ? "is-loading" : ""}`} id="dashboard" aria-busy={loading}>
        <div className="company-heading">
          <div className="ticker-badge">{snapshot.company.ticker.slice(0, 2)}</div>
          <div>
            <div className="company-kicker">{snapshot.company.sector} · NASDAQ/NYSE</div>
            <h2>{snapshot.company.legalName}</h2>
            <div className="company-meta">
              <span>{snapshot.company.ticker}</span>
              <span>CIK {snapshot.company.cik}</span>
              <span className="verified"><i /> SEC verified</span>
            </div>
          </div>
          <div className="updated-block">
            <span>Data available through</span>
            <strong>{formatDate(snapshot.asOf)}</strong>
          </div>
        </div>

        {notice && <div className="notice" role="status">{notice}</div>}

        <div className="tabs" role="tablist" aria-label="Company information">
          <button className={activeTab === "overview" ? "active" : ""} onClick={() => setActiveTab("overview")} role="tab" aria-selected={activeTab === "overview"}>Overview</button>
          <button className={activeTab === "filings" ? "active" : ""} onClick={() => setActiveTab("filings")} role="tab" aria-selected={activeTab === "filings"}>Recent filings <span>{snapshot.filings.length}</span></button>
        </div>

        {activeTab === "overview" ? (
          <>
            <div className="metrics-grid">
              <MetricCard label="Annual revenue" value={formatMoney(snapshot.metrics.revenue)} change={snapshot.metrics.revenueChange} detail={latestPeriod ? `Year ended ${formatDate(latestPeriod)}` : "Latest fiscal year"} />
              <MetricCard label="Net income" value={formatMoney(snapshot.metrics.netIncome)} change={snapshot.metrics.netIncomeChange} detail="Year over year" />
              <MetricCard label="Free cash flow" value={formatMoney(snapshot.metrics.freeCashFlow)} detail="Operating cash less capex" />
              <MetricCard label="Total assets" value={formatMoney(snapshot.metrics.assets)} detail="Latest reported balance" />
            </div>

            <div className="content-grid">
              <article className="panel performance-panel">
                <div className="panel-heading">
                  <div><span className="section-label">Performance</span><h3>Five-year financial trend</h3></div>
                  <div className="legend"><span><i className="revenue-key" /> Revenue</span><span><i className="income-key" /> Net income</span></div>
                </div>
                <div className="bar-chart" role="img" aria-label="Annual revenue and net income for the last five fiscal years">
                  {snapshot.annuals.map((item) => {
                    const revenueHeight = Math.max(((item.revenue ?? 0) / maxRevenue) * 100, 3);
                    const incomeHeight = Math.max(((item.netIncome ?? 0) / maxRevenue) * 100, 2);
                    return (
                      <div className="bar-column" key={item.periodEnd}>
                        <div className="bar-value">{formatMoney(item.revenue)}</div>
                        <div className="bars">
                          <div className="bar revenue-bar" style={{ height: `${revenueHeight}%` }} />
                          <div className="bar income-bar" style={{ height: `${incomeHeight}%` }} />
                        </div>
                        <span>{item.year}</span>
                      </div>
                    );
                  })}
                </div>
              </article>

              <aside className="panel ratios-panel">
                <div className="panel-heading"><div><span className="section-label">Health check</span><h3>Key ratios</h3></div></div>
                <dl className="ratio-list">
                  <div><dt>Profit margin<small>Net income ÷ revenue</small></dt><dd>{formatPercent(snapshot.metrics.profitMargin, true)}</dd></div>
                  <div><dt>Current ratio<small>Short-term liquidity</small></dt><dd>{snapshot.metrics.currentRatio?.toFixed(2) ?? "—"}×</dd></div>
                  <div><dt>Liabilities / equity<small>Balance-sheet leverage</small></dt><dd>{snapshot.metrics.liabilitiesToEquity?.toFixed(2) ?? "—"}×</dd></div>
                </dl>
                <p className="ratio-note">Ratios use the latest values available in SEC filings. They are descriptive, not investment advice.</p>
              </aside>
            </div>
          </>
        ) : (
          <article className="panel filings-panel">
            <div className="panel-heading"><div><span className="section-label">Primary sources</span><h3>Recent SEC filings</h3></div></div>
            {snapshot.filings.length ? (
              <div className="filing-list">
                {snapshot.filings.map((filing) => (
                  <a href={filing.url} target="_blank" rel="noreferrer" key={filing.accessionNumber}>
                    <span className={`form-badge form-${filing.form.replace("-", "")}`}>{filing.form}</span>
                    <span className="filing-description"><strong>{filing.description}</strong><small>Reporting period {formatDate(filing.reportDate)}</small></span>
                    <span className="filing-date">Filed {formatDate(filing.filedAt)}</span>
                    <span aria-hidden="true">↗</span>
                  </a>
                ))}
              </div>
            ) : <p className="empty-state">Recent filing links are unavailable in the cached sample. Refresh when the live SEC feed is available.</p>}
          </article>
        )}
      </section>

      <section className="methodology" id="methodology">
        <div><span className="section-label">Built for clarity</span><h2>Numbers you can trace.</h2></div>
        <div className="method-grid">
          <article><span>01</span><h3>Official sources</h3><p>Company facts and filings come directly from SEC EDGAR. Macro context comes from FRED.</p></article>
          <article><span>02</span><h3>No black box</h3><p>Every metric uses a documented formula, reported period, and source filing.</p></article>
          <article><span>03</span><h3>Point-in-time aware</h3><p>The API can limit results to filings available by a selected historical date.</p></article>
        </div>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top"><span className="brand-mark">F</span><span>FilingScope</span></a>
        <p>Public financial data, made useful. Not investment advice.</p>
        <a href="https://www.sec.gov/edgar/sec-api-documentation" target="_blank" rel="noreferrer">Data documentation ↗</a>
      </footer>
    </main>
  );
}
