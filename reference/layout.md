# layout — structure, rhythm, density

The verb for the spatial layer: how groups form, how the eye moves, how much lives in one viewport. Layout is the skeleton — if the structure is wrong, no styling saves it (the skeleton test in `bolder.md`).

## 1. Two assessments, isolated — before editing anything

**A — Structural Q&A.** Read the surface (code + rendered view) and answer:
- What are the groups? Which elements belong together, and what is currently glued together by accident?
- What repeats? (grids, cards, rows — repetition is rhythm; irregularity is noise or emphasis, decide which)
- How dense is it? Count information units per viewport and compare against the surface mode — Convince/Showcase breathe, Work/Read carry (`operate.md`).
- What are the extremes? The largest and smallest things on the page — why does each earn its size? An extreme without a reason is a defect.

**B — Detector pass.** Then the source rules:

```
node scripts/detect.mjs <files>
```

Layout-relevant rules: `monotonous-spacing` (the dice-roll tell), `cramped-padding`, `nested-cards` (hard ban in `craft-floor.md`), `text-overflow`, `layout-transition` (animating layout properties is a layout smell — see `animate.md`). Occlusion and composition (`edge-flush-cards`, `first-viewport-column-overflow`, `body-text-viewport-edge`, `content-hidden-at-rest`, `text-occlusion`) are rendered-only — browser check, not source. Triage per `reference/triage.md`.

## 2. The squint test

Blur your eyes (or screenshot at arm's length, or step back). Does the structure still read? At squint distance you should see: the groups, the hierarchy, the path in. If the blurred page is a uniform gray soup, no detail will fix it — the rhythm is flat. If it's confetti, the rhythm is noise. Fix at structure level; only then detail.

## 3. One spatial thesis per surface

Every surface makes ONE structural argument — "a spine with sections," "a canvas with a rail," "cards in a reading column." Name it before editing. Elements that don't serve the thesis are competing with it; re-home them or cut them (`distill.md`). Two theses on one surface = no thesis.

## 4. The spacing system

- **4-unit base scale.** All spacing from multiples of 4px (4/8/12/16/24/32/48/64…). A value off the scale must be a named exception, not a nudge.
- **The rhythm law: tight within groups, generous between groups.** Related things sit close (8–16px); group boundaries open wide (32px+, roughly 2× the intra-gap). A heading sits nearer what it introduces than what preceded it (craft-floor check 3).
- **Whitespace is the grouping tool.** Prefer proximity over borders, borders over boxes, boxes only when the group must detach. Boxes around boxes is the nested-cards sin.

## 5. Density matches the mode

Density is not a defect to fix — it's a dial with a mode setting. Convince/Showcase: fewer elements per viewport, larger steps, air as emphasis. Work/Read: information per viewport is a virtue; compress with intent — tighter rows, aligned numerals, denser and calm, never cramped (`quieter.md`'s mode split, `operate.md`'s law). When a surface feels crowded, first ask whether the crowding is spacing failure (fix the rhythm) before you evict content.

## Avoid-list (rhythm is not…)

- **Not uniform spacing.** The same gap everywhere flattens groups into mush (`monotonous-spacing`). Rhythm means contrast between gaps.
- **Not maximal whitespace.** Air is a grouping signal, not a luxury — whitespace that separates nothing is emptiness wearing design's clothes.
- **Not grid worship.** The grid serves grouping; when content wants asymmetry, break it once, deliberately.
- **Not the container reflex.** A border is not the only way to say "these belong together."

## Verify

Squint test passes: groups, hierarchy, and path read blurred. Spacing audit: every gap on the scale, rhythm law holds (heading-to-content < section-to-section). Extremes all have reasons. Rendered check at 390px and 1440px for overflow and composition. Detector clean or triaged. Mandate 2 holds: layout changes may not smuggle in a new visual identity.
