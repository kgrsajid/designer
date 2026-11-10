# document — record the brand as DESIGN.md

DESIGN.md is the brand's record: what the identity **is**, extractable from what exists. This is the incumbent-brand entry point — run it before refinement work on any project with identity in code but no record.

Two modes:

## Scan mode (project has code)

**Asset discovery — 7 priorities, in order:**

1. **Tokens** — CSS custom properties, theme files, Tailwind config, design.json sidecars
2. **Typography** — font files/faces actually loaded, scale, weights, tracking, the type roles in use
3. **Color** — the real palette (used values, not every value), neutrals and their tint source, semantic colors (error/warn/success) and their contrast behavior
4. **Components** — the inventory: what exists, what's canonical, what's a one-off
5. **Imagery** — treatment (photography vs illustration vs none), masks, grain, borders
6. **Motion** — easings, durations, what animates and what deliberately doesn't
7. **Quirks** — anything distinctive that survives content removal: the thing a stranger would recognize

Evidence discipline: every extracted value cites where it came from (file:line). Used-value histograms beat config files when they disagree — the code is what ships.

**Extract → write `DESIGN.md`** (format below) → **two rounds of clarifying questions** (≤3 per round):
- Round 1: ambiguities the scan surfaced ("three blues ship — is one deprecated?")
- Round 2: one **creative-north-star** question ("in one line, what should this feel like when it's at its best?") and one **named-rules** question ("any rules the team enforces that code can't show?"). The answers become Named rules & exceptions.

**Generate `.designer/design.json` sidecar:** tokens, type scale, component inventory — the machine-readable twin the detector's design-system rules read. It also carries the **utility-class expansion map** (class prefix → token, e.g. `bg-blue-500` → `{color.brand.primary}`) so brand-drift rules work on utility-class projects where values arrive as classes instead of literals.

## Seed mode (no code yet)

Record the chosen direction with its open questions marked. No sidecar until real code exists — a sidecar derived from a mood board is fiction. Hand visual-world invention to `new-work` (M4); this file only records.

## DESIGN.md format

```markdown
<!-- designer:design-schema 1 -->
---
tokens:
  color: { primary: "#…", surface: "#…", text: "#…" }   # small sets only
  typography: { display: "…", body: "…", base: "16px" }
  radius: { md: "8px" }
  spacing: { base: "4px" }
  # token refs like {color.primary} where values reference each other
---

# DESIGN.md — <product> identity

## Identity           # the north-star line + what a stranger should recognize
## Color              # palette + roles + neutrals + tint source
## Typography         # voices, scale, weights, the floor and ceiling
## Spacing & layout   # base unit, rhythm, grid if any
## Components         # canonical patterns and their rules
## Motion             # what moves, what never does, the focal-moment budget
## Imagery & iconography
## Named rules & exceptions   # team laws code can't show; earned exceptions
```

Interops with Google's `design.md` convention where cheap — a well-known shape costs nothing.

## Conflict rule (baked in)

Code and record disagree → **intentional change updates the record; accidental drift fixes the code.** When you cannot tell which, say so explicitly and pick the safer read (code wins for what ships; record wins for what's pinned in Named rules). Never silently harmonize.

## Laws

- **Refinement preserves, redesign replaces** (mandate 2): recording identity is not permission to change it. document never edits UI.
- DESIGN.md records; it doesn't legislate taste beyond what exists. Named rules are the only forward-looking section.
- The sidecar is derived data — regenerate it, never hand-tune it into an art file.
