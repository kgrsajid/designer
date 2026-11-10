# animate — motion with a job

The verb for the motion layer: give movement purpose, timing, and restraint. Motion is identity too — an established motion language is preserved by refinement (mandate 2), the same as a palette.

## 1. Find the job

Every animation must do work. The five legitimate jobs:

| Job | What it does | One-liner |
|---|---|---|
| Continuity | spatial storytelling | "That card became that panel" — the object persists across a change |
| Focus | eye direction | "Look here now" — motion pre-attentively pulls gaze |
| Reveal | progressive disclosure | "More exists behind this" — expansion, drawers, detail-in-place |
| Material | physicality | "This surface is glass/rubber/paper" — how things respond when touched |
| Feedback | state confirmation | "It registered" — the button heard you, the save landed |

**Motion without a job is decoration.** Audit every animated property on the surface: name its job or delete it. Unknown-job motion is the animated equivalent of gradient-as-mood.

## 2. One authored focal moment per surface

Craft-floor check 5. A surface gets ONE moment where motion is the design — the hero's entrance, the reveal of the key panel, the signature transition. Everything else moves less and quieter. Two focal moments compete; three is a slideshow. If the surface already has an authored moment, refinement polishes *that* — it does not add a second (mandate 2).

## 3. Timing and feel

| Class | Duration | Use |
|---|---|---|
| Micro | ~100ms | hover, pressed, focus rings, toggles |
| Transition | 150–250ms | color/opacity/size changes, small reveals |
| Panel | 250–400ms | drawers, modals, dropdowns, page sections |
| Focal | 400–800ms | the one authored moment |

- **Exits faster than entrances** — dismissal is interruption, arrival is information. Roughly 60–75% of the entrance duration.
- **Default easing `cubic-bezier(0.16, 1, 0.3, 1)`** — exponential ease-out feel; the surface responds instantly, then settles. Ease-in anywhere visible feels like lag. Bounce/overshoot curves are costume (`bounce-easing` rule).
- **Travel 10–20px** for standard moves (the `quieter.md` range); longer travel needs a proportionally longer duration or it will read as teleport-with-smear.
- **Animate transform and opacity, not layout.** Layout-property transitions cause reflow jank (`layout-transition` rule).
- Infinite loops are not motion design — `marquee`, `pulsing-dot`, `blinking-cursor` exist as detector rules for a reason; each needs a job or a funeral. Auto-playing glow sweeps (`dark-glow`, `radial-halo`) never earn one.

## 4. prefers-reduced-motion — an alternative, not a kill-switch

Blanket `* { animation: none }` amputates information. Build a real reduced path: what remains must still communicate every state the full motion carried — continuity collapses to a crossfade, focus becomes an underline or ring, feedback stays (opacity/color still allowed), entrances become instant but visible. A user who sees nothing happen has lost the interface's answers, not just its sparkle. Test the reduced path; it ships equal.

## Avoid-list (motion is not…)

- **Not ambience.** Background loops, idle drift, attention pulses on static content — decoration with a render cost.
- **Not faster design.** Snappy ≠ good; 80ms everywhere reads as twitchy, not efficient.
- **Not more design.** Adding motion to fix a flat surface polishes a dull knife — that's `bolder.md`'s diagnosis, not animate's.
- **Not a stage trick.** Entrance choreography on every element (staggered fade-up everything) makes the page perform instead of work. Stagger one list or one section — the focal moment — not the world.

## Verify

Every animation names its job; exactly one focal moment exists; durations sit in class; exits beat entrances; transform/opacity only; reduced-motion path communicates every state (check it rendered). Detector clean on the motion rules or triaged per `reference/triage.md`.
