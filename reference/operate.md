# operate — Work/Read depth rules

Not a verb you run — an **overlay**, auto-loaded with any verb when the surface mode is Work or Read (modes from SKILL.md). These surfaces answer a task or a text; ambition here means precision, not performance.

## 1. The earned-familiarity law

Strangeness without purpose is slop — and so is flatness. A dashboard that surprises wastes the user's working memory; a dashboard indistinguishable from every other dashboard serves nobody. The bar: **familiarity that's earned.** Every deviation from convention must carry a task-speed or comprehension argument; every convention kept is kept on purpose. Identity still lives here (mandate 2) — it spends on density, rhythm, and clarity, not theatrics.

## 2. The rules

- **One type family.** UI chrome speaks in one voice; hierarchy comes from size and weight, not font changes. (Work/Read is where a system stack is a legitimate choice, not a default-stack sin — the brief earns it. Contrast with `typeset.md`'s voice bar.)
- **Fixed rem scale, ratio 1.125–1.2.** Small steps, many stops — a working surface needs a 13px and a 15px more than a display step. Record the scale; no off-scale one-offs.
- **Restrained color, full state vocabulary.** Color carries meaning (semantic states, selection, focus), not mood. In exchange, every component ships in **ALL its states**: default, hover, active, focus-visible, disabled, loading, error, empty (craft-floor check 6). A Work surface is judged by its worst state.
- **Skeletons over spinners** where the content's shape is known — a spinner says "wait," a skeleton says "what's coming and roughly when." Spinners remain correct for indeterminate work with no known shape.
- **Motion 150–250ms, feedback only** (`animate.md`'s table; focal moments rarely apply here). Motion answers "did that work?" — it never entertains.
- **Density is a virtue.** Information per viewport is the point of these modes: tighter rows, aligned columns, tabular numerals, secondary info one glance away. Dense and calm — compress with rhythm, not with crowding (`quieter.md`'s mode split; `layout.md`'s rhythm law still governs). Never "simplify" a Work surface into emptiness (`distill.md` says so too).

## 3. Bans and permissions

| Banned (unless the brief names the reason) | Permitted (virtues here) |
|---|---|
| Decorative motion, ambient loops, entrance staggers | 150–250ms state transitions |
| Modal-first flows (a dialog as the default path for routine work) | Standard navigation: sidebar, tabs, breadcrumbs |
| Reinvented affordances (custom scrollbars-as-nav, novel menu geometry) | System fonts |
| Display fonts in UI chrome | Density, compact tables, dense toolbars |
| Gradient/glow accents on controls | Full keyboard paths, visible focus |

The ban column is craft-floor's refuse list specialized: on Work surfaces the cost of a banned move is paid in task time, not just taste.

## 4. What "operate-grade" looks like

The finished Work/Read surface: dense without noise, calm without blandness, states for everything, keyboard-complete, tabular numerals where numbers align, worst-case data handled without overflow. A power-user (Alex, `critique.md`) never reaches for the mouse; a first-timer (Jordan) never meets a mystery control.

## Verify

Every interactive element in all its states; keyboard path completes the core task; worst-case data fits (Riley's edge counts); reduced-motion path communicates every state; density earned its place — remove nothing the task needs, decorate nothing it doesn't.
