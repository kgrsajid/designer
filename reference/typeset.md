# typeset — type system and text craft

The verb for the type layer alone: give the surface a real voice, a role system, and line-by-line care — without touching anything else. Type is 80% of perceived design; it is also where model defaults rot first (the default-stack reflex — see the model blocks in `craft-floor.md`).

## 1. Two assessments, isolated — before editing anything

Judge first, measure second. Never the reverse (anchoring law from `critique.md`).

**A — Typographic Q&A.** Answer from the code with file/selector evidence, not impressions:
- What typefaces actually load? (families, weights, axes — grep the imports and `font-family` stacks)
- What is the de facto role system? (how many sizes, weights, and voices exist — and which are doing the same job twice)
- Where does each text role live: display, headings, body, labels, meta?
- What is the longest line the user will read? The worst-case line, not the lorem line.

**B — Detector pass.** Then run the source rules over the surface's files:

```
node scripts/detect.mjs <files>
node scripts/detect.mjs --scope=css <stylesheets>   # type rules mostly live here
```

Type-relevant rules to triage (`reference/triage.md`): `tiny-text`, `undersized-ui-text`, `tight-leading`, `line-length`, `wide-tracking`, `extreme-negative-tracking`, `all-caps-body`, `justified-text`, `label-line-height`, `skipped-heading`, `overused-font`, `flat-type-hierarchy`, and the sidecar-gated `design-system-font` / `design-system-font-size`. Rag, balance, and real-size heading rhythm (`unbalanced-heading`, `straggler`, `heading-rhythm`) are rendered-only — check them in the browser, not in source.

## 2. Establish the role system before any edit

Every surface gets five roles, no more, each with exactly one face:

| Role | Job | Typical treatment |
|---|---|---|
| Display | the surface's one shout | largest step, committed weight, tight tracking (floor −0.04em) |
| Heading | hierarchy and wayfinding | 1.25×+ steps apart (flat steps are the measured GLM tell) |
| Body | reading | 65–75ch measure, line-height 1.5–1.7 |
| Label | control/UI text | medium weight, sentence case, line-height ≥1.3 |
| Meta | timestamps, counts, provenance | smallest step, tinted neutral, never the star |

If two roles share a size and weight, they are one role. Merge or split — don't blur.

## 3. Measure and line

- Body measure 65–75ch (craft-floor check 4). Auxiliary columns and sidebars may go 45–60ch — below 45 even short text feels chopped.
- Line-height and size move together: display tighter (1.05–1.2), body looser (1.5–1.7), labels never below 1.3.
- **Dark surfaces need compensation.** Light-on-dark reads thinner and tighter: bump line-height a step, add ~0.01–0.02em tracking on small text, step weight up one notch. Same tokens as light mode, adjusted values.

## 4. Line-break care

- **Headings balance.** A two-line heading should break at meaning, not mid-phrase (`text-wrap: balance` where supported; rendered rule `unbalanced-heading`).
- **The longest line decides rag quality.** Judge a paragraph's rag by its worst line — one 12-word straggler under three 4-word lines ruins the block. Reword before you re-style; `straggler` catches this rendered.
- No orphans in critical headings; no widowed labels under inputs.

## 5. A real voice

The measured default-stack reflex (`-apple-system…Roboto…` everywhere) is the anti-pattern — a surface with zero typographic voice (model blocks in `craft-floor.md`). On Work/Read surfaces a system stack can be *earned* by the brief (`operate.md` permits it); everywhere else the identity needs a face: one display voice with conviction, or a body face with actual character, spent once and reused. Mandate 2 runs both ways: a new font must belong to the identity in DESIGN.md — never a import-flavored costume change.

## Avoid-list (typography is not…)

- **Not a font pile.** Three or more families is a voice problem, not a richness win.
- **Not size-stacking.** Weight and size are not interchangeable; don't fake hierarchy with bold-everything.
- **Not letterspacing flavor.** Wide tracking is a label tool, not a body treatment; extreme negative tracking is a display-only move.
- **Not justified.** Justified text without hyphenation is a river generator (`justified-text`).

## Verify

Rendered check at shipping sizes: measure holds at 390px and 1440px, headings break at meaning, rag survives worst-case copy (longest real line, not the demo line), dark-surface text still clears 4.5:1 after compensation. Detector clean or triaged. Then stop — typeset touches type, and resists the itch to redesign around it (mandate 2).
