# @usenami/funding-mcp

MCP server for **multi-venue perpetual funding-rate data and cross-exchange funding arbitrage** — 20+ exchanges including Binance, Bybit, OKX, Hyperliquid, Aster, Lighter, and HIP-3 sub-DEXes that other aggregators don't cover.

Gives any MCP-capable AI agent a named, schema'd way to find where perpetual funding is richest and where delta-neutral funding-arbitrage spreads exist — backed by [Usenami](https://usenami.io)'s live market-data API.

## Tools

| Tool | What it does | Cost |
|------|--------------|------|
| `funding_screener` | Current cross-venue funding rates (preview slice) | **Free** |
| `funding_arb` | Ranked cross-exchange funding-arbitrage pairs (flagship) | ~$0.003 via x402 |
| `funding_spread` | Per-symbol funding spread across all venues | ~$0.001 via x402 |

Paid tools settle in USDC on Base via the [x402 protocol](https://x402.org). If your client has an x402 wallet (e.g. Coinbase `payments-mcp` or `x402-fetch`) it pays automatically; otherwise the tool returns the payment requirements so your agent can pay and retry. `funding_screener` is free and needs no wallet.

## Install

```jsonc
// Claude Desktop / any MCP client config
{
  "mcpServers": {
    "usenami-funding": {
      "command": "npx",
      "args": ["-y", "@usenami/funding-mcp"]
    }
  }
}
```

Optional env: `USENAMI_API_BASE` (defaults to `https://api.usenami.io`).

## Why

Funding-rate data is consumed continuously by trading agents — Usenami aggregates the widest venue set (incl. HIP-3) into one feed. This server is the agent-native front door to it.

## Local dev

```bash
npm install
npm run build
npm start
```

MIT · [usenami.io](https://usenami.io)
