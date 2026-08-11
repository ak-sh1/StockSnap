import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const serverPath = fileURLToPath(new URL("../.next/standalone/server.js", import.meta.url));
const port = 31_000 + (process.pid % 1_000);
let server;

async function startServer() {
  assert.equal(existsSync(serverPath), true, "Run `npm run build` before the rendered HTML test");
  server = spawn(process.execPath, [serverPath], {
    env: { ...process.env, HOSTNAME: "127.0.0.1", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Next.js exited before it was ready (${server.exitCode})`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok) return response;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw new Error("Next.js did not become ready within 20 seconds");
}

test("server-renders the StockSnap product", async () => {
  const response = await startServer();
  try {
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

    const html = await response.text();
    assert.match(html, /<title>StockSnap — Stock research at a glance<\/title>/i);
    assert.match(html, /Know the stock/);
    assert.match(html, /Price performance/);
    assert.match(html, /Your watchlist/);
    assert.match(html, /Business fundamentals/);
    assert.doesNotMatch(html, /Recent filings|FilingScope|codex-preview|react-loading-skeleton/i);

    const apiResponse = await fetch(`http://127.0.0.1:${port}/api/stock?ticker=AAPL`);
    assert.equal(apiResponse.status, 200);
    const snapshot = await apiResponse.json();
    assert.equal(snapshot.ticker, "AAPL");
    assert.equal(snapshot.mode, "demo");
  } finally {
    server.kill("SIGTERM");
    if (server.exitCode === null) await once(server, "exit");
  }
});
