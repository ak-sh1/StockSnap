"use client";

import {
  FormEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { companies, findCompany, type Company } from "../lib/companies";
import type { CompanySnapshot } from "../lib/finance";
import {
  demoTickers,
  getDemoMarketSnapshot,
  sampleMarketSnapshot,
  type MarketSnapshot,
  type PricePoint,
} from "../lib/market";
import { sampleSnapshot } from "../lib/sample";

type MacroItem = {
  label: string;
  date: string;
  value: number | null;
  suffix: string;
  decimals?: number;
};

type RangeKey = "1M" | "3M" | "1Y";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "";
const WATCHLIST_STORAGE_KEY = "stocksnap-watchlist:v1";
const rangeSessions: Record<RangeKey, number> = { "1M": 22, "3M": 66, "1Y": 252 };
const comparisonCompanies = companies.filter((company) => demoTickers.includes(company.ticker));

function formatMoney(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (absolute >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (absolute >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatCompact(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatPrice(value: number | null, currency = "USD"): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatPercent(value: number | null, fraction = false): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${(fraction ? value * 100 : value).toFixed(2)}%`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function emptySnapshot(company: Company): CompanySnapshot {
  return {
    company: { ...company, legalName: company.name },
    asOf: new Date().toISOString().slice(0, 10),
    metrics: {
      revenue: null,
      revenueChange: null,
      netIncome: null,
      netIncomeChange: null,
      assets: null,
      freeCashFlow: null,
      profitMargin: null,
      currentRatio: null,
      liabilitiesToEquity: null,
    },
    annuals: [],
    filings: [],
    source: "SEC EDGAR",
  };
}

function tone(value: number | null): "positive" | "negative" | "neutral" {
  if (value === null || value === 0) return "neutral";
  return value > 0 ? "positive" : "negative";
}

function rangePoints(history: PricePoint[], range: RangeKey): PricePoint[] {
  return history.slice(-Math.min(rangeSessions[range], history.length));
}

function normalize(points: PricePoint[]): number[] {
  const first = points[0]?.close;
  if (!first) return [];
  return points.map((point) => ((point.close / first) - 1) * 100);
}

function PriceChart({
  primary,
  secondary,
  range,
}: {
  primary: MarketSnapshot;
  secondary: MarketSnapshot | null;
  range: RangeKey;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const primaryPoints = useMemo(() => rangePoints(primary.history, range), [primary.history, range]);
  const secondaryPoints = useMemo(
    () => secondary ? rangePoints(secondary.history, range) : [],
    [secondary, range],
  );
  const primaryValues = useMemo(() => normalize(primaryPoints), [primaryPoints]);
  const secondaryValues = useMemo(() => normalize(secondaryPoints), [secondaryPoints]);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [width, setWidth] = useState(760);

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !primaryValues.length) return;
    const height = 310;
    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(pixelRatio, pixelRatio);

    const padding = { top: 24, right: 18, bottom: 30, left: 18 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const allValues = [...primaryValues, ...secondaryValues];
    const rawMin = Math.min(...allValues, 0);
    const rawMax = Math.max(...allValues, 0);
    const spread = Math.max(rawMax - rawMin, 4);
    const minimum = rawMin - spread * 0.12;
    const maximum = rawMax + spread * 0.12;

    context.clearRect(0, 0, width, height);
    context.strokeStyle = "#e5e9e4";
    context.lineWidth = 1;
    context.setLineDash([3, 5]);
    for (let line = 0; line <= 4; line += 1) {
      const y = padding.top + (chartHeight / 4) * line;
      context.beginPath();
      context.moveTo(padding.left, y);
      context.lineTo(width - padding.right, y);
      context.stroke();
    }
    context.setLineDash([]);

    const drawLine = (values: number[], color: string, lineWidth: number) => {
      if (!values.length) return;
      context.strokeStyle = color;
      context.lineWidth = lineWidth;
      context.lineJoin = "round";
      context.lineCap = "round";
      context.beginPath();
      values.forEach((value, index) => {
        const x = padding.left + (index / Math.max(values.length - 1, 1)) * chartWidth;
        const y = padding.top + ((maximum - value) / (maximum - minimum)) * chartHeight;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
    };

    if (secondaryValues.length) drawLine(secondaryValues, "#8d9b94", 1.5);
    drawLine(primaryValues, "#15a36d", 2.5);

    if (hoverIndex !== null) {
      const index = Math.min(hoverIndex, primaryValues.length - 1);
      const x = padding.left + (index / Math.max(primaryValues.length - 1, 1)) * chartWidth;
      const y = padding.top + ((maximum - primaryValues[index]) / (maximum - minimum)) * chartHeight;
      context.strokeStyle = "#aab4ae";
      context.lineWidth = 1;
      context.setLineDash([2, 3]);
      context.beginPath();
      context.moveTo(x, padding.top);
      context.lineTo(x, height - padding.bottom);
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = "#0d5f43";
      context.beginPath();
      context.arc(x, y, 4, 0, Math.PI * 2);
      context.fill();
    }
  }, [hoverIndex, primaryValues, secondaryValues, width]);

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left - 18) / Math.max(bounds.width - 36, 1)));
    setHoverIndex(Math.round(ratio * Math.max(primaryPoints.length - 1, 0)));
  }

  const activeIndex = hoverIndex ?? primaryPoints.length - 1;
  const activePoint = primaryPoints[Math.min(activeIndex, primaryPoints.length - 1)];
  const activeSecondary = secondaryPoints.length
    ? secondaryPoints[Math.min(activeIndex, secondaryPoints.length - 1)]
    : null;

  return (
    <div className="chart-frame" ref={frameRef}>
      <div className="chart-tooltip" aria-live="polite">
        <span>{activePoint ? formatDate(activePoint.date) : "No price history"}</span>
        <strong>{primary.ticker} {activePoint ? formatPrice(activePoint.close, primary.currency) : "—"}</strong>
        {secondary && activeSecondary && <small>{secondary.ticker} {formatPrice(activeSecondary.close, secondary.currency)}</small>}
      </div>
      <canvas
        ref={canvasRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIndex(null)}
        aria-label={`${primary.ticker} normalized price performance chart${secondary ? ` compared with ${secondary.ticker}` : ""}`}
        role="img"
      />
      <div className="chart-axis"><span>{primaryPoints[0] ? formatDate(primaryPoints[0].date) : ""}</span><span>{primaryPoints.at(-1) ? formatDate(primaryPoints.at(-1)?.date ?? "") : ""}</span></div>
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="stat"><dt>{label}</dt><dd>{value}</dd>{detail && <small>{detail}</small>}</div>;
}

export function Dashboard() {
  const [snapshot, setSnapshot] = useState<CompanySnapshot>(sampleSnapshot);
  const [market, setMarket] = useState<MarketSnapshot | null>(sampleMarketSnapshot);
  const [comparison, setComparison] = useState<MarketSnapshot | null>(getDemoMarketSnapshot("MSFT"));
  const [comparisonTicker, setComparisonTicker] = useState("MSFT");
  const [query, setQuery] = useState("AAPL");
  const [selectedTicker, setSelectedTicker] = useState("AAPL");
  const [searchResults, setSearchResults] = useState<Company[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [range, setRange] = useState<RangeKey>("1Y");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [macro, setMacro] = useState<MacroItem[]>([]);
  const [watchlist, setWatchlist] = useState<string[]>([]);

  const visiblePoints = useMemo(() => market ? rangePoints(market.history, range) : [], [market, range]);
  const rangeReturn = useMemo(() => {
    const first = visiblePoints[0]?.close;
    const last = visiblePoints.at(-1)?.close;
    return first && last ? ((last / first) - 1) * 100 : null;
  }, [visiblePoints]);
  const maxRevenue = useMemo(
    () => Math.max(...snapshot.annuals.map((item) => item.revenue ?? 0), 1),
    [snapshot.annuals],
  );
  const inWatchlist = watchlist.includes(selectedTicker);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(WATCHLIST_STORAGE_KEY) ?? "null");
        setWatchlist(Array.isArray(saved) ? saved.filter((item) => typeof item === "string") : ["AAPL", "MSFT", "NVDA"]);
      } catch {
        setWatchlist(["AAPL", "MSFT", "NVDA"]);
      }
    });
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((response) => response.json())
        .then((body) => setSearchResults(body.items ?? []))
        .catch((error) => {
          if (error instanceof Error && error.name !== "AbortError") setSearchResults([]);
        });
    }, 180);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query, searchOpen]);

  useEffect(() => {
    Promise.allSettled([
      fetch(`${API_BASE}/api/company?ticker=AAPL`).then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Unable to load company fundamentals.");
        return body as CompanySnapshot;
      }),
      fetch(`${API_BASE}/api/stock?ticker=AAPL`).then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Unable to load market data.");
        return body as MarketSnapshot;
      }),
      fetch(`${API_BASE}/api/macro`).then(async (response) => {
        if (!response.ok) throw new Error("Market context request failed");
        return response.json();
      }),
    ]).then(([companyResult, marketResult, macroResult]) => {
      if (companyResult.status === "fulfilled") setSnapshot(companyResult.value);
      if (marketResult.status === "fulfilled") setMarket(marketResult.value);
      if (macroResult.status === "fulfilled") setMacro(macroResult.value.items ?? []);
      if (companyResult.status === "rejected") setNotice("Live fundamentals are unavailable, so a cached SEC snapshot is shown.");
      setLoading(false);
    });
  }, []);

  async function loadStock(company: Company) {
    setLoading(true);
    setNotice(null);
    setSelectedTicker(company.ticker);
    setQuery(company.ticker);
    setSearchOpen(false);
    setSnapshot(emptySnapshot(company));
    setMarket(null);

    const [companyResult, marketResult] = await Promise.allSettled([
      fetch(`${API_BASE}/api/company?ticker=${encodeURIComponent(company.ticker)}`).then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Unable to load company fundamentals.");
        return body as CompanySnapshot;
      }),
      fetch(`${API_BASE}/api/stock?ticker=${encodeURIComponent(company.ticker)}`).then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Unable to load market data.");
        return body as MarketSnapshot;
      }),
    ]);

    const messages: string[] = [];
    if (companyResult.status === "fulfilled") setSnapshot(companyResult.value);
    else messages.push(companyResult.reason instanceof Error ? companyResult.reason.message : "Fundamentals are unavailable.");
    if (marketResult.status === "fulfilled") setMarket(marketResult.value);
    else messages.push("Price history for this ticker requires a configured market-data key. SEC fundamentals are still available.");
    setNotice(messages.length ? messages.join(" ") : null);
    setLoading(false);
  }

  async function loadTicker(ticker: string) {
    const curated = findCompany(ticker);
    if (curated) return loadStock(curated);
    try {
      const response = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(ticker)}`);
      const body = await response.json();
      const exact = (body.items as Company[] | undefined)?.find((item) => item.ticker.toUpperCase() === ticker.toUpperCase());
      if (!exact) throw new Error("Ticker not found");
      return loadStock(exact);
    } catch {
      setNotice("We could not match that ticker to a public US company.");
    }
  }

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = query.trim();
    const exact = searchResults.find((item) => item.ticker.toLowerCase() === normalized.toLowerCase());
    if (exact) return loadStock(exact);
    if (searchResults[0]) return loadStock(searchResults[0]);
    return loadTicker(normalized);
  }

  async function changeComparison(ticker: string) {
    setComparisonTicker(ticker);
    try {
      const response = await fetch(`${API_BASE}/api/stock?ticker=${encodeURIComponent(ticker)}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Comparison unavailable");
      setComparison(body as MarketSnapshot);
    } catch {
      setComparison(getDemoMarketSnapshot(ticker));
    }
  }

  function toggleWatchlist() {
    const next = inWatchlist ? watchlist.filter((ticker) => ticker !== selectedTicker) : [...watchlist, selectedTicker];
    setWatchlist(next);
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(next));
  }

  const latestPeriod = snapshot.annuals.at(-1)?.periodEnd;
  const isPositive = (market?.changePercent ?? 0) >= 0;

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="StockSnap home">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>StockSnap</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#dashboard">Research</a>
          <a href="#watchlist">Watchlist</a>
          <a href="#methodology">Data sources</a>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-grid">
          <div>
            <div className="eyebrow"><span /> Stock research at a glance</div>
            <h1>Know the stock.<br />Skip the noise.</h1>
            <p className="hero-copy">Price movement, useful comparisons, and the financials that matter—in one focused view.</p>
          </div>
          <div className="hero-search-card">
            <form className="company-search" onSubmit={submitSearch} role="search">
              <label htmlFor="company-search">Search any SEC-listed US company</label>
              <div className="search-control">
                <span className="search-icon" aria-hidden="true">⌕</span>
                <input
                  id="company-search"
                  value={query}
                  onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }}
                  onFocus={() => setSearchOpen(true)}
                  placeholder="Apple, NVIDIA, or AAPL"
                  autoComplete="off"
                />
                <button type="submit">Research <span aria-hidden="true">→</span></button>
              </div>
              {searchOpen && searchResults.length > 0 && (
                <div className="search-results" id="search-results">
                  {searchResults.map((company) => (
                    <button type="button" key={`${company.ticker}-${company.cik}`} onClick={() => loadStock(company)}>
                      <strong>{company.ticker}</strong><span>{company.name}</span><small>{company.exchange}</small>
                    </button>
                  ))}
                </div>
              )}
            </form>
            <div className="quick-picks" aria-label="Popular stocks">
              <span>Popular</span>
              {companies.slice(0, 6).map((company) => (
                <button key={company.ticker} className={selectedTicker === company.ticker ? "active" : ""} onClick={() => loadStock(company)} type="button">{company.ticker}</button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="market-strip" aria-label="Market context">
        <div className="strip-title"><span className="live-pulse" /><div><strong>Market context</strong><small>Latest official observations</small></div></div>
        {macro.length > 0 ? macro.map((item) => (
          <div className="strip-item" key={item.label}><span>{item.label}</span><strong>{item.value === null ? "—" : `${item.value.toFixed(item.decimals ?? 2)}${item.suffix}`}</strong><small>{formatDate(item.date)}</small></div>
        )) : <div className="strip-loading">Treasury context updates when the public feed is available.</div>}
      </section>

      <section className={`dashboard ${loading ? "is-loading" : ""}`} id="dashboard" aria-busy={loading}>
        <div className="stock-heading">
          <div className="ticker-badge">{snapshot.company.ticker.slice(0, 2)}</div>
          <div className="stock-identity">
            <span className="company-kicker">{snapshot.company.exchange} · {snapshot.company.sector}</span>
            <h2>{snapshot.company.legalName}</h2>
            <div className="company-meta"><span>{snapshot.company.ticker}</span><span>CIK {snapshot.company.cik}</span><span className="verified"><i /> SEC fundamentals</span></div>
          </div>
          <div className="quote-block">
            <div className="quote-line"><strong>{market ? formatPrice(market.price, market.currency) : "Price unavailable"}</strong>{market && <span className={`quote-change ${tone(market.changePercent)}`}>{isPositive ? "+" : ""}{formatPrice(market.change)} ({isPositive ? "+" : ""}{formatPercent(market.changePercent)})</span>}</div>
            <div className="quote-meta">{market ? `Close · ${formatDate(market.asOf)}` : "Fundamentals-only view"}{market?.mode === "demo" && <span className="demo-badge">Demo prices</span>}</div>
          </div>
          <button className={`watch-button ${inWatchlist ? "saved" : ""}`} type="button" onClick={toggleWatchlist}>{inWatchlist ? "✓ In watchlist" : "+ Add to watchlist"}</button>
        </div>

        {notice && <div className="notice" role="status">{notice}</div>}
        {market?.mode === "demo" && <div className="demo-notice"><strong>Demo market data</strong><span>This public deployment uses a dated sample. Add <code>ALPHA_VANTAGE_API_KEY</code> to the deployed environment for live daily data.</span></div>}

        <div className="research-grid">
          <article className="panel chart-panel">
            <div className="panel-heading chart-heading">
              <div><span className="section-label">Price performance</span><h3>{range} return <span className={tone(rangeReturn)}>{rangeReturn !== null && rangeReturn >= 0 ? "+" : ""}{formatPercent(rangeReturn)}</span></h3></div>
              <div className="chart-tools">
                <label>Compare with<select value={comparisonTicker} onChange={(event) => changeComparison(event.target.value)}>{comparisonCompanies.filter((company) => company.ticker !== selectedTicker).map((company) => <option key={company.ticker} value={company.ticker}>{company.ticker}</option>)}</select></label>
                <div className="range-picker" aria-label="Chart time range">{(["1M", "3M", "1Y"] as RangeKey[]).map((item) => <button type="button" key={item} onClick={() => setRange(item)} className={range === item ? "active" : ""}>{item}</button>)}</div>
              </div>
            </div>
            {market ? <><div className="chart-legend"><span><i className="primary-key" />{market.ticker}</span>{comparison && comparison.ticker !== market.ticker && <span><i className="comparison-key" />{comparison.ticker}</span>}<small>Normalized to 0% at period start</small></div><PriceChart primary={market} secondary={comparison?.ticker === market.ticker ? null : comparison} range={range} /></> : <div className="chart-empty"><strong>No price series for {selectedTicker}</strong><p>Configure a market data API key to load live prices for this ticker. The company’s SEC fundamentals are still shown below.</p></div>}
          </article>

          <aside className="panel stats-panel">
            <div className="panel-heading"><div><span className="section-label">Key stats</span><h3>At a glance</h3></div></div>
            <dl className="stats-list">
              <Stat label="Market cap" value={formatMoney(market?.marketCap ?? null)} />
              <Stat label="P/E ratio" value={market?.peRatio?.toFixed(1) ?? "—"} detail="Trailing" />
              <Stat label="EPS" value={market?.eps !== null && market?.eps !== undefined ? formatPrice(market.eps) : "—"} />
              <Stat label="52-week range" value={market?.low52Week && market.high52Week ? `${formatPrice(market.low52Week)} – ${formatPrice(market.high52Week)}` : "—"} />
              <Stat label="Volume" value={formatCompact(market?.volume ?? null)} detail={market?.averageVolume ? `${formatCompact(market.averageVolume)} average` : undefined} />
              <Stat label="Beta" value={market?.beta?.toFixed(2) ?? "—"} />
            </dl>
          </aside>
        </div>

        <section className="watchlist-panel" id="watchlist">
          <div><span className="section-label">Your watchlist</span><h3>Saved on this device</h3></div>
          <div className="watchlist-items">{watchlist.length ? watchlist.map((ticker) => <button type="button" className={ticker === selectedTicker ? "active" : ""} key={ticker} onClick={() => loadTicker(ticker)}><strong>{ticker}</strong><span>View snapshot →</span></button>) : <p>Add a stock above to keep it one click away.</p>}</div>
        </section>

        <div className="section-heading"><div><span className="section-label">Business fundamentals</span><h2>The numbers behind {snapshot.company.ticker}</h2></div><p>Latest annual figures normalized from SEC company facts{latestPeriod ? ` · year ended ${formatDate(latestPeriod)}` : ""}.</p></div>
        <div className="fundamental-grid">
          <article><span>Revenue</span><strong>{formatMoney(snapshot.metrics.revenue)}</strong><small className={tone(snapshot.metrics.revenueChange)}>{snapshot.metrics.revenueChange !== null && snapshot.metrics.revenueChange >= 0 ? "+" : ""}{formatPercent(snapshot.metrics.revenueChange)} YoY</small></article>
          <article><span>Net income</span><strong>{formatMoney(snapshot.metrics.netIncome)}</strong><small className={tone(snapshot.metrics.netIncomeChange)}>{snapshot.metrics.netIncomeChange !== null && snapshot.metrics.netIncomeChange >= 0 ? "+" : ""}{formatPercent(snapshot.metrics.netIncomeChange)} YoY</small></article>
          <article><span>Free cash flow</span><strong>{formatMoney(snapshot.metrics.freeCashFlow)}</strong><small>Operating cash less capex</small></article>
          <article><span>Profit margin</span><strong>{formatPercent(snapshot.metrics.profitMargin, true)}</strong><small>Net income ÷ revenue</small></article>
        </div>

        <div className="fundamentals-detail">
          <article className="panel performance-panel">
            <div className="panel-heading"><div><span className="section-label">Annual trend</span><h3>Revenue and net income</h3></div><div className="chart-legend"><span><i className="revenue-key" />Revenue</span><span><i className="income-key" />Net income</span></div></div>
            {snapshot.annuals.length ? <div className="bar-chart" role="img" aria-label="Annual revenue and net income for the last five fiscal years">{snapshot.annuals.map((item) => {
              const revenueHeight = Math.max(((item.revenue ?? 0) / maxRevenue) * 100, 3);
              const incomeHeight = Math.max(((item.netIncome ?? 0) / maxRevenue) * 100, 2);
              return <div className="bar-column" key={item.periodEnd}><div className="bar-value">{formatMoney(item.revenue)}</div><div className="bars"><div className="bar revenue-bar" style={{ height: `${revenueHeight}%` }} /><div className="bar income-bar" style={{ height: `${incomeHeight}%` }} /></div><span>{item.year}</span></div>;
            })}</div> : <div className="chart-empty"><strong>No normalized annual series</strong><p>This company may use financial concepts that need a custom mapping.</p></div>}
          </article>
          <aside className="panel health-panel"><div className="panel-heading"><div><span className="section-label">Financial health</span><h3>Balance-sheet check</h3></div></div><dl className="health-list"><Stat label="Total assets" value={formatMoney(snapshot.metrics.assets)} /><Stat label="Current ratio" value={snapshot.metrics.currentRatio?.toFixed(2) ?? "—"} /><Stat label="Liabilities / equity" value={snapshot.metrics.liabilitiesToEquity?.toFixed(2) ?? "—"} /></dl><p>Descriptive metrics only—not investment advice.</p></aside>
        </div>
      </section>

      <section className="methodology" id="methodology">
        <div><span className="section-label">Transparent by design</span><h2>Useful data.<br />Clear limits.</h2></div>
        <div className="method-grid">
          <article><span>01</span><h3>Market movement</h3><p>Live deployments can use Alpha Vantage daily prices. Without a key, StockSnap clearly labels its curated demo series.</p></article>
          <article><span>02</span><h3>SEC fundamentals</h3><p>Revenue, earnings, cash flow, and balance-sheet values come directly from SEC EDGAR company facts.</p></article>
          <article><span>03</span><h3>Private watchlist</h3><p>Your saved tickers stay in this browser. No account, tracking profile, or database is required.</p></article>
        </div>
      </section>

      <footer><a className="brand footer-brand" href="#top"><span className="brand-mark">S</span><span>StockSnap</span></a><p>Stock research at a glance. Not investment advice.</p><a href="https://www.sec.gov/edgar/sec-api-documentation" target="_blank" rel="noreferrer">Data documentation ↗</a></footer>
    </main>
  );
}
