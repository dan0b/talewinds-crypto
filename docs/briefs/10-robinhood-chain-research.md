# 10 — Robinhood Chain research

- **Phase:** V1 — Trust the numbers, deepen research
- **Status:** Planned
- **Depends on:** [03](03-quick-research-report.md), [04](04-insider-analysis-solana.md),
  [05](05-full-research-report.md)
- **Written:** 2026-09-27
- **Build log:** —

## Goal

Full research parity for Robinhood Chain tokens: quick and full reports, with EVM-specific security
checks and insider analysis. This is where the research pipeline matters most for you, since your
medium- and longer-term plays happen here ([ADR 0011](../adr/0011-research-scope.md)).

## Scope

**In**

- **Coverage spike first:** which free providers actually support chain 4663 (market data, security
  checks, holder data, explorer API)? Results go in the build log, and in an ADR if they change the
  approach.
- **EVM identity and security:** verified source, proxy/upgradeability, owner and admin privileges,
  mint/blacklist/pause functions, transfer taxes, and a honeypot check via a **simulated** buy/sell
  (`eth_call` with state overrides). The simulation is read-only and needs no keys, consistent with
  [ADR 0001](../adr/0001-execution-boundary.md).
- **Market:** pools and liquidity on Robinhood Chain DEXes.
- **Holders:** top holders and concentration (e.g. via the Blockscout API).
- **EVM insider analysis:** deployer funding trace, first-block buyers, same-block clusters, and
  supply held by contracts or deployer-linked wallets.
- Reuses the section framework (03), the investigation module (04), and the AI layer (05).

## Acceptance criteria

- [ ] A Robinhood Chain token produces both quick and full reports.
- [ ] Honeypot and transfer-tax detection work on known test cases.
- [ ] Coverage limits appear as explicit gaps.

## Open questions

- Does the chain's RPC support `eth_call` state overrides? If not, what's the fallback for sell
  simulation?
