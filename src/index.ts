#!/usr/bin/env node
/**
 * usenami-funding-mcp
 * Multi-venue perpetual funding-rate data + cross-exchange funding arbitrage.
 *
 *  - funding_screener : FREE preview of current cross-venue funding (no wallet)
 *  - funding_arb      : flagship funding-arbitrage signal (paid, x402)
 *  - funding_spread   : per-symbol cross-venue funding spread (paid, x402)
 *
 * Paid tools settle in USDC on Base via x402. Set X402_PRIVATE_KEY (a Base
 * wallet holding USDC) and the paid tools auto-pay and return data. Without it,
 * paid tools return the x402 payment requirements so any x402-capable client
 * can pay and retry. The free screener never needs a wallet.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE = process.env.USENAMI_API_BASE ?? "https://api.usenami.io";
const PRIVATE_KEY = (process.env.X402_PRIVATE_KEY ?? "").trim();
const HAS_KEY = /^0x[0-9a-fA-F]{64}$/.test(PRIVATE_KEY);
const UA = "usenami-funding-mcp/0.2.0";
const TIMEOUT_MS = 30_000;

function asText(value: unknown) {
  return {
    content: [
      { type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) },
    ],
  };
}

// Plain GET — used for the free endpoint and as the no-wallet fallback.
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
      try {
        payment = await res.json();
      } catch {
        payment = await res.text().catch(() => null);
      }
      return { status: 402, payment };
    }
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = await res.text().catch(() => null);
    }
    return { status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

// Paid GET — auto-pays the x402 challenge with the configured Base wallet.
// viem + x402-fetch are lazy-imported so the free tool works without them.
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
    const res = await payFetch(`${BASE}${path}`, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`paid endpoint HTTP ${res.status} on ${path}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Resolve a paid endpoint: auto-pay if a wallet is configured, else surface x402 reqs.
async function paid(path: string, price: string) {
  if (HAS_KEY) {
    try {
      return asText(await payGet(path));
    } catch (e) {
      return asText(`x402 auto-pay failed for ${path}: ${(e as Error).message}`);
    }
  }
  const r = await plainGet(path);
  if (r.status === 402) {
    return asText(
      `This endpoint costs ~${price} USDC via x402 on Base. Set X402_PRIVATE_KEY ` +
        `(a Base wallet holding USDC) in this server's env to auto-pay, or pay ` +
        `${BASE}${path} with your own x402 client.\n\nPayment requirements:\n` +
        JSON.stringify(r.payment, null, 2)
    );
  }
  if (r.status >= 400) return asText(`Upstream error HTTP ${r.status} for ${path}`);
  return asText(r.data);
}

const server = new McpServer({ name: "usenami-funding-mcp", version: "0.2.0" });

server.tool(
  "funding_screener",
  "FREE preview of current cross-venue perpetual funding rates across 20+ exchanges " +
    "(Binance, Bybit, OKX, Hyperliquid, Aster, Lighter, and HIP-3 sub-DEXes). No wallet " +
    "required. Use it to scan where perpetual funding is richest right now.",
  { symbol: z.string().optional().describe("Optional ticker filter, e.g. 'BTC'") },
  async ({ symbol }) => {
    const path = `/v1/preview/funding-current${symbol ? `?symbol=${encodeURIComponent(symbol)}` : ""}`;
    const r = await plainGet(path);
    return r.status === 200 ? asText(r.data) : asText(`Preview unavailable (HTTP ${r.status}).`);
  }
);

server.tool(
  "funding_arb",
  "Cross-exchange funding-rate ARBITRAGE opportunities: ranked long-venue / short-venue pairs " +
    "by funding spread (delta-neutral) across 20+ venues — Usenami's flagship signal. PAID via " +
    "x402 (~$0.003 USDC on Base). Auto-pays if X402_PRIVATE_KEY is set; otherwise returns x402 payment requirements.",
  { symbol: z.string().optional().describe("Optional ticker filter, e.g. 'BTC'") },
  async ({ symbol }) =>
    paid(`/v1/perp/arbitrage/funding${symbol ? `?symbol=${encodeURIComponent(symbol)}` : ""}`, "$0.003")
);

server.tool(
  "funding_spread",
  "Current funding-rate spread for one symbol across all venues (min/max venue, basis). PAID via " +
    "x402 (~$0.001 USDC on Base). Auto-pays if X402_PRIVATE_KEY is set; otherwise returns x402 payment requirements.",
  { symbol: z.string().describe("Ticker, e.g. 'BTC'") },
  async ({ symbol }) => paid(`/v1/funding/spread/${encodeURIComponent(symbol)}`, "$0.001")
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`usenami-funding-mcp running on stdio (API: ${BASE}, x402 auto-pay: ${HAS_KEY ? "on" : "off"})`);
