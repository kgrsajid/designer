# triage — the three-outcome law for every detector finding

Every `detect.mjs` finding ends in exactly one of three states. No fourth option, no quiet disappearance.

## 1. Fix the issue

The default. The finding is real and the fix belongs in this change. Fix at the source (token, component, template), not at the instance.

## 2. Narrowest ignore, with named evidence

When the finding is intentional: silence the **smallest scope that expresses the intent**, and say why. Prefer value-scoped ignores over rule-scoped — they keep the rule armed (`ignoreValues` in `.designer/config.json`: one rule, one evidence substring, one mandatory reason). Otherwise narrow to the file+rule with a reason the rule can't argue with:

```
/* designer-lint-disable overused-font: Inter is the brand font — DESIGN.md Typography */
```

**Inline ignore syntax** — the file's own comment syntax, payload `designer-lint-disable <rule-id>: reason`:

| File type | Syntax |
|---|---|
| CSS/SCSS/LESS (and `<style>` blocks in any markup input) | `/* designer-lint-disable <rule>[: reason] */` … `/* designer-lint-enable */` |
| HTML/Vue/Svelte/Astro/JSX/TSX (HTML comments) | `<!-- designer-lint-disable <rule>[: reason] -->` … `<!-- designer-lint-enable -->` |

The rule list accepts comma/space-separated ids or `*`; a trailing `: reason` is stripped and echoed in `--json` activeIgnores. Plain `.js`/`.ts` inputs and `#`-comment files are not ignore-parsed in v1 (no extraction runs on them). Config-file ignores are live: `.designer/config.json` (committed) and `.designer/config.local.json` (gitignored, wins per-key), discovered by walking up to the git root, with keys `ignoreRules`, `ignoreFiles` (whole-file skip, still listed), `ignoreValues` (reason mandatory), and `advisoryRules` (demote to advisory — still reported, never gating).

Scope hierarchy (narrowest wins): **value-scope < file+rule < file < rule**. Config-file ignores live in `.designer/config.json` (committed) or `.designer/config.local.json` (gitignored, wins per-key): `ignoreValues` is the value-scope tier, `ignoreRules` the file+rule tier, `ignoreFiles` the file tier. Every active ignore is listed in `--json` output (`activeIgnores`, kind `inline|config|config-local|value|file`, each with source and reason) — silencing the detector is always visible, never silent.

The reason is mandatory. An ignore without a named reason is a bug.

## 3. Leave standing, with a written reason

When the finding is real but out of scope, deferred, or contested: record the decision where the work is reported (PR note, audit entry, critique issue list). "We know, here's why we ship it" is legitimate. Silence is not.

## The immediate tier — findings that must never ship

The immediate tier is whatever `data/rules.json` marks `tier: immediate` — derive it from there (`node scripts/detect.mjs --list-rules`), never from memory or from this paragraph. In v1 these are the source-provable unshippable sins: broken images, text overflow by construction, gray-on-color, sub-legible text sizes, gradient text, dark glow, and off-brand values (design-system rules) — but the file that decides is `rules.json`.

Rendered-only sins (real contrast, occlusion, viewport-edge text) are **not** in the detector's immediate tier — they live in the browser-tool checklist and are `audit`/`critique`'s job to catch. Detector-clean does not mean shippable; it means source-clean.

## Order of operations when a scan returns findings

1. Immediate-tier findings → fix now.
2. Everything else → fix, narrow-ignore with evidence, or leave standing with a reason.
3. Advisory findings never gate the exit code — but they still deserve a pass before finishing.
