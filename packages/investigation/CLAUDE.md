# packages/investigation

On-chain investigation: tracing where wallets got their funds, clustering related wallets, labeling
accounts, and analyzing the behavior of wallets that aren't mine. **Empty until V0b** (insider
analysis is its first consumer). Design:
[ADR 0012](../../docs/adr/0012-accounts-entities-ownership.md),
[ADR 0011](../../docs/adr/0011-research-scope.md).

## Planned capabilities

- **Insider analysis** for a token: snipers, bundled wallets, dev/deployer and insider wallets,
  funding-source clusters, holder concentration. Differs per chain family (Solana slots/Jito
  bundles vs EVM blocks/mempool).
- **Funding graph:** trace inbound funding for a set of wallets to find common sources.
- **Labels + entities:** attach labels (source, confidence, timestamp) and group accounts into
  entities (KOLs, clusters).
- **Tracked-wallet analytics (V2):** KOL buy feeds, strategy breakdowns of profitable wallets,
  big-holder activity per token.

## Rules

- **Analytics-grade, and labeled as such.** Approximations are fine here if they're marked
  approximate; this is not accounting.
- **Labels are claims, not facts:** every label has a source (manual / heuristic / `decide`), a
  confidence, and a timestamp, and revisions keep history.
- **Heuristics are named and explainable.** A "bundler" flag must say which rule fired and on what
  evidence (transactions, slots/blocks, funding links).
- **Store observed accounts lightly.** Insider scans touch thousands of addresses; don't sync full
  histories for `observed` accounts.
- **Reuse `sources` adapters and portfolio decoders.** Don't build a second ingestion path.
- **Read-only**, like everything outside execution.
