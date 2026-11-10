# critique — scored UX review, dual isolated

A design-director review of a surface, with evidence and a verdict. Not a vibe check. Not a fix pass — critique never edits.

## The dual-isolation doctrine (mandatory)

Two reviewers, **isolated contexts**, never the other's output until the verdict is written:

- **A — the design-director.** Holistic judgment. **Must never see detector output first** — anchoring on mechanical findings makes a director into a proofreader. A gets the surface (code + rendered view) and the context files, nothing else.
- **B — the evidence runner.** Runs `scripts/detect.mjs` on the files + the browser-tool rendered checklist (in-situ contrast on composited backgrounds, overflow at 390px **and** 1440px, touch-target measurement, occlusion, first-viewport composition). B produces findings, never opinions about taste.

**Synthesis only after A completes.** B's evidence may then confirm, quantify, or contradict A — in that order of politeness. Where A's judgment and B's evidence disagree, the report says so explicitly.

If only one context is available (user demands speed, no subagent spawning possible): run A's sequence with the detector held back until the review is drafted, and banner the report:

```
⚠️ DEGRADED: single-context (<reason>)
```

A degraded run is a legitimate run — a hidden one is not.

## A's sequence (in order)

1. **Design specificity first.** "Could an unrelated product ship this screen unchanged?" If yes, the surface has no identity — that finding outranks every pixel issue. (Skip on established-brand refinement work: there the question becomes "does this surface belong to this brand?")
2. **Holistic impression.** The first three seconds. What is this? What do I do here? What does it feel like?
3. **Cognitive load.** Single focus per screen; chunking ≤4; working memory ≤4 items; progressive disclosure. Named violation patterns: **Wall of Options** (everything at once), **Jargon Barrier** (insider words gate the task), **Visual Noise Floor** (effort to see > effort to do).
4. **Emotional journey.** Where is the peak? What does the end leave? Where are the reassurance moments (the user checking they're safe/on track)?
5. **Nielsen's 10 heuristics**, scored 0–4 each. `n/a` allowed on Convince/Showcase surfaces — the max renormalizes (40 − 4 per n/a) and the report flags it. Reference band: most real interfaces land 20–32 of 40. Scores without evidence are decoration; every score cites a place on the surface.

Heuristic keys (fixed — the snapshot schema depends on them):
`visibility` · `match` · `control` · `consistency` · `error` · `recognition` · `efficiency` · `aesthetic` · `recovery` · `help`

## Report shape (in order — the order is the product)

1. **Provenance line** — surface, mode, who reviewed (isolated A/B or degraded), detector run or not.
2. **Heuristic table** — 10 rows, score + one-line evidence each.
3. **Specificity verdict FIRST among the prose** — the answer to step 1's question, stated plainly.
4. **2–3 strengths** — what's working hard enough to protect during fixes.
5. **3–5 priority issues.** Each: **What** (where + what's wrong) / **Why it matters** (user consequence, not taste) / **Fix** (direction) / **Suggested verb** (polish, typeset, bolder…). Severity P0–P3. Bar: *"would a user contact support about this?"* → that's ≥P1.
6. **Persona red flags** — 2–3 cards, from: power-user **Alex** (efficiency, shortcuts, bulk), first-timer **Jordan** (onboarding, words, confidence), accessibility-dependent **Sam** (contrast, focus, semantics, motion), stress-tester **Riley** (bad data, errors, edge counts), distracted-mobile **Casey** (one hand, small screen, interruptibility) — plus 1–2 derived from PRODUCT.md's actual audience. Cards run ~3 lines: what they need, what breaks for them here, severity.
7. **Minor notes** — compressed list, no prose.
8. **2–4 pointed questions LAST.** A run without questions is incomplete. If truly none: `Questions skipped: <reason>`.

Tone law: no "consider exploring…", no hedging verbs. If everything is important, nothing is. Three priority issues beat twelve notes.

## Persistence — the full trend system

A report that exists only in chat produced nothing durable; a report that exists only in a file helped nobody. Both, in this order:

1. **Deliver in chat first.** Always.
2. **Snapshot** to `.designer/critique/<timestamp-safe-name>.json` — schema `designer:critique-snapshot 1` (this exact shape; `scripts/context.mjs` parses it):

```json
{
  "schema": "designer:critique-snapshot 1",
  "timestamp": "2026-11-10T12:00:00Z",
  "surface": "pricing.html",
  "mode": "convince",
  "verdict": "<the specificity verdict line>",
  "scores": {
    "nielsenTotal": 28, "nielsenMax": 40, "renormalized": false,
    "perHeuristic": { "visibility": 3, "match": 3, "control": 2, "consistency": 3,
      "error": 2, "recognition": 3, "efficiency": 3, "aesthetic": 3,
      "recovery": 2, "help": "n/a" }
  },
  "priorities": [
    { "id": "P1-01", "severity": "P1", "what": "…", "why": "…", "fix": "…",
      "verb": "polish", "status": "open" }
  ],
  "fingerprint": { "algo": "sha256", "head8": "…", "bytes": 12345 },
  "provenance": { "detectorRun": true, "degraded": null },
  "recommendedSequence": ["typeset", "polish"]
}
```

Rules of the snapshot: `n/a` = the string `"n/a"` (max renormalizes to 40 − 4×count). The fingerprint covers the exact bytes reviewed — a run on changed bytes is a new run. `priorities[].status` starts `open`; closing happens in a later run's snapshot (re-list the item with `closed`).
3. **Trend is rendered by `node scripts/context.mjs --trend`** (also embedded in `--doctor`): score trajectory, per-heuristic deltas, recurring findings (normalized `what` across ≥2 snapshots), and **REGRESSION flags** — a dropped score or a closed finding reopening gets named out loud. Never re-derive trend math in prose; run the tool and quote it.
4. **Backlog discipline.** Open priorities carry forward across runs until closed or explicitly killed with a reason. "We fixed it" closes it in the next snapshot; silence does not.
5. **Recommended verb sequence** — the roadmap out. `polish` almost always comes last; polish first is polishing broken bones.

## What critique is not

- Not an audit (audit is code-level and measurable — `reference/audit.md`). Overlap is fine; conflation is not: critique judges the experience, audit verifies the implementation.
- Not a fix pass. Findings get fixed by verbs, in scope, after.
- Not a brand referendum on established projects (mandate 2). A refinement critique may say "this drifts from DESIGN.md"; it may never say "the brand should change".
