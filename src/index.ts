#!/usr/bin/env node
/**
 * usenami-funding-mcp — multi-venue perpetual + HIP-3 market data for AI agents.
 *
 * FREE: funding_screener.
 * PAID (x402, USDC on Base): funding (arb/spread/history), liquidity/slippage,
 * open interest (+delta), volume (+anomalies), oracle families, RWA/HIP-3 coverage.
 *
 * Set X402_PRIVATE_KEY (a Base wallet holding USDC) and paid tools auto-pay and
 * return data; without it they return the x402 payment requirements so any
 * x402-capable client can pay and retry. The free screener needs no wallet.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE = process.env.USENAMI_API_BASE ?? "https://api.usenami.io";
const PRIVATE_KEY = (process.env.X402_PRIVATE_KEY ?? "").trim();
const HAS_KEY = /^0x[0-9a-fA-F]{64}$/.test(PRIVATE_KEY);
const UA = "usenami-funding-mcp/0.3.0";
const TIMEOUT_MS = 30_000;

function asText(value: unknown) {
  return {
    content: [
      { type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) },
    ],
  };
}

function qs(params: Record<string, string | number | undefined>) {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

async function plainGet(path: string): Promise<{ status: number; data?: unknown; payment?: unknown }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (res.status === 402) {
      let payment: unknown = null;
      try { payment = await res.json(); } catch { payment = await res.text().catch(() => null); }
      return { status: 402, payment };
    }
    let data: unknown = null;
    try { data = await res.json(); } catch { data = await res.text().catch(() => null); }
    return { status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

async function payGet(path: string): Promise<unknown> {
  const { createWalletClient, http } = await import("viem");
  const { base } = await import("viem/chains");
  const { privateKeyToAccount } = await import("viem/accounts");
  const { wrapFetchWithPayment } = await import("x402-fetch");
  const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);
  const walletClient = createWalletClient({ account, chain: base, transport: http() });
  const payFetch = wrapFetchWithPayment(fetch, walletClient as never);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await payFetch(`${BASE}${path}`, { headers: { Accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`paid endpoint HTTP ${res.status} on ${path}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function paid(path: string, price: string) {
  if (HAS_KEY) {
    try { return asText(await payGet(path)); }
    catch (e) { return asText(`x402 auto-pay failed for ${path}: ${(e as Error).message}`); }
  }
  const r = await plainGet(path);
  if (r.status === 402) {
    return asText(
      `This endpoint costs ~${price} USDC via x402 on Base. Set X402_PRIVATE_KEY (a Base wallet ` +
        `holding USDC) in this server's env to auto-pay, or pay ${BASE}${path} with your own x402 client.\n\n` +
        `Payment requirements:\n${JSON.stringify(r.payment, null, 2)}`
    );
  }
  if (r.status >= 400) return asText(`Upstream error HTTP ${r.status} for ${path}`);
  return asText(r.data);
}

const server = new McpServer({ name: "usenami-funding-mcp", version: "0.3.0" });

// ── FREE ──────────────────────────────────────────────────────────────────
server.tool(
  "funding_screener",
  "FREE preview of current cross-venue perpetual funding rates across 20+ exchanges " +
    "(Binance, Bybit, OKX, Hyperliquid, Aster, Lighter, HIP-3 sub-DEXes). No wallet required.",
  { symbol: z.string().optional().describe("Optional ticker filter, e.g. 'BTC'") },
  async ({ symbol }) => {
    const r = await plainGet(`/v1/preview/funding-current${qs({ symbol })}`);
    return r.status === 200 ? asText(r.data) : asText(`Preview unavailable (HTTP ${r.status}).`);
  }
);

// ── FUNDING (paid) ──────────────────────────────────────────────────────────
server.tool(
  "funding_arb",
  "Cross-exchange funding-rate ARBITRAGE candidates: ranked long/short venue pairs by funding " +
    "spread (delta-neutral) across 20+ venues. Naive scan — excludes fees/latency/execution timing. " +
    "PAID ~$0.003 via x402.",
  {
    min_diff: z.number().optional().describe("Minimum funding-rate diff to include (API default if omitted)"),
    limit: z.number().optional().describe("Max rows returned"),
  },
  async ({ min_diff, limit }) => paid(`/v1/perp/arbitrage/funding${qs({ min_diff, limit })}`, "$0.003")
);

server.tool(
  "funding_spread",
  "Current funding-rate spread for one symbol across all venues (min/max venue, basis). PAID ~$0.001 via x402.",
  { symbol: z.string().describe("Ticker, e.g. 'BTC'") },
  async ({ symbol }) => paid(`/v1/funding/spread/${encodeURIComponent(symbol)}`, "$0.001")
);

server.tool(
  "funding_history",
  "Historical funding rates for a symbol across venues (for backtesting/analysis). PAID ~$0.005 via x402.",
  {
    ticker: z.string().describe("Ticker, e.g. 'BTC'"),
    aggr: z.enum(["1h", "4h", "1d"]).optional().describe("Bucket size (default 1h)"),
    from: z.string().optional().describe("ISO start time (optional)"),
    to: z.string().optional().describe("ISO end time (optional)"),
  },
  async ({ ticker, aggr, from, to }) => paid(`/v1/funding/historical${qs({ ticker, aggr, from, to })}`, "$0.005")
);

// ── LIQUIDITY / EXECUTION (paid) ────────────────────────────────────────────
server.tool(
  "orderbook_slippage",
  "Multi-venue execution cost / slippage for a trade size — where a ticker is cheapest to execute " +
    "across venues. PAID ~$0.005 via x402.",
  {
    ticker: z.string().describe("Ticker, e.g. 'BTC'"),
    size_usd: z.enum(["1000", "5000", "10000"]).optional().describe("Trade size USD (default 10000)"),
  },
  async ({ ticker, size_usd }) => paid(`/v1/orderbook/multi-venue-slippage${qs({ ticker, size_usd })}`, "$0.005")
);

// ── POSITIONING (paid) ──────────────────────────────────────────────────────
server.tool(
  "open_interest",
  "Current open interest for a ticker on a venue. PAID ~$0.001 via x402.",
  { venue: z.string().describe("Venue, e.g. 'binance'"), ticker: z.string().describe("Ticker, e.g. 'BTC'") },
  async ({ venue, ticker }) => paid(`/v1/perp/open-interest${qs({ venue, ticker })}`, "$0.001")
);

server.tool(
  "oi_delta",
  "Open-interest change over a lookback window for a ticker on a venue (positioning shifts). PAID ~$0.003 via x402.",
  {
    ticker: z.string().describe("Ticker"),
    venue: z.string().describe("Venue"),
    lookback_hours: z.number().optional().describe("1-168, default 24"),
  },
  async ({ ticker, venue, lookback_hours }) => paid(`/v1/perp/oi-delta${qs({ ticker, venue, lookback_hours })}`, "$0.003")
);

// ── FLOW (paid) ─────────────────────────────────────────────────────────────
server.tool(
  "volume_24h",
  "24h perpetual volume for a ticker on a venue. PAID ~$0.001 via x402.",
  { venue: z.string().describe("Venue"), ticker: z.string().describe("Ticker") },
  async ({ venue, ticker }) => paid(`/v1/perp/volume-24h${qs({ venue, ticker })}`, "$0.001")
);

server.tool(
  "volume_anomalies",
  "Tickers showing anomalous volume spikes across venues (flow detection). PAID ~$0.003 via x402.",
  {
    lookback_hours: z.number().optional().describe("Default 24"),
    min_multiplier: z.number().optional().describe("Spike threshold vs baseline (default 2.0)"),
    limit: z.number().optional().describe("Default 50"),
  },
  async ({ lookback_hours, min_multiplier, limit }) =>
    paid(`/v1/perp/volume-anomalies${qs({ lookback_hours, min_multiplier, limit })}`, "$0.003")
);

// ── BASIS (paid) ────────────────────────────────────────────────────────────
server.tool(
  "oracle_families",
  "Oracle-family grouping across venues (which venues share an oracle → basis-risk map). PAID ~$0.001 via x402.",
  {},
  async () => paid(`/v1/perp/oracle-families`, "$0.001")
);

// ── RWA / HIP-3 (paid) — the differentiator ────────────────────────────────
server.tool(
  "rwa_coverage",
  "Hyperliquid HIP-3 RWA perpetual coverage — stocks, metals, oil, forex, indices, pre-IPO synthetics " +
    "that CoinGecko/CMC/Coinglass do not aggregate. PAID ~$0.001 via x402.",
  { asset_class: z.enum(["metal", "stock", "forex", "commodity", "index", "pre_ipo"]).optional().describe("Filter by RWA class") },
  async ({ asset_class }) => paid(`/v1/rwa/perp-coverage${qs({ asset_class })}`, "$0.001")
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`usenami-funding-mcp v0.3.0 on stdio (API: ${BASE}, x402 auto-pay: ${HAS_KEY ? "on" : "off"})`);
