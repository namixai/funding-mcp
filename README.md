# @usenami/funding-mcp

MCP server for **multi-venue perpetual + HIP-3 market data** — 20+ exchanges including Binance, Bybit, OKX, Hyperliquid, Aster, Lighter, and **Hyperliquid HIP-3 sub-DEXes** (stocks, metals, oil, forex, indices, pre-IPO synthetics) that CoinGecko / CMC / Coinglass don't aggregate.

Gives any MCP-capable AI agent a named, schema'd surface for funding, liquidity, positioning, flow, basis, and RWA data — backed by [Usenami](https://usenami.io)'s live API. Pairs with [`@usenami/signer-mcp`](https://github.com/namixai/signer-mcp) for keyless execution.

## Tools

| Tool | What it does | Cost |
|------|--------------|------|
| `funding_screener` | Current cross-venue funding rates (preview) | **Free** |
| `funding_arb` | Ranked cross-exchange funding-arb candidates | ~$0.003 |
| `funding_signal` | **Decision-ready** funding-arb signal: net-of-fees + breakeven + depth-sized max notional + liquidity flag | ~$0.025 |
| `funding_spread` | Per-symbol funding spread across venues | ~$0.001 |
| `funding_history` | Historical funding rates (backtesting) | ~$0.005 |
| `orderbook_slippage` | Multi-venue execution cost / slippage | ~$0.005 |
| `open_interest` | Current OI for ticker on venue | ~$0.001 |
| `oi_delta` | OI change over a lookback window | ~$0.003 |
| `volume_24h` | 24h perp volume for ticker on venue | ~$0.001 |
| `volume_anomalies` | Anomalous volume spikes across venues | ~$0.003 |
| `oracle_families` | Oracle-family / basis-risk map | ~$0.001 |
| `rwa_coverage` | **HIP-3 RWA** coverage (stocks/metals/oil) | ~$0.001 |

Paid tools settle in USDC on Base via the [x402 protocol](https://x402.org). Set `X402_PRIVATE_KEY` (a Base wallet holding USDC) and the paid tools **auto-pay** and return data; without it they return the x402 payment requirements so any x402-capable client can pay and retry. `funding_screener` is free and needs no wallet.

> Note: `funding_arb` is a naive scan (excludes fees, latency, and execution timing) — treat it as a candidate list, not trade advice.

## Install

```jsonc
{
  "mcpServers": {
    "usenami-funding": {
      "command": "npx",
      "args": ["-y", "@usenami/funding-mcp"]
    }
  }
}
```

Optional env: `USENAMI_API_BASE` (default `https://api.usenami.io`); `X402_PRIVATE_KEY` (Base wallet `0x…` with USDC — enables built-in auto-pay for the paid tools).

## Support

Hit a problem or want data we don't cover yet? **Report issues / request data:** [support@usenami.io](mailto:support@usenami.io) · Partnerships: [business@usenami.io](mailto:business@usenami.io) · Telegram: [@USnami](https://t.me/USnami).

## Local dev

```bash
npm install
npm run build
npm start
```

MIT · [usenami.io](https://usenami.io)
