#!/usr/bin/env node
/**
 * designer-context — project-state snapshot for the "designer" skill.
 *
 * Modes:
 *   node scripts/context.mjs [root]            → project-state snapshot (JSON; --text for human block)
 *   node scripts/context.mjs --doctor [root]   → drift report (severity-tagged, REPORT ONLY)
 *   node scripts/context.mjs --trend [root]    → critique trend rendering
 *
 * Zero-dependency Node >= 20. No network, no binary, no telemetry.
 * ZERO WRITES — this tool never modifies anything. "Drift repair is never a
 * side effect": doctor names drift, the agent decides what to do about it.
 *
 * Reads are limited to: <root>/PRODUCT.md, <root>/DESIGN.md, <root>/.designer/**,
 * <skill>/data/rules.json (rule metadata — counts read from the file, never
 * hard-coded), and one guarded `git status --porcelain` (see below).
 *
 * DECLARED DEVIATION (the only exec in this tool): `execFileSync('git',
 * ['status','--porcelain','--','.'], …)` — args ARRAY, never a shell string,
 * run read-only with cwd=<root>, wrapped in try/catch; any failure (git
 * missing, not a repository) degrades gracefully to "git: unavailable".
 *
 * Exit codes: 0 = ok / no drift · 2 = doctor found drift · 1 = usage or scan error.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.dirname(SCRIPT_DIR);
const TOOL = 'designer-context';
const SCHEMA = 1;

const PRODUCT_STAMP = 'designer:product-schema';
const DESIGN_STAMP = 'designer:design-schema';
const SNAPSHOT_SCHEMA = 'designer:critique-snapshot 1';
const HEURISTIC_MAX = 4; // per Nielsen heuristic (10 heuristics → 40)
const DEFAULT_STALE_DAYS = 14;
// Mirrors SCAN_EXTS in detect.mjs (kept local: detect.mjs owns its copy).
const UI_EXTS = new Set(['.html', '.htm', '.css', '.scss', '.less', '.vue', '.svelte', '.jsx', '.tsx', '.ts', '.js', '.astro']);
const SEVERITIES = ['P0', 'P1', 'P2', 'P3'];

// ---------------------------------------------------------------------------
// Small readers
// ---------------------------------------------------------------------------

function readText(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }
function readJson(p) {
  const t = readText(p);
  if (t === null) return { present: false, parseable: false, value: null };
  try { return { present: true, parseable: true, value: JSON.parse(t) }; }
  catch { return { present: true, parseable: false, value: null }; }
}

function loadRules() {
  const r = readJson(path.join(SKILL_DIR, 'data', 'rules.json'));
  if (!r.present || !r.parseable || !Array.isArray(r.value?.rules)) {
    return { readable: false, ids: new Set(), ruleCount: 0, policy: null };
  }
  return {
    readable: true,
    ids: new Set(r.value.rules.map((x) => x.id)),
    ruleCount: r.value.rules.length,
    policy: r.value.severityPolicy ?? null,
  };
}

function stampStatus(text, stamp) {
  if (!text) return 'missing';
  const m = new RegExp(`${stamp}\\s+(\\d+)`).exec(text);
  if (!m) return 'missing';
  const v = Number(m[1]);
  return v === SCHEMA ? 'valid' : v < SCHEMA ? 'stale' : 'newer';
}

function platformFromProduct(text) {
  if (!text) return null;
  const chunk = text.split(/\n(?=##\s)/).find((c) => /^##\s*Platform\b/im.test(c));
  if (!chunk) return null;
  for (const line of chunk.split(/\r?\n/).slice(1)) {
    const t = line.trim();
    if (t && !t.startsWith('#')) return t.length > 120 ? `${t.slice(0, 117)}…` : t;
  }
  return null;
}

// DECLARED DEVIATION — see header. Args array only; never a shell string.
// --no-optional-locks: git must not even refresh its own index while we look.
function gitState(root) {
  try {
    const out = execFileSync('git', ['--no-optional-locks', 'status', '--porcelain', '--', '.'],
      { cwd: root, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
    const dirty = [];
    for (const line of String(out).split('\n')) {
      if (line.length < 4) continue;
      let p = line.slice(3);
      const arrow = p.indexOf(' -> ');
      if (arrow !== -1) p = p.slice(arrow + 4);
      if (p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1);
      if (UI_EXTS.has(path.extname(p))) dirty.push(p);
    }
    return { available: true, dirtyCount: dirty.length, dirtyUiFiles: dirty.slice(0, 50) };
  } catch {
    return { available: false, note: 'git: unavailable' };
  }
}

// ---------------------------------------------------------------------------
// Critique snapshots (.designer/critique/*.json — schema pinned by the blueprint)
// ---------------------------------------------------------------------------

function loadSnapshots(root) {
  const dir = path.join(root, '.designer', 'critique');
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return { snaps: [], skipped: 0 }; }
  const snaps = [];
  let skipped = 0;
  for (const name of entries.sort()) {
    if (!name.endsWith('.json')) continue;
    const j = readJson(path.join(dir, name));
    if (!j.present || !j.parseable || j.value?.schema !== SNAPSHOT_SCHEMA) { skipped++; continue; }
    snaps.push({ file: name, snap: j.value });
  }
  snaps.sort((a, b) => {
    const ta = Date.parse(a.snap.timestamp ?? '') || 0;
    const tb = Date.parse(b.snap.timestamp ?? '') || 0;
    return (ta - tb) || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
  });
  return { snaps, skipped };
}

// n/a heuristics renormalize: max = 40 − 4×(n/a count); total = sum of numeric
// scores, recomputed consistently; renormalized=true whenever n/a present or
// the stored values disagree with the recomputation.
function renormScores(scores) {
  const per = scores?.perHeuristic && typeof scores.perHeuristic === 'object' ? scores.perHeuristic : {};
  let total = 0, naCount = 0;
  for (const v of Object.values(per)) {
    if (v === 'n/a') naCount++;
    else if (typeof v === 'number' && Number.isFinite(v)) total += v;
  }
  const max = HEURISTIC_MAX * Math.max(0, 10 - naCount);
  const storedTotal = typeof scores?.nielsenTotal === 'number' ? scores.nielsenTotal : null;
  const storedMax = typeof scores?.nielsenMax === 'number' ? scores.nielsenMax : null;
  return { total, max, naCount, per, renormalized: naCount > 0 || storedTotal !== total || storedMax !== max };
}

function normalizeWhat(what) {
  return String(what ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 60);
}
const trunc = (s, n) => { const t = String(s ?? ''); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const isoDate = (ts) => (typeof ts === 'string' && /^\d{4}-\d{2}-\d{2}/.test(ts) ? ts.slice(0, 10) : null);
const normSeverity = (s) => (SEVERITIES.includes(s) ? s : '?');

function buildTrend(loaded) {
  const { snaps, skipped } = loaded;
  const out = { snapshots: snaps.length, skipped, trajectory: [], deltasLastTwo: null, recurring: [], regressions: [], backlog: { count: 0, bySeverity: { P0: 0, P1: 0, P2: 0, P3: 0, '?': 0 }, items: [] } };
  if (snaps.length === 0) return out;

  const renormed = snaps.map((s) => renormScores(s.snap.scores));
  out.trajectory = snaps.map((s, i) => ({
    run: i + 1, file: s.file, timestamp: s.snap.timestamp ?? null, date: isoDate(s.snap.timestamp),
    nielsenTotal: renormed[i].total, nielsenMax: renormed[i].max,
    renormalized: renormed[i].renormalized, naCount: renormed[i].naCount,
  }));

  if (snaps.length >= 2) {
    const a = renormed[renormed.length - 2].per, b = renormed[renormed.length - 1].per;
    const perHeuristic = {}; let naSkipped = 0;
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (typeof a[k] === 'number' && typeof b[k] === 'number') perHeuristic[k] = b[k] - a[k];
      else naSkipped++;
    }
    const tA = out.trajectory[out.trajectory.length - 2].nielsenTotal;
    const tB = out.trajectory[out.trajectory.length - 1].nielsenTotal;
    out.deltasLastTwo = {
      from: snaps[snaps.length - 2].snap.timestamp ?? null,
      to: snaps[snaps.length - 1].snap.timestamp ?? null,
      total: tB - tA, perHeuristic, naSkipped,
    };
  }

  // Occurrence index: normalizedWhat → [{ status, severity, what, ts }]
  const occ = new Map();
  snaps.forEach((s, i) => {
    const pr = Array.isArray(s.snap.priorities) ? s.snap.priorities : [];
    for (const p of pr) {
      const norm = normalizeWhat(p.what);
      if (!norm) continue;
      if (!occ.has(norm)) occ.set(norm, []);
      occ.get(norm).push({
        run: i + 1, ts: s.snap.timestamp ?? null,
        status: p.status === 'closed' ? 'closed' : 'open',
        severity: normSeverity(p.severity), what: trunc(p.what, 100),
      });
    }
  });

  for (const [norm, list] of occ) {
    if (list.length >= 2) {
      out.recurring.push({
        normalized: norm, what: list[0].what, seenIn: list.length,
        firstSeen: list[0].ts, lastSeen: list[list.length - 1].ts,
      });
    }
    const last = list[list.length - 1];
    if (last.status === 'open') {
      out.backlog.count++;
      out.backlog.bySeverity[last.severity]++;
      out.backlog.items.push({
        severity: last.severity, what: last.what, lastSeen: last.ts,
        openIn: list.filter((x) => x.status === 'open').length,
      });
    }
  }
  out.backlog.items.sort((x, y) => SEVERITIES.indexOf(x.severity) - SEVERITIES.indexOf(y.severity) || String(x.lastSeen).localeCompare(String(y.lastSeen)));

  // REGRESSION: score drop >= 2 vs the previous run (named out loud)
  for (let i = 1; i < out.trajectory.length; i++) {
    const prev = out.trajectory[i - 1], cur = out.trajectory[i];
    const drop = prev.nielsenTotal - cur.nielsenTotal;
    if (drop >= 2) {
      out.regressions.push({
        type: 'score-drop', from: prev.timestamp, to: cur.timestamp, drop,
        message: `REGRESSION: score dropped ${prev.nielsenTotal}→${cur.nielsenTotal} (−${drop}) on ${cur.date ?? cur.timestamp ?? '?'}`,
      });
    }
  }
  // REGRESSION: a priority that was closed reappearing open (named out loud)
  const reported = new Set();
  for (const [norm, list] of occ) {
    let closedTs = null;
    for (const o of list) {
      if (o.status === 'open' && closedTs && !reported.has(norm)) {
        reported.add(norm);
        out.regressions.push({
          type: 'reopened', what: o.what, closed: closedTs, reopened: o.ts,
          message: `REGRESSION: "${trunc(o.what, 80)}" (closed ${isoDate(closedTs) ?? closedTs}) reopened ${isoDate(o.ts) ?? o.ts}`,
        });
      }
      if (o.status === 'closed' && closedTs === null) closedTs = o.ts;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// DESIGN.md frontmatter vs .designer/design.json sidecar token comparison
// (best-effort, tolerant: skip silently whenever unverifiable)
// ---------------------------------------------------------------------------

function splitTopLevel(s, sep) {
  const parts = []; let depth = 0, quote = null, cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) { cur += ch; if (ch === quote && s[i - 1] !== '\\') quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '{' || ch === '(') { depth++; cur += ch; continue; }
    if (ch === '}' || ch === ')') { depth = Math.max(0, depth - 1); cur += ch; continue; }
    if (ch === sep && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

function stripComment(v) { // trailing ` # comment` outside quotes (hex colors survive)
  let quote = null;
  for (let i = 0; i < v.length; i++) {
    const ch = v[i];
    if (quote) { if (ch === quote && v[i - 1] !== '\\') quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '#' && i > 0 && /\s/.test(v[i - 1]) && /\s/.test(v[i + 1] ?? ' ')) return v.slice(0, i).trim();
  }
  return v.trim();
}

function classifyKey(key) {
  const k = key.toLowerCase();
  if (k.includes('color')) return 'color';
  if (k.includes('radius') || k.includes('round')) return 'radius';
  if (k.includes('spac')) return 'spacing';
  if (k.includes('font') || k.includes('typo') || k.includes('type')) return 'font';
  if (k.includes('size') || k.includes('scale')) return 'size';
  return null;
}

function extractLiterals(v) {
  const out = new Set();
  for (const h of v.match(/#[0-9a-fA-F]{3,8}\b/g) || []) out.add(h.toLowerCase());
  for (const f of v.match(/(?:rgb|rgba|hsl|hsla)\([^)]*\)/gi) || []) out.add(f.toLowerCase().replace(/\s+/g, ''));
  for (const l of v.match(/-?\d+(?:\.\d+)?(?:px|rem|em|%)\b/g) || []) {
    const unit = /(px|rem|em|%)$/.exec(l)[1];
    out.add(`${parseFloat(l)}${unit}`);
  }
  for (const q of v.match(/"([^"]*)"|'([^']*)'/g) || []) {
    const inner = q.slice(1, -1).trim();
    const sub = extractLiterals(inner); // quoted literal → normalize like a bare one
    if (sub.size > 0) { for (const s of sub) out.add(s); }
    else if (inner) out.add(inner); // quoted name (font family, token label)
  }
  if (out.size === 0 && /^\S+$/.test(v.trim())) out.add(v.trim()); // bare word (font family, named token)
  return out;
}

function frontmatterTokens(md) {
  // tolerate leading content (e.g. the schema-stamp line) before the fence
  const m = /(?:^|\n)---\r?\n([\s\S]*?)\r?\n---/.exec(md ?? '');
  if (!m) return null;
  const cats = new Map();
  const add = (cat, lits) => {
    if (!cat) return;
    if (!cats.has(cat)) cats.set(cat, new Set());
    for (const l of lits) if (l !== '') cats.get(cat).add(l);
  };
  let lastCat = null;
  for (const raw of m[1].split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const line = raw.trim();
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1], value = stripComment(kv[2]);
    let cat = classifyKey(key);
    if (/^\s/.test(raw) && cat === null) cat = lastCat; // nested key inherits container category
    lastCat = cat;
    if (/^\{.*\}$/.test(value)) {
      const mapCat = cat;
      for (const part of splitTopLevel(value.slice(1, -1), ',')) {
        const sub = /^\s*([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/.exec(part);
        if (!sub) continue;
        add(classifyKey(sub[1]) ?? mapCat, extractLiterals(stripComment(sub[2])));
      }
    } else if (value) {
      add(cat, extractLiterals(value));
    }
  }
  return cats;
}

function sidecarTokens(json) {
  const cats = new Map();
  const tokens = json?.tokens;
  if (!tokens || typeof tokens !== 'object') return cats;
  for (const [key, values] of Object.entries(tokens)) {
    if (!Array.isArray(values)) continue;
    const cat = classifyKey(key);
    if (!cat) continue;
    for (const v of values) {
      if (typeof v !== 'string') continue;
      if (!cats.has(cat)) cats.set(cat, new Set());
      for (const l of extractLiterals(v)) if (l !== '') cats.get(cat).add(l);
    }
  }
  return cats;
}

function tokenMismatches(designMdText, sidecarJson) {
  const front = frontmatterTokens(designMdText);
  if (!front || front.size === 0) return null; // no frontmatter → unverifiable, skip silently
  const side = sidecarTokens(sidecarJson);
  if (side.size === 0) return null; // no/empty sidecar tokens → unverifiable, skip silently
  const out = [];
  for (const cat of new Set([...front.keys(), ...side.keys()])) {
    const f = front.get(cat) ?? new Set();
    const s = side.get(cat) ?? new Set();
    const onlyFront = [...f].filter((x) => !s.has(x));
    const onlySide = [...s].filter((x) => !f.has(x));
    if (onlyFront.length || onlySide.length) out.push({ category: cat, onlyInDesignMd: onlyFront, onlyInSidecar: onlySide });
  }
  return out;
}

// ---------------------------------------------------------------------------
// .designer/config.json ignores + .designer/briefs orphans (best-effort)
// ---------------------------------------------------------------------------

function configIgnoreRuleIds(cfg) {
  const val = cfg?.ignores ?? cfg?.detector?.ignores;
  if (!Array.isArray(val)) return null; // shape not pinned yet → skip silently
  const ids = new Set();
  for (const entry of val) {
    if (typeof entry === 'string') { const t = entry.trim(); if (t) ids.add(t); continue; }
    if (entry && typeof entry === 'object') {
      for (const k of ['rule', 'ruleId', 'id', 'rules']) {
        const v = entry[k];
        if (typeof v === 'string') for (const s of v.split(',')) { const t = s.trim(); if (t) ids.add(t); }
        else if (Array.isArray(v)) for (const s of v) if (typeof s === 'string' && s.trim()) ids.add(s.trim());
      }
    }
  }
  return ids;
}

function orphanedBriefs(root) {
  const dir = path.join(root, '.designer', 'briefs');
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return []; }
  const out = [];
  for (const name of entries.sort()) {
    if (!name.endsWith('.md')) continue;
    const text = readText(path.join(dir, name));
    const fm = text && /(?:^|\n)---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    if (!fm) continue; // no frontmatter → unverifiable, skip silently
    const t = /(?:^|\n)\s*(?:target|page|surface|file)\s*:\s*(.+)$/m.exec(fm[1]);
    if (!t) continue; // no target key → unverifiable, skip silently
    const rel = t[1].trim().replace(/^["']|["']+$/g, '');
    if (rel && !fs.existsSync(path.resolve(root, rel))) {
      out.push({ brief: `.designer/briefs/${name}`, target: rel });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mode builders
// ---------------------------------------------------------------------------

function buildDefault(root) {
  const product = readText(path.join(root, 'PRODUCT.md'));
  const design = readText(path.join(root, 'DESIGN.md'));
  const sidecar = readJson(path.join(root, '.designer', 'design.json'));
  const config = readJson(path.join(root, '.designer', 'config.json'));
  const rules = loadRules();
  const { snaps } = loadSnapshots(root);

  let lastCritique = null;
  if (snaps.length > 0) {
    const s = snaps[snaps.length - 1];
    const r = renormScores(s.snap.scores);
    const ts = Date.parse(s.snap.timestamp ?? '');
    lastCritique = {
      timestamp: s.snap.timestamp ?? null,
      ageDays: Number.isFinite(ts) ? Math.round((Math.max(0, Date.now() - ts) / 864e5) * 10) / 10 : null,
      surface: s.snap.surface ?? null, mode: s.snap.mode ?? null, verdict: s.snap.verdict ?? null,
      nielsenTotal: r.total, nielsenMax: r.max, renormalized: r.renormalized,
      openPriorities: (Array.isArray(s.snap.priorities) ? s.snap.priorities : []).filter((p) => p.status !== 'closed').length,
    };
  }

  const side = sidecar.present && sidecar.parseable ? sidecarTokens(sidecar.value) : new Map();
  const tokenCategories = {};
  for (const [k, set] of side) tokenCategories[k] = set.size;

  return {
    tool: TOOL, schema: SCHEMA, mode: 'default', root,
    files: {
      'PRODUCT.md': product === null ? { present: false } : { present: true, schemaStamp: stampStatus(product, PRODUCT_STAMP) },
      'DESIGN.md': design === null ? { present: false } : { present: true, schemaStamp: stampStatus(design, DESIGN_STAMP) },
      '.designer/design.json': { present: sidecar.present, ...(sidecar.present ? { parseable: sidecar.parseable } : {}) },
      '.designer/config.json': { present: config.present, ...(config.present ? { parseable: config.parseable } : {}) },
    },
    platform: platformFromProduct(product),
    lastCritique,
    git: gitState(root),
    detector: {
      rulesFile: rules.readable, ruleCount: rules.ruleCount,
      gating: rules.policy?.gating ?? null, advisory: rules.policy?.advisory ?? null,
    },
    sidecar: {
      present: sidecar.present && sidecar.parseable,
      version: sidecar.value?.version ?? null,
      tokenCategories,
    },
  };
}

const fmtList = (a, n = 5) => a.length <= n ? a.join(', ') : `${a.slice(0, n).join(', ')} (+${a.length - n} more)`;

function buildDoctor(root, staleDays) {
  const product = readText(path.join(root, 'PRODUCT.md'));
  const design = readText(path.join(root, 'DESIGN.md'));
  const sidecar = readJson(path.join(root, '.designer', 'design.json'));
  const config = readJson(path.join(root, '.designer', 'config.json'));
  const rules = loadRules();
  const loaded = loadSnapshots(root);
  const trend = buildTrend(loaded);
  const git = gitState(root);
  const items = [];
  const push = (id, severity, tag, message) => items.push({ id, severity, tag, message });

  // schema stamps
  if (product === null) {
    push('product-md-missing', 'P2', 'route', 'PRODUCT.md not found — run init (reference/init.md) before new-surface work');
  } else {
    const st = stampStatus(product, PRODUCT_STAMP);
    if (st === 'missing') push('product-stamp-missing', 'P2', 'auto', `PRODUCT.md lacks the schema stamp <!-- ${PRODUCT_STAMP} 1 -->`);
    if (st === 'stale') push('product-stamp-stale', 'P2', 'mention', `PRODUCT.md schema stamp is older than this tool expects (wanted ${PRODUCT_STAMP} 1)`);
    if (st === 'newer') push('product-stamp-newer', 'P3', 'mention', 'PRODUCT.md schema stamp is newer than this tool knows — update the skill');
  }
  if (design !== null) {
    const st = stampStatus(design, DESIGN_STAMP);
    if (st === 'missing') push('design-stamp-missing', 'P2', 'auto', `DESIGN.md lacks the schema stamp <!-- ${DESIGN_STAMP} 1 -->`);
    if (st === 'stale') push('design-stamp-stale', 'P2', 'mention', `DESIGN.md schema stamp is older than this tool expects (wanted ${DESIGN_STAMP} 1)`);
    if (st === 'newer') push('design-stamp-newer', 'P3', 'mention', 'DESIGN.md schema stamp is newer than this tool knows — update the skill');
  } else if (sidecar.present && sidecar.parseable) {
    push('sidecar-without-design-md', 'P3', 'mention', '.designer/design.json exists but DESIGN.md does not — the sidecar is derived data; run document');
  }

  // frontmatter vs sidecar token mismatches (only when both verifiable)
  if (design !== null && sidecar.present && sidecar.parseable) {
    for (const mm of tokenMismatches(design, sidecar.value) ?? []) {
      push('design-sidecar-mismatch', 'P1', 'mention',
        `DESIGN.md frontmatter and .designer/design.json disagree on ${mm.category} tokens — in DESIGN.md only: [${fmtList(mm.onlyInDesignMd)}]; in sidecar only: [${fmtList(mm.onlyInSidecar)}]. Intentional change updates the record; accidental drift fixes the code — ask which.`);
    }
  }

  // orphaned surface briefs (best-effort, unverifiable ones skipped silently)
  for (const b of orphanedBriefs(root)) {
    push('brief-orphaned', 'P3', 'mention', `surface brief ${b.brief} targets "${b.target}" which does not exist in the project`);
  }

  // broken ignore entries (rule ids not in rules.json)
  if (config.present && config.parseable && rules.readable) {
    const ids = configIgnoreRuleIds(config.value);
    if (ids) {
      const broken = [...ids].filter((id) => !rules.ids.has(id));
      if (broken.length) {
        push('config-ignore-broken', 'P2', 'auto', `.designer/config.json ignores reference unknown rule ids: ${fmtList(broken)} (known rules: ${rules.ruleCount} in data/rules.json)`);
      }
    }
  }

  // critique trend: snapshot count + open-priority backlog
  if (trend.backlog.count > 0) {
    const counts = SEVERITIES.map((s) => `${s}:${trend.backlog.bySeverity[s]}`).filter((_, i) => trend.backlog.bySeverity[SEVERITIES[i]] > 0).join(' ');
    push('critique-backlog', 'P3', 'mention', `critique backlog: ${trend.backlog.count} open priorit${trend.backlog.count === 1 ? 'y' : 'ies'} (${counts}) across ${trend.snapshots} snapshot${trend.snapshots === 1 ? '' : 's'} — address before the next polish pass`);
  }

  // stale critiqued state: newest snapshot older than N days AND git-dirty UI files
  if (loaded.snaps.length > 0 && git.available && git.dirtyCount > 0) {
    const ts = Date.parse(loaded.snaps[loaded.snaps.length - 1].snap.timestamp ?? '');
    const ageDays = Number.isFinite(ts) ? (Date.now() - ts) / 864e5 : 0;
    if (ageDays > staleDays) {
      push('critique-stale', 'P2', 'route',
        `last critique is ${Math.floor(ageDays)}d old (threshold ${staleDays}d) with ${git.dirtyCount} git-dirty UI file${git.dirtyCount === 1 ? '' : 's'} — re-run critique before more design work`);
    }
  }

  return {
    tool: TOOL, schema: SCHEMA, mode: 'doctor', root, staleDays,
    summary: {
      total: items.length,
      bySeverity: Object.fromEntries(SEVERITIES.map((s) => [s, items.filter((i) => i.severity === s).length])),
      byTag: { auto: items.filter((i) => i.tag === 'auto').length, mention: items.filter((i) => i.tag === 'mention').length, route: items.filter((i) => i.tag === 'route').length },
    },
    items,
    trend: trend.snapshots > 0 ? trend : null,
    exitCode: items.length > 0 ? 2 : 0,
  };
}

// ---------------------------------------------------------------------------
// Text renderers
// ---------------------------------------------------------------------------

function renderDefaultText(d) {
  const L = [];
  L.push(`designer context — ${d.root}`);
  for (const [name, info] of Object.entries(d.files)) {
    let s = info.present ? 'present' : 'MISSING';
    if (info.schemaStamp) s += `, stamp ${info.schemaStamp}`;
    if (info.present && 'parseable' in info && !info.parseable) s += ', UNPARSEABLE';
    L.push(`  ${name.padEnd(24)} ${s}`);
  }
  L.push(`platform: ${d.platform ?? '(none parsed)'}`);
  if (d.lastCritique) {
    const lc = d.lastCritique;
    L.push(`last critique: ${lc.timestamp ?? '?'}${lc.ageDays !== null ? ` (${lc.ageDays}d ago)` : ''} — ${lc.nielsenTotal}/${lc.nielsenMax}${lc.renormalized ? ' (renormalized)' : ''} · ${lc.openPriorities} open priorities`);
  } else {
    L.push('last critique: (none)');
  }
  L.push(d.git.available ? `git: ${d.git.dirtyCount} dirty UI file${d.git.dirtyCount === 1 ? '' : 's'}${d.git.dirtyCount ? ` (${fmtList(d.git.dirtyUiFiles)})` : ''}` : `git: ${d.git.note}`);
  L.push(`detector: rules.json ${d.detector.rulesFile ? 'ok' : 'UNREADABLE'} (${d.detector.ruleCount} rules)`);
  const tc = Object.entries(d.sidecar.tokenCategories).map(([k, n]) => `${k} ${n}`).join(', ');
  L.push(`sidecar: ${d.sidecar.present ? `v${d.sidecar.version ?? '?'} — ${tc || 'no tokens'}` : '(absent)'}`);
  return L.join('\n');
}

function renderDoctorText(doc) {
  const L = [`designer doctor — ${doc.root} (stale threshold: ${doc.staleDays}d) — REPORT ONLY, nothing was modified`];
  if (doc.items.length === 0) L.push('  no drift detected');
  for (const it of doc.items) L.push(`  [${it.severity}][${it.tag}] ${it.id} — ${it.message}`);
  if (doc.trend) {
    L.push('  trend:');
    L.push(`    trajectory: ${doc.trend.trajectory.map((t) => `${t.date ?? '?'} ${t.nielsenTotal}/${t.nielsenMax}${t.renormalized ? '*' : ''}`).join(' → ')}`);
    for (const r of doc.trend.regressions) L.push(`    ${r.message}`);
    if (doc.trend.backlog.count > 0) {
      const counts = SEVERITIES.filter((s) => doc.trend.backlog.bySeverity[s] > 0).map((s) => `${s}:${doc.trend.backlog.bySeverity[s]}`).join(' ');
      L.push(`    open backlog: ${doc.trend.backlog.count} (${counts})`);
    }
  }
  return L.join('\n');
}

function renderTrendText(t) {
  const L = [`designer trend — ${t.snapshots} snapshot${t.snapshots === 1 ? '' : 's'}${t.skipped ? ` (${t.skipped} skipped: unreadable or foreign schema)` : ''}`];
  if (t.snapshots === 0) return L.join('\n');
  L.push(`  trajectory: ${t.trajectory.map((x) => `${x.date ?? '?'} ${x.nielsenTotal}/${x.nielsenMax}${x.renormalized ? '*' : ''}`).join(' → ')}${t.trajectory.some((x) => x.renormalized) ? '  (* renormalized)' : ''}`);
  if (t.deltasLastTwo) {
    const d = t.deltasLastTwo;
    const per = Object.entries(d.perHeuristic).map(([k, v]) => `${k} ${v > 0 ? `+${v}` : v}`).join(', ') || '—';
    L.push(`  deltas (${isoDate(d.from) ?? '?'} → ${isoDate(d.to) ?? '?'}): total ${d.total > 0 ? `+${d.total}` : d.total}; ${per}${d.naSkipped ? `; n/a skipped: ${d.naSkipped}` : ''}`);
  }
  if (t.recurring.length) {
    L.push('  recurring findings:');
    for (const r of t.recurring) L.push(`    ×${r.seenIn} ${trunc(r.what, 70)} (first ${isoDate(r.firstSeen) ?? '?'})`);
  }
  if (t.regressions.length) for (const r of t.regressions) L.push(`  ${r.message}`);
  if (t.backlog.count === 0) L.push('  open backlog: none');
  else {
    const counts = SEVERITIES.filter((s) => t.backlog.bySeverity[s] > 0).map((s) => `${s}:${t.backlog.bySeverity[s]}`).join(' ');
    L.push(`  open backlog: ${t.backlog.count} (${counts})`);
    for (const b of t.backlog.items) L.push(`    [${b.severity}] ${trunc(b.what, 70)} (last seen ${isoDate(b.lastSeen) ?? '?'})`);
  }
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const HELP = `usage: node scripts/context.mjs [--doctor | --trend] [--text] [--stale-days=N] [root]

  (default)  project-state snapshot (JSON; --text for a human block)
  --doctor   drift report — REPORT ONLY, never repairs anything (exit 2 when drift found)
  --trend    critique trend rendering (trajectory, deltas, recurring, regressions, backlog)
  --stale-days=N  doctor "stale critique" threshold in days (default ${DEFAULT_STALE_DAYS})
  root       project directory (default: current working directory)`;

function parseArgs(argv) {
  const opts = { mode: 'default', text: false, staleDays: DEFAULT_STALE_DAYS, root: null };
  for (const arg of argv) {
    if (arg === '--doctor') opts.mode = 'doctor';
    else if (arg === '--trend') opts.mode = 'trend';
    else if (arg === '--text') opts.text = true;
    else if (arg === '--json') { /* JSON is the default */ }
    else if (arg.startsWith('--stale-days=')) {
      const v = Number(arg.slice('--stale-days='.length));
      if (!Number.isFinite(v) || v < 0) throw new Error(`invalid --stale-days value "${arg.slice(13)}"`);
      opts.staleDays = v;
    } else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg.startsWith('-')) throw new Error(`unknown flag "${arg}" (see --help)`);
    else if (opts.root === null) opts.root = arg;
    else throw new Error(`unexpected extra argument "${arg}"`);
  }
  return opts;
}

function main() {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  }
  if (opts.help) { process.stdout.write(`${HELP}\n`); return; }
  const root = path.resolve(opts.root ?? process.cwd());
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    process.stderr.write(`root is not a directory: ${root}\n`);
    process.exit(1);
  }

  if (opts.mode === 'trend') {
    const t = buildTrend(loadSnapshots(root));
    const out = { tool: TOOL, schema: SCHEMA, mode: 'trend', root, ...t };
    process.stdout.write(opts.text ? `${renderTrendText(out)}\n` : `${JSON.stringify(out, null, 2)}\n`);
    return; // exit 0
  }
  if (opts.mode === 'doctor') {
    const doc = buildDoctor(root, opts.staleDays);
    process.stdout.write(opts.text ? `${renderDoctorText(doc)}\n` : `${JSON.stringify(doc, null, 2)}\n`);
    process.exitCode = doc.exitCode;
    return;
  }
  const d = buildDefault(root);
  process.stdout.write(opts.text ? `${renderDefaultText(d)}\n` : `${JSON.stringify(d, null, 2)}\n`);
}

main();
