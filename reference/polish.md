# polish — the final pass

**Refinement, never concealed redesign.** Polish sharpens what's there; it does not replace identity (mandate 2). If the surface needs a different direction, say so and route to the steering verb or `new-work` — a redesign wearing polish's name is the most expensive lie in this craft.

## 1. Establish the system

Look at what's deviating and classify each deviation before touching anything:

| Class | Meaning | Action |
|---|---|---|
| **Missing token** | Value should have come from the design system but was hand-set | Replace with the token (record in sidecar if absent) |
| **One-off** | Deliberate exception | Allowed — but it belongs in DESIGN.md's Named rules if it's a real rule |
| **Conceptual mismatch** | Two ideas competing in one surface | Pick one; this is the only class where taste decides |
| **Local defect** | Sloppy execution of an existing decision | Fix mechanically |

## 2. Gather evidence

- **Use the thing yourself.** Click the path, type the worst-case data, resize the window. Polish decisions made without touching the surface are guesses.
- **Read the latest critique snapshot** if `.designer/critique/` has one (`node scripts/context.mjs --trend`). Its open priorities are your backlog — closing them here is the point.
- Run the detector on the files you're about to touch (findings get fixed or triaged as you go — `reference/triage.md`).

## 3. Triage order (in order — polish is a sequence, not a mood)

1. **Broken tasks** — things that don't work, states that error
2. **Missing states** — hover/disabled/loading/error/empty + visible focus
3. **Flow, hierarchy, drift** — does the path make sense; is the reading order the design intends; anything off-system from step 1
4. **Visual and motion** — spacing rhythm, type cadence, contrast, the one focal moment
5. **Cleanup** — dead styles, duplicate rules, stale comments

Polishing visuals before states is how a beautiful form fails in production.

## 4. Polish the whole path (not the screenshot)

The user's task is a journey — polish every screen on it:

- **Flow:** no dead ends, no double-confirmations, recovery paths clear
- **Type:** measure 65–75ch, consistent scale, no orphans in critical headings, real content lengths
- **Color:** contrast on composited backgrounds, tinted neutrals, semantic colors semantic
- **States:** every interactive element in all its states (the craft-floor list)
- **Content:** controls name their actions, errors name problem + recovery, dates/numbers formatted as data
- **Code:** tokens over literals, no style duplication, detector clean (or triaged)

## 5. Verify & finish

1. **Batched render check** — one look at shipping sizes (mobile + desktop), fix everything it shows, at most one confirmation look (craft-floor discipline).
2. **Close the snapshot:** if critique priorities are now cleared, write the follow-up snapshot marking them `closed` (the trend system will keep the receipts).
3. **Report what you did NOT do** and why — polish that silently skipped half the backlog is worse than no polish.

## When polish is the wrong verb

- The surface has no identity / the identity is contested → `new-work` or `document` first
- The problems are structural (IA, flow) → `distill` / `shape`
- The code is the problem → `audit` first
- The brief asks for more presence → `bolder`
