# audit — technical quality report

Code-level, measurable, evidence-bound. **Audit applies no fixes** — it documents what's wrong so the right verb can fix it later. Five dimensions, scored 0–4 each (0 = broken, 2 = works with lapses, 4 = would ship as reference). Total /20 with bands: 16–20 sound · 11–15 needs a pass · 6–10 at risk · 0–5 do not ship.

## The five dimensions

### 1. Accessibility
Contrast (body ≥4.5:1, large ≥3:1 — measured on composited backgrounds, not guessed from tokens) · ARIA used where semantics fall short (and not where HTML already works) · keyboard reachability of everything interactive · semantic structure (headings in order, landmarks, labels bound to inputs) · forms usable with autofill and error announcement · **reduced-motion = an intentional alternative, not a kill-switch** (what remains must still communicate).

### 2. Performance
Layout thrash (reads/writes interleaved in scripts) · layout-property animation (top/left/width/height instead of transform/opacity) · lazy loading where it earns (images below fold) but never on first-viewport LCP elements · unbounded blur/shadow/gradient stacks (paint cost) · unbounded DOM growth patterns (every-item-a-node lists).

### 3. Theming
Hard-coded color/font/radius values where tokens exist (the detector's design-system rules, gated on the sidecar) · dark-mode behavior actually tested, not assumed · token consistency across components · semantic tokens used semantically (error red for errors only).

### 4. Responsive
Fixed widths that break below their assumption · touch targets ≥44px (WCAG 2.5.8's "target size (minimum)" is 24px — we hold 44px as the craft bar and note the nuance rather than hide behind the minimum) · overflow at 390px and 1440px · text scaling (200% zoom without loss) · RTL: physical→logical properties — **flag only when `dir="rtl"` is actually set or planned** (spelling-mode RTL is not a reason to churn every `left`).

### 5. Implementation integrity (CRITICAL)
Run `scripts/detect.mjs` on the surface's files. Then **verify each finding in context** before it enters the report:
- deterministic findings (the file proves it) vs visual judgment (needs the rendered view) — reported in separate sections, never merged
- **name false positives explicitly** ("detector flagged X; in context it's intentional Y — narrow-ignore candidate with evidence Z")
- a raw detector dump is not an audit; the verification is the work

## The rendered checklist (the source-scan blind spot)

Run these on the built result via the browser tool (batched — one look per viewport):
1. In-situ contrast on composited backgrounds (transparency, images, gradients under text)
2. Overflow at 390px + 1440px (both, every time)
3. Touch-target measurement on interactive clusters
4. Occlusion (fixed headers/footers/chat widgets hiding content)
5. First-viewport composition (what the brief promised to lead with is actually leading)

## Evidence rule

Every score states its evidence: file:line, measured value, or screenshot region. **Do not substitute a bare "yes".** "Keyboard: 2 — tab order skips the modal close button (index.html:88)" is an audit; "Keyboard: yes" is a shrug.

## Report shape

1. **Score table** — 5 dimensions × 0–4, total /20 + band
2. **Integrity verdict first** among prose — is this implementation what the design says it is? (Integrity flaws outrank a11y polish: a drifting brand under a nice surface is the more expensive bug.)
3. **Findings by severity** — each: location (file:line or region) / impact / standard (WCAG SC, perf budget, token rule) / recommendation / suggested verb
4. **Systemic patterns** — the same class of mistake repeated ("inline styles everywhere" beats 40 individual inline-style findings)
5. **Positive findings** — what's done well enough to protect
6. **Recommended sequence** — P0 first, polish last, verbs mapped

## Rules

- Audit is read-only. Not one fix. (That's `polish`/`typeset`/etc.'s job with this report as their backlog.)
- Detector output ≠ findings until verified (dimension 5).
- Unknown is a legal state: "not verifiable without X" beats a guess. Label it.
