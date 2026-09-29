# Talewinds

A personal crypto platform: every position across wallets, chains, and venues; automated token
research; on-chain investigation; and, later, agentic trading.

- **Why and what:** [`docs/VISION.md`](docs/VISION.md)
- **The build plan (one brief per step):** [`docs/ROADMAP.md`](docs/ROADMAP.md)
- **Vocabulary:** [`docs/CONTEXT.md`](docs/CONTEXT.md)
- **Decisions:** [`docs/adr/`](docs/adr/)
- **Working in the repo (humans and Claude):** [`CLAUDE.md`](CLAUDE.md)

## Prerequisites

- Node 24+
- pnpm 12 — `npm install -g pnpm@12` (corepack can't install pnpm 12)
- Docker (for Postgres)

## Getting started

```sh
pnpm install
cp .env.example .env
pnpm dev            # Postgres + migrations + api + worker + dashboard
```

Open http://localhost:5173. The **System** page should show the API, database, and worker as
healthy.

Register your accounts:

```sh
pnpm tw account add 0xYourAddress --chain robinhood --label trading
pnpm tw account add YourSolanaAddress --chain solana
pnpm tw account add 0xYourAddress --venue hyperliquid
pnpm tw account add --venue coinbase --label main
pnpm tw account list
```

## Everyday commands

| Command | What it does |
|---|---|
| `pnpm dev` | Run everything locally |
| `pnpm check` | Lint + boundaries + typecheck + tests |
| `pnpm tw --help` | Operations CLI |
| `pnpm tw status` | Database and worker health |
| `pnpm tw ping` | Round-trip a job through the queue |
| `pnpm db:generate` | Create a migration after a schema change |
| `pnpm db:down` | Stop Postgres (data is kept in a Docker volume) |
