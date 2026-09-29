# docs/

The project's memory: why things are the way they are, what we're building next, and what was
built.

| Path | Contents |
|---|---|
| `VISION.md` | The platform vision, priorities, principles, open questions, ADR index |
| `ROADMAP.md` | Every step of the build, in order, with status and dependencies |
| `CONTEXT.md` | Glossary: the meaning of every domain term |
| `adr/` | One short record per decision: `NNNN-kebab-title.md` |
| `briefs/` | One brief per roadmap step: `NN-<slug>.md`, written *before* building |
| `build-logs/` | One per completed step: `YYYY-MM-DD-<slug>.md`, written *after* building |

## Rules

### Roadmap and briefs

- **Every roadmap step has exactly one brief**, named by its step number: `briefs/07-<slug>.md`.
  To insert a step between existing ones, use a letter suffix (`07a-<slug>.md`) rather than
  renumbering.
- **Brief header:** Phase, Status, Depends on, Written (date), Build log.
- **Brief body:** Goal, Why, Scope (In/Out), Approach notes (optional), Acceptance criteria (as a
  checklist), Open questions.
- **Statuses:** `Ready` (build now), `Planned` (refine details when starting), `Draft` (needs a
  planning session first; the brief carries a Draft banner), `✅ Done`.
- **Before building a step:** re-read its brief and resolve its open questions. If the scope
  changes, update the brief first. Draft steps get a planning session that turns them into Planned
  or Ready.
- **Keep `ROADMAP.md` and the briefs in sync:** status, title, and dependencies must match.

### Build logs

- Named `YYYY-MM-DD-<slug>.md`, with the build date and the **same slug as the brief**, so they pair
  up.
- **Format:** Summary, What was built, Deviations from the brief (and why), Verification performed,
  Known gaps, Next steps. Be honest: if something wasn't verified, say so.
- **When a step is done:** tick its acceptance criteria in the brief, set its status to `✅ Done` in
  the brief and in `ROADMAP.md`, and link the build log from the brief.

### ADRs

- **ADRs are append-only.** Never rewrite an accepted ADR's decision. To change it, write a new ADR
  that supersedes it and set the old one's status to `Superseded by NNNN`.
- **Format:** title, status, date, then Context / Decision / Consequences. Keep it short, one
  decision per ADR, and add it to the table in `VISION.md`.

### Everything else

- `briefs/original-concept-brief.md` is the original concept brief, kept for history. `VISION.md`
  and `ROADMAP.md` supersede it.
- Keep `CONTEXT.md` current: a term used in code or ADRs but missing from the glossary is a bug.
