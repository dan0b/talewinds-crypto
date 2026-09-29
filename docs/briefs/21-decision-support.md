# 21 — Decision support & process analytics

- **Phase:** V3 — Strategy-aware decisions
- **Status:** Draft
- **Depends on:** [14 Narratives & theses](14-narratives-and-theses.md),
  [20 Strategy framework](20-strategy-framework.md)
- **Written:** 2026-09-27
- **Build log:** —

> **Draft:** direction only. Refine in a planning session before building.

## Goal

Explainable, rule-based recommendations that combine research with your live exposure, plus
analytics that show whether your process is actually working.

## Scope

- **Recommendations:** apply a strategy version to a report plus your current portfolio. The output
  is an outcome (e.g. pass / watch / reject), a risk class, a size range, a maximum exposure, and
  entry/exit considerations. Every output traces back to the rules and data that produced it.
- An allocation-vs-limits view.
- Decisions and overrides recorded, with outcomes tracked later.
- **Process analytics:** rule adherence, thesis accuracy, performance by setup, and whether scores
  predict outcomes.
- **Advisory only.** Nothing in this step can trigger execution.

## Acceptance criteria

- [ ] Every recommendation can be reproduced from its (strategy version, data snapshot).
- [ ] No code path exists from a recommendation to execution (enforced by the boundary check).
- [ ] Analytics distinguish decision quality from outcome.
