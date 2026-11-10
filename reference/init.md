# init — set up PRODUCT.md

PRODUCT.md is what the product **is**: audience, goals, platform, constraints, terminology. It never carries aesthetics — visuals live in DESIGN.md and in code.

## Steps

1. **Load project state.** `PRODUCT.md` present with a valid stamp? Then confirm what changed and update in place — do not re-interview from scratch.
2. **Read the repo as evidence.** Package manifests, routes, existing copy, README, naming. Every inference gets labeled `inferred` — never launder a guess into a fact.
3. **Interview the user in rounds of ≤3 questions.** Never a questionnaire dump. Start with the gaps the code couldn't answer. In unattended runs: ask once; if no answer arrives, write the file with inferred facts labeled and continue.
4. **Write `PRODUCT.md`** per the schema below, stamped `<!-- designer:product-schema 1 -->`.
5. **Record project workflow defaults** in `.designer/config.json` (detector ignore defaults, preferred audit scopes). Never a build-path concept — this skill does not own your build.
6. **Resume the original task.** init is setup, not the job.

## PRODUCT.md schema

Stamp every file: `<!-- designer:product-schema 1 -->` on the first line.

```markdown
<!-- designer:product-schema 1 -->
# PRODUCT.md

## Audience
Concrete situations, not demographics. "Ops manager reconciling 200 invoices
before a deadline" — not "B2B professionals aged 25-45".

## Goals
What users must accomplish. Their outcomes, verbatim where possible.

## Platform
web / ios / android / adaptive (which of these, and any hard constraints:
supported browsers, min OS, offline, RTL…).

## Constraints
Performance budgets, technology locks, must-keep items, accessibility targets.

## Terminology
The product's own words. What we call things, what we never call them.

## Confirmed brand commitments
Names only — fonts, colors, and visual laws are DESIGN.md's territory.
A pinned commitment here outranks every taste rule in this skill.
```

## Rules

- **Never aesthetics.** No color preferences, no "modern and clean", no mood words. If the user states a visual commitment ("we always use Inter"), record the commitment name only — the visual law lands in DESIGN.md.
- Facts vs inferences: unconfirmed items are marked `(inferred)` inline and listed in one "Open questions" note at the end.
- Audience entries are situations the product is used in. If you can't picture the moment of use, you don't have the audience yet.
- The schema stamp makes `context.mjs --doctor` able to verify the file. Don't edit schema fields' names.

## When the interview is a redesign

If the ask is a redesign of an existing product: read the code first (mandate 4 — code can be the brand record), come with informed questions, and treat "why is it like this now?" as a legitimate question with an answer that may defeat the redesign.
