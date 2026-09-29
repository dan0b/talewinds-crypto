# 04 — Insider analysis: Solana

- **Phase:** V0b — Contract address → research report
- **Status:** Ready
- **Depends on:** [03 Quick research report](03-quick-research-report.md)
- **Written:** 2026-09-27
- **Build log:** —

## Goal

Solana reports gain an **insiders** section: who launched the token, who got in first, which
wallets are really one group, and how much of the supply they still control. Every flag is backed
by evidence.

## Why

This is the core value of the research pipeline ([ADR 0011](../adr/0011-research-scope.md)): the
checks you'd otherwise do by hand, and which a general chatbot can't do. It's also the first
capability of `packages/investigation`, which later powers wallet tracking (16–17).

## Scope

**In**

- **Launch reconstruction:** the creation transaction, the deployer/creator wallet, the launch
  venue (e.g. a bonding-curve launchpad vs a direct pool), and the first trading slots.
- **Early buyers:** wallets that bought in the first slots or minutes, groups of buys in the same
  slot, and bundle indicators (e.g. same-slot buys with shared tip payments or shared funders).
- **Funding trace:** follow inbound SOL funding for the deployer and early buyers a bounded number
  of hops back, to find common funders and form clusters.
- **Current state:** how much supply the deployer, snipers, and clusters still hold, and how much
  they've sold.
- **Labels:** a `labels` table (account, label, source = `heuristic`, confidence, evidence,
  created_at; revisions are append-only). Wallets touched are stored as `observed` accounts: refs
  and labels only.
- **Explainable heuristics:** every flag names the rule that fired and links to its evidence
  (transaction signatures, slots).
- **Report section:** share of supply held by flagged clusters, deployer holdings and behavior,
  sniper count and what they still hold, and bundle suspicion, with explorer links.
- **Budget:** hard limits on hops, wallets, and requests per report. Hitting a limit marks the
  section *partial*, not failed.

**Out**

- Robinhood Chain / EVM insider analysis (10); tracked-wallet features (16–17); AI scoring of flags
  (can be added through `decide` after 05).

## Acceptance criteria

- [ ] On hand-picked known cases (a bundled launch and a clean one), the section flags the bundle
      or cluster with evidence, and doesn't raise false alarms on the clean launch (or reports low
      confidence).
- [ ] Every flag shows its rule and links to its evidence transactions.
- [ ] Analysis stays within the configured request budget, and partial results are marked partial.
- [ ] Labels persist across reports: a wallet flagged in one report shows its label in another.

## Open questions

- Test cases: do you have tokens you *know* were bundled or insider-heavy, plus some clean ones, to
  use as fixtures?
- Which launch venues should be supported first?
- Funding-trace depth (proposal: 2 hops, with a cap on wallets per hop).
