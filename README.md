# FilingScope

FilingScope turns raw SEC filings into a focused public-company fundamentals dashboard. It shows five-year financial trends, core ratios, recent filings, and Treasury-rate context without pretending to be a trading terminal.

![FilingScope dashboard](public/og.png)

## Why this project exists

Financial datasets are deceptively difficult: filings arrive after reporting periods, companies revise prior values, identifiers change, and the same fact can appear more than once. FilingScope keeps the source filing and availability date attached to every value so historical queries do not accidentally use future information.

## What users can do

- Search 12 widely followed US public companies
- Compare five years of revenue, net income, and free cash flow
- Review profitability, liquidity, and leverage ratios
- Open recent 10-K, 10-Q, and 8-K filings at the SEC
- View current 10-Year Treasury rate context
- Query data as it was available on a historical date through the API

## Architecture

```text
SEC EDGAR ─────────┐
                   ├── Python FastAPI ── normalized JSON API
FRED ──────────────┘          │
                              ▼
                       FilingScope web UI
                              ▲
                              │
                 built-in edge API fallback
```

The Python service is the primary portfolio backend. The frontend includes equivalent read-only edge routes so a public demo remains usable when it is deployed independently.

## Technology

- Python, FastAPI, HTTPX, pytest
- TypeScript, React, vinext
- SEC EDGAR Company Facts and Submissions APIs
- Federal Reserve Economic Data (FRED)
- Docker and GitHub Actions

## Run locally

### Docker

Copy `.env.example` to `.env`, replace the SEC user-agent value with your name and email, then run:

```bash
docker compose up --build
```

Open `http://localhost:3000`. Interactive API documentation is available at `http://localhost:8000/docs`.

### Without Docker

Backend:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn backend.app.main:app --reload
```

Frontend, in another terminal:

```bash
npm install
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000 npm run dev
```

## API

```http
GET /api/companies
GET /api/company?ticker=AAPL
GET /api/company?ticker=AAPL&as_of=2024-06-30
GET /api/macro
GET /api/health
```

The `as_of` parameter excludes facts and filings published after that date. This is the foundation for point-in-time-correct financial analysis.

## Verification

```bash
pytest
npm test
```

The test suite checks point-in-time filtering, financial normalization, and server-rendered product content. GitHub Actions runs both Python and frontend checks on every pull request.

## Deployment

Both applications are containerized. Deploy the root `Dockerfile` as the API and set:

```text
SEC_USER_AGENT="Your Name your.email@example.com"
ALLOWED_ORIGINS="https://your-frontend.example.com"
```

Deploy the frontend with `Dockerfile.web` and provide the API URL as the build argument `NEXT_PUBLIC_API_BASE_URL`. The frontend can also be deployed by itself; it will use its built-in edge endpoints.

## Data policy

FilingScope uses public SEC and Federal Reserve data and caches upstream responses for six hours. The SEC asks automated clients to identify themselves and stay below its published request limit. Do not remove the user-agent configuration or use this repository to redistribute data from a provider whose license forbids it.

This project is educational and does not provide investment advice.

## License

[MIT](LICENSE)
