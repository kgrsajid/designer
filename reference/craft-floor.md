# The craft floor

Load this right before any UI edit. Build under it without announcing the checklist — a floor is not a feature list. A pinned brief overrides everything here except the ban list.

## Verify — 9 batched checks on the built result

Do these on the rendered result where possible (browser tool), on source where the fact is textual. One pass, fix everything, at most one confirmation look.

1. **Contrast.** Body text ≥ 4.5:1 against its actual composited background; large text ≥ 3:1. Secondary text is tinted from the surface hue — never pure gray on a colored surface (gray-on-color is a documented sin).
2. **Shadows have offset + blur.** A zero-offset halo is a glow decoration, not depth. Depth means a direction of light.
3. **Spacing rhythm.** Tight within groups, generous between groups. A heading sits closer to what it introduces than to what preceded it. No "padding by dice roll".
4. **Type floor.** Body measure 65–75ch. Display ≤ 6rem unless the brief demands otherwise. Tracking floor −0.04em. Real copy at every breakpoint — no lorem in a shipped view, no demo values standing in for worst-case data.
5. **Motion.** One authored focal moment per surface. Ease-out from an already-visible default (exponential decay feel), exits faster than entrances. No motion without a job.
6. **States.** Hover, disabled, loading, error, empty — designed, not defaulted. Keyboard focus visible everywhere focusable.
7. **Browser surfaces.** Selection color, caret color, scrollbar, focus ring, underline offset, tabular numerals in numeric UI. These are the cheapest proof a page was built, not assembled.
8. **Copy.** Controls name their action ("Save changes", not "Submit"). Errors name the problem and the recovery. No orphan labels.
9. **Coverage.** Everything the brief asked for is findable in seconds. Missing requirements are failures, not omissions.

## Refuse list — defaults that need earning

A listed default is banned until a brief earns it. Two items are hard bans — no brief earns them.

- Identical icon + heading + text card grids ("the three-column reflex")
- **Cards inside cards — hard ban, always wrong** <!-- rule:ban-nested-cards -->
- Metric-tile heroes (four stat boxes where a sentence should be)
- **Kicker/eyebrow labels above headings — hard ban** ("the eyebrow reflex"). A section opens with its own name. <!-- rule:ban-kicker -->
- Decorative 01/02/03 section numbers
- Gradient text
- Glassmorphism as a default material
- One-side accent borders ("the colored left edge")
- Hard offset shadows outside a genuinely neobrutalist world
- Monospace as a "technical" costume on non-code content
- System display fonts standing in for an own-world voice
- Emoji as icons
- Geometric masks standing in for real illustration
- Light/dark chosen by category ("SaaS = dark") instead of the use scene

Earned means the brief names the reason. "It looks modern" is not a reason.

## Model-calibrated tells

Each model ships default sins. Blocks are written only from **measured** evidence (≥3 observed instances), never guessed. Both blocks below measured 2026-11-10 on n=3 unassisted specimen briefs (evidence: `docs/designer-calibration-catalog.md`). Re-measure quarterly.

<glm>
Measured tells (2026-11-10, n=3):
- **Default-stack type reflex** — `-apple-system…Roboto…` everywhere, zero typographic voice. Give type a voice.
- **Badge/kicker chip reflex** — tiny uppercase chips on headings/cards, in 3/3 specimens.
- **Cramped chip padding** — 3–7px sides on styled chips (floor: 8px).
- **Tailwind palette verbatim** — indigo `#4f46e5` + Tailwind grays as "the SaaS palette".
- **Flat heading steps** — adjacent sizes ~1.2x apart (hierarchy needs ≥1.25x).
</glm>

<mimo>
Measured tells (2026-11-10, n=3):
- **Gradient-text headlines** — `background-clip: text` accent on heroes (blocker-grade).
- **Neon-on-dark costume** — radial spotlight glow + saturated blue on near-black (the "near-black + neon + glow" look).
- **Ghost cards** — hairline border + huge diffuse shadow (48px observed).
- **Palette soup** — Tailwind blue mixed with violet-400 + foreign grays in one surface.
- **Cosmetic skeuomorphism** — terminal/macOS chrome as "developer tool" costume instead of design.
- *(shares GLM's default stack + cramped chips).*
</mimo>

## Closer

The floor holds mechanics; it never picks direction. It is the difference between "made" and "generated" — apply it silently.

When torn between the refined option and the committed option: commit. Timidity is the slop nobody flags.
