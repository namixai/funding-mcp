#!/usr/bin/env node
/**
 * usenami-funding-mcp
 * MCP server exposing Usenami's multi-venue perpetual funding-rate data and
 * cross-exchange funding-arbitrage signal as named tools, so AI agents can
 * discover and use it from MCP registries.
 *
 * - funding_screener : FREE preview of current cross-venue funding (the hook)
 * - funding_arb      : flagship funding-arbitrage signal (paid via x402)
 * - funding_spread   : per-symbol cross-venue funding spread (paid via x402)
 *
 * Paid tools call our x402 endpoints (USDC on Base). If the calling client has
 * an x402 wallet it pays automatically; otherwise the tool returns the x402
 * payment requirements so the agent can pay and retry.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE = process.env.USENAMI_API_BASE ?? "https://api.usenami.io";
const UA = "usenami-funding-mcp/0.1.0";

type Fetched = { status: number; data?: unknown; payment?: unknown };

async function get(path: string): Promise<Fetched> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
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
}

function text(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function paidResult(path: string, r: Fetched, price: string) {
  if (r.status === 402) {
    return text(
      `This endpoint requires payment via the x402 protocol (~${price} USDC on Base).\n` +
        `If your client has an x402 wallet (e.g. Coinbase payments-mcp or x402-fetch), pay and GET:\n` +
        `  ${BASE}${path}\n\nx402 payment requirements:\n${JSON.stringify(r.payment, null, 2)}`
    );
  }
  if (r.status >= 400) return text(`Upstream error HTTP ${r.status} for ${path}`);
  return text(r.data);
}

const server = new McpServer({ name: "usenami-funding-mcp", version: "0.1.0" });

server.tool(
  "funding_screener",
  "FREE preview of current cross-venue perpetual funding rates across 20+ exchanges " +
    "(Binance, Bybit, OKX, Hyperliquid, Aster, Lighter, and HIP-3 sub-DEXes). A teaser " +
    "slice of Usenami's funding dataset — no payment required. Use it to scan where " +
    "perpetual funding is richest right now.",
  { symbol: z.string().optional().describe("Optional ticker filter, e.g. 'BTC'") },
  async ({ symbol }) => {
    const path = `/v1/preview/funding-current${symbol ? `?symbol=${encodeURIComponent(symbol)}` : ""}`;
    const r = await get(path);
    return r.status === 200 ? text(r.data) : text(`Preview unavailable (HTTP ${r.status}).`);
  }
);

server.tool(
  "funding_arb",
  "Cross-exchange funding-rate ARBITRAGE opportunities: ranked long-venue / short-venue " +
    "pairs by funding spread (delta-neutral). Usenami's flagship signal across 20+ venues. " +
    "PAID via x402 (~$0.003/call, USDC on Base). If your client has an x402 wallet it pays " +
    "automatically; otherwise this returns the x402 payment requirements.",
  { symbol: z.string().optional().describe("Optional ticker filter, e.g. 'BTC'") },
  async ({ symbol }) => {
    const path = `/v1/perp/arbitrage/funding${symbol ? `?symbol=${encodeURIComponent(symbol)}` : ""}`;
    return paidResult(path, await get(path), "$0.003");
  }
);

server.tool(
  "funding_spread",
  "Current funding-rate spread for one symbol across all venues (min/max venue, basis). " +
    "PAID via x402 (~$0.001/call, USDC on Base). Returns x402 payment requirements if your " +
    "client cannot pay directly.",
  { symbol: z.string().describe("Ticker, e.g. 'BTC'") },
  async ({ symbol }) => {
    const path = `/v1/funding/spread/${encodeURIComponent(symbol)}`;
    return paidResult(path, await get(path), "$0.001");
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`usenami-funding-mcp running on stdio (API base: ${BASE})`);
