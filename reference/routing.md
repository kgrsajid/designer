# routing — the no-argument menu

Bare `designer` (or "what should I do next?") lands here. The job: read project state, then **lead with 2–3 pointed picks, each with a one-line reason**. Never auto-run a verb — a menu that acts is a menu that guesses.

## Read the state first

Run `node scripts/context.mjs` (and `--trend` when critique snapshots exist). You get: context files + stamps, platform, last critique score + age, git-dirty UI files, detector presence. Dev-server state is **supplied by the orchestrator, never probed** — ask the user or use what they told you.

## The picks (heuristics)

| State seen | Lead pick | Why (the one-liner) |
|---|---|---|
| Code but no DESIGN.md | `document` | The brand lives in code; make it a record before it drifts |
| No PRODUCT.md, new surface work | `init` | Nothing to design *for* yet |
| Never critiqued (no snapshots) | `critique` | Can't improve what's never been measured |
| Critique exists, score low or stale, open backlog | `polish` | It reads the snapshot as its backlog — cheapest path to closing P0s |
| Git-dirty UI files | scoped `audit` or `polish` on the dirty surfaces | The change is in flight — review it while it's cheap |
| Audit shows integrity issues | fix via the suggested verbs (audit's recommended sequence) | Integrity before decoration |
| Snapshot trend shows a *dropping* score | call it out before any pick | Regressions outrank features |
| Greenfield / rebrand ask | `new-work` *(lands M4)* | Identity work has its own machinery |

Then the grouped commands table (copy from SKILL.md — that table is the single source for verb descriptions). Order: what you recommend first, then foundation, review, refine, steer.

## Rules

- **2–3 picks.** Five options is a wall of options (we critique that pattern — don't build it).
- **Never lead web-only verbs on native projects** (platform comes from PRODUCT.md/state).
- If state says a run is degraded or the tooling is missing (`context.mjs` absent in early milestones), say so and route on what the user has told you instead.
- Routing is advisory. If the user names a verb, the verb wins (mandate 1 — the brief wins).
