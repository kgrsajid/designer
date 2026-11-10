#!/usr/bin/env node
/**
 * designer context tests — zero-dependency runner, style of scripts/test.mjs.
 *
 * Covers scripts/context.mjs:
 *   1. default mode output keys + field assertions (good-state, drift-state)
 *   2. --doctor fires exactly the expected drift items (and none in good-state)
 *   3. --trend math: trajectory, renormalization (partial + all-"n/a"),
 *      per-heuristic deltas, recurring findings, regressions (score drop ≥2,
 *      closed→open), open-priority backlog dedup + per-severity counts
 *   4. git: graceful degradation when git is absent (PATH override) or the
 *      root is not a repository; dirty-UI-file + stale-critique detection in
 *      a throwaway temp repository
 *   5. STRICT no-writes guard: every run is wrapped in a content-hash +
 *      directory-mtime comparison of the fixture trees (context.mjs must
 *      never write anything)
 *
 * Exit codes: 0 = all green, 1 = failures.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.dirname(HERE);
const CONTEXT = path.join(HERE, 'context.mjs');
const FIX = path.join(SKILL, 'tests', 'fixtures-context');
const RULES = JSON.parse(fs.readFileSync(path.join(SKILL, 'data', 'rules.json'), 'utf8'));

const FIXTURE_ROOTS = ['good-state', 'drift-state', 'trend-state', 'delta-state'].map((d) => path.join(FIX, d));

let passed = 0, failed = 0;
const failures = [];
function ok(name) { passed++; console.log(`  ok   ${name}`); }
function bad(name, why) { failed++; failures.push(`${name}: ${why}`); console.log(`  FAIL ${name} — ${why}`); }

// ---------------------------------------------------------------------------
// no-writes guard + runner
// ---------------------------------------------------------------------------

function hashTree(dir) {
  const out = {};
  const walk = (d, prefix) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of [...entries].sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      const full = path.join(d, e.name);
      try {
        if (e.isDirectory()) { out[`d:${rel}`] = fs.statSync(full).mtimeMs; walk(full, rel); }
        else if (e.isFile()) out[`f:${rel}`] = createHash('sha256').update(fs.readFileSync(full)).digest('hex');
      } catch { /* raced external change — will surface as a diff if real */ }
    }
  };
  walk(dir, '');
  return out;
}

const snapshotsEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Every context.mjs run goes through here: fixture trees (and any extra dirs)
// are hashed before and after — a strict zero-writes assertion per run.
function runCtx(args, { env, guardDirs = FIXTURE_ROOTS, name = args.join(' ') } = {}) {
  const before = Object.fromEntries(guardDirs.map((d) => [d, hashTree(d)]));
  const r = spawnSync(process.execPath, [CONTEXT, ...args], { encoding: 'utf8', timeout: 30000, ...(env ? { env } : {}) });
  const after = Object.fromEntries(guardDirs.map((d) => [d, hashTree(d)]));
  if (!snapshotsEqual(before, after)) {
    bad(`no-writes [${name}]`, 'context.mjs modified the fixture/project tree');
  }
  return r;
}

function runJson(name, args, opts) {
  const r = runCtx(args, { ...opts, name });
  try { return { status: r.status, j: JSON.parse(r.stdout) }; }
  catch { bad(name, `no JSON parsed (exit ${r.status}): ${String(r.stderr).slice(0, 200)}`); return null; }
}

console.log('designer context test runner\n');

// ---------------------------------------------------------------------------
// 1. default mode — good-state
// ---------------------------------------------------------------------------
console.log('default mode (good-state):');
{
  const r = runJson('default good-state', [path.join(FIX, 'good-state')]);
  if (r?.j) {
    const j = r.j;
    const keys = Object.keys(j).sort().join(',');
    if (keys === ['detector', 'files', 'git', 'lastCritique', 'mode', 'platform', 'root', 'schema', 'sidecar', 'tool'].sort().join(',')) ok('output keys exact');
    else bad('output keys exact', `got ${keys}`);
    if (j.tool === 'designer-context' && j.schema === 1 && j.mode === 'default') ok('tool/schema/mode'); else bad('tool/schema/mode', `${j.tool}/${j.schema}/${j.mode}`);
    const f = j.files;
    if (f['PRODUCT.md'].present === true && f['PRODUCT.md'].schemaStamp === 'valid') ok('PRODUCT.md present + valid stamp'); else bad('PRODUCT.md present + valid stamp', JSON.stringify(f['PRODUCT.md']));
    if (f['DESIGN.md'].present === true && f['DESIGN.md'].schemaStamp === 'valid') ok('DESIGN.md present + valid stamp'); else bad('DESIGN.md present + valid stamp', JSON.stringify(f['DESIGN.md']));
    if (f['.designer/design.json'].present === true && f['.designer/design.json'].parseable === true) ok('design.json present + parseable'); else bad('design.json present + parseable', JSON.stringify(f['.designer/design.json']));
    if (f['.designer/config.json'].present === true && f['.designer/config.json'].parseable === true) ok('config.json present + parseable'); else bad('config.json present + parseable', JSON.stringify(f['.designer/config.json']));
    if (j.platform === 'web — evergreen browsers only, no IE; mobile down to 360px; no offline mode.') ok('platform parsed'); else bad('platform parsed', JSON.stringify(j.platform));
    const lc = j.lastCritique;
    if (lc && lc.timestamp === '2026-11-05T10:00:00.000Z' && lc.nielsenTotal === 31 && lc.nielsenMax === 40 && lc.renormalized === false && lc.openPriorities === 0 && typeof lc.ageDays === 'number' && lc.ageDays >= 0) ok('lastCritique (newest snapshot, score, age)');
    else bad('lastCritique (newest snapshot, score, age)', JSON.stringify(lc));
    if (j.detector.rulesFile === true && j.detector.ruleCount === RULES.rules.length) ok(`detector ruleCount read from rules.json (${RULES.rules.length})`);
    else bad('detector ruleCount', JSON.stringify(j.detector));
    if (JSON.stringify(j.detector.gating) === JSON.stringify(RULES.severityPolicy.gating) && JSON.stringify(j.detector.advisory) === JSON.stringify(RULES.severityPolicy.advisory)) ok('severity policy passed through');
    else bad('severity policy passed through', JSON.stringify(j.detector));
    if (j.sidecar.present === true && j.sidecar.tokenCategories.color === 2) ok('sidecar token categories'); else bad('sidecar token categories', JSON.stringify(j.sidecar));
    if (typeof j.git?.available === 'boolean' && (j.git.available ? Array.isArray(j.git.dirtyUiFiles) : j.git.note === 'git: unavailable')) ok('git section well-formed');
    else bad('git section well-formed', JSON.stringify(j.git));
    if (r.status === 0) ok('exit 0'); else bad('exit 0', `exit ${r.status}`);
  }
}

// default mode --text does not crash and stays human
{
  const r = runCtx(['--text', path.join(FIX, 'good-state')], { name: 'default --text' });
  if (r.status === 0 && r.stdout.includes('designer context —') && r.stdout.includes('platform:')) ok('--text human block'); else bad('--text human block', `exit ${r.status}`);
}

// ---------------------------------------------------------------------------
// 2. default mode — drift-state stamps
// ---------------------------------------------------------------------------
console.log('\ndefault mode (drift-state):');
{
  const r = runJson('default drift-state', [path.join(FIX, 'drift-state')]);
  if (r?.j) {
    if (r.j.files['PRODUCT.md'].schemaStamp === 'missing') ok('PRODUCT.md stamp missing detected'); else bad('PRODUCT.md stamp missing detected', JSON.stringify(r.j.files['PRODUCT.md']));
    if (r.j.files['DESIGN.md'].schemaStamp === 'stale') ok('DESIGN.md stamp stale detected'); else bad('DESIGN.md stamp stale detected', JSON.stringify(r.j.files['DESIGN.md']));
    if (r.j.lastCritique && r.j.lastCritique.nielsenTotal === 19 && r.j.lastCritique.openPriorities === 1) ok('drift-state lastCritique'); else bad('drift-state lastCritique', JSON.stringify(r.j.lastCritique));
  }
}

// ---------------------------------------------------------------------------
// 3. --doctor good-state (nothing may fire)
// ---------------------------------------------------------------------------
console.log('\n--doctor good-state:');
{
  const r = runJson('doctor good-state', ['--doctor', path.join(FIX, 'good-state')]);
  if (r?.j) {
    if (Array.isArray(r.j.items) && r.j.items.length === 0) ok('zero drift items'); else bad('zero drift items', JSON.stringify(r.j.items.map((i) => i.id)));
    if (r.j.exitCode === 0 && r.status === 0) ok('exit 0'); else bad('exit 0', `exit ${r.status}/${r.j.exitCode}`);
    if (r.j.trend && r.j.trend.snapshots === 2) ok('trend embedded in doctor'); else bad('trend embedded in doctor', JSON.stringify(r.j.trend && r.j.trend.snapshots));
  }
}

// ---------------------------------------------------------------------------
// 4. --doctor drift-state (exactly the crafted drift, nothing else)
// ---------------------------------------------------------------------------
console.log('\n--doctor drift-state:');
{
  const r = runJson('doctor drift-state', ['--doctor', path.join(FIX, 'drift-state')]);
  if (r?.j) {
    const got = r.j.items.map((i) => i.id).sort();
    const want = ['brief-orphaned', 'config-ignore-broken', 'critique-backlog', 'design-sidecar-mismatch', 'design-stamp-stale', 'product-stamp-missing'].sort();
    if (got.join(',') === want.join(',')) ok('drift items fire exactly as crafted'); else bad('drift items fire exactly as crafted', `got [${got}] want [${want}]`);
    const by = Object.fromEntries(r.j.items.map((i) => [i.id, i]));
    if (by['product-stamp-missing']?.severity === 'P2' && by['product-stamp-missing']?.tag === 'auto') ok('stamp-missing tagged auto'); else bad('stamp-missing tagged auto', JSON.stringify(by['product-stamp-missing']));
    if (by['design-sidecar-mismatch']?.severity === 'P1' && by['design-sidecar-mismatch']?.tag === 'mention') ok('token mismatch tagged mention'); else bad('token mismatch tagged mention', JSON.stringify(by['design-sidecar-mismatch']));
    if (by['design-sidecar-mismatch']?.message.includes('#111111') && by['design-sidecar-mismatch']?.message.includes('#0f172a')) ok('mismatch names both values'); else bad('mismatch names both values', by['design-sidecar-mismatch']?.message);
    if (by['config-ignore-broken']?.tag === 'auto' && by['config-ignore-broken']?.message.includes('not-a-real-rule')) ok('broken ignore named'); else bad('broken ignore named', JSON.stringify(by['config-ignore-broken']));
    if (by['brief-orphaned']?.message.includes('pricing.html')) ok('orphaned brief names target'); else bad('orphaned brief names target', JSON.stringify(by['brief-orphaned']));
    if (r.j.items.every((i) => ['auto', 'mention', 'route'].includes(i.tag) && ['P0', 'P1', 'P2', 'P3'].includes(i.severity))) ok('every item severity+tag tagged'); else bad('every item severity+tag tagged', 'untagged item present');
    if (!r.j.items.some((i) => i.id === 'critique-stale')) ok('stale-critique correctly NOT fired (no dirty UI files)'); else bad('stale-critique correctly NOT fired', 'fired without dirty UI files');
    if (r.j.exitCode === 2 && r.status === 2) ok('exit 2 on drift'); else bad('exit 2 on drift', `exit ${r.status}/${r.j.exitCode}`);
    if (r.j.summary && r.j.summary.total === r.j.items.length) ok('summary counts'); else bad('summary counts', JSON.stringify(r.j.summary));
  }
}

// ---------------------------------------------------------------------------
// 5. --trend trend-state (4 crafted snapshots)
// ---------------------------------------------------------------------------
console.log('\n--trend trend-state:');
{
  const r = runJson('trend trend-state', ['--trend', path.join(FIX, 'trend-state')]);
  if (r?.j) {
    const t = r.j;
    if (t.snapshots === 4 && t.skipped === 1) ok('4 snapshots loaded, 1 foreign skipped'); else bad('4 snapshots loaded, 1 foreign skipped', `${t.snapshots}/${t.skipped}`);
    const totals = t.trajectory.map((x) => x.nielsenTotal);
    const maxes = t.trajectory.map((x) => x.nielsenMax);
    const renorm = t.trajectory.map((x) => x.renormalized);
    const dates = t.trajectory.map((x) => x.date);
    if (JSON.stringify(totals) === JSON.stringify([26, 24, 30, 0])) ok('score trajectory 26→24→30→0'); else bad('score trajectory 26→24→30→0', JSON.stringify(totals));
    if (JSON.stringify(maxes) === JSON.stringify([40, 40, 40, 0]) && JSON.stringify(renorm) === JSON.stringify([false, false, false, true])) ok('all-"n/a" renormalization (max 40→0, flagged)'); else bad('all-"n/a" renormalization', `${maxes}/${renorm}`);
    if (JSON.stringify(dates) === JSON.stringify(['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22'])) ok('trajectory ordered by timestamp with dates'); else bad('trajectory ordered by timestamp with dates', JSON.stringify(dates));
    const d = t.deltasLastTwo;
    if (d && d.total === -30 && JSON.stringify(d.perHeuristic) === '{}' && d.naSkipped === 10) ok('last-two deltas skip n/a pairs (total −30)'); else bad('last-two deltas skip n/a pairs', JSON.stringify(d));
    const recA = t.recurring.find((x) => x.normalized.startsWith('buttons render pure gray'));
    const recB = t.recurring.find((x) => x.normalized.startsWith('focus ring missing'));
    if (recA && recA.seenIn === 3 && recB && recB.seenIn === 2 && t.recurring.length === 2) ok('recurring findings (×3 gray-on-color, ×2 focus ring)'); else bad('recurring findings', JSON.stringify(t.recurring));
    const drops = t.regressions.filter((x) => x.type === 'score-drop');
    const reopens = t.regressions.filter((x) => x.type === 'reopened');
    if (drops.length === 2 && drops[0].drop === 2 && drops[1].drop === 30) ok('REGRESSION score drops named (−2 and −30)'); else bad('REGRESSION score drops named', JSON.stringify(drops));
    if (reopens.length === 1 && reopens[0].closed === '2026-10-01T09:00:00.000Z' && reopens[0].reopened === '2026-10-15T09:00:00.000Z') ok('REGRESSION closed→open named'); else bad('REGRESSION closed→open named', JSON.stringify(reopens));
    if (t.regressions.every((x) => x.message.startsWith('REGRESSION:'))) ok('regressions named out loud'); else bad('regressions named out loud', 'message without REGRESSION: prefix');
    const b = t.backlog;
    if (b.count === 2 && b.bySeverity.P1 === 1 && b.bySeverity.P3 === 1 && b.bySeverity.P0 === 0 && b.items[0].severity === 'P1') ok('open backlog deduped, counts per severity'); else bad('open backlog deduped, counts per severity', JSON.stringify(b));
    if (b.items.some((x) => x.what.startsWith('Body copy set at 12px')) && !b.items.some((x) => x.what.startsWith('Buttons render pure gray'))) ok('backlog carries forward still-open, drops closed'); else bad('backlog carries forward still-open, drops closed', JSON.stringify(b.items));
  }
}

// ---------------------------------------------------------------------------
// 6. --trend delta-state (numeric deltas + partial n/a renormalization)
// ---------------------------------------------------------------------------
console.log('\n--trend delta-state:');
{
  const r = runJson('trend delta-state', ['--trend', path.join(FIX, 'delta-state')]);
  if (r?.j) {
    const t = r.j;
    const totals = t.trajectory.map((x) => x.nielsenTotal);
    const maxes = t.trajectory.map((x) => x.nielsenMax);
    if (JSON.stringify(totals) === JSON.stringify([23, 28]) && JSON.stringify(maxes) === JSON.stringify([36, 40]) && t.trajectory[0].renormalized === true && t.trajectory[1].renormalized === false) ok('partial n/a renormalizes max 40→36'); else bad('partial n/a renormalizes max 40→36', `${totals}/${maxes}`);
    const d = t.deltasLastTwo;
    if (d && d.total === 5 && d.perHeuristic.aesthetic === 1 && d.perHeuristic.error === 1 && d.perHeuristic.match === 0 && !('visibility' in d.perHeuristic) && d.naSkipped === 1) ok('per-heuristic deltas (+1 aesthetic, +1 error, n/a skipped)'); else bad('per-heuristic deltas', JSON.stringify(d));
    if (t.backlog.count === 1 && t.backlog.bySeverity.P2 === 1) ok('delta-state backlog'); else bad('delta-state backlog', JSON.stringify(t.backlog));
    if (r.status === 0) ok('exit 0'); else bad('exit 0', `exit ${r.status}`);
  }
}

// ---------------------------------------------------------------------------
// 7. doctor on trend-state (backlog item + embedded trend regressions)
// ---------------------------------------------------------------------------
console.log('\n--doctor trend-state (embeds trend):');
{
  const r = runJson('doctor trend-state', ['--doctor', path.join(FIX, 'trend-state')]);
  if (r?.j) {
    const ids = r.j.items.map((i) => i.id);
    if (ids.length === 1 && ids[0] === 'critique-backlog') ok('only backlog item fires'); else bad('only backlog item fires', JSON.stringify(ids));
    if (r.j.trend && r.j.trend.regressions.length === 3) ok('doctor embeds trend regressions'); else bad('doctor embeds trend regressions', JSON.stringify(r.j.trend && r.j.trend.regressions.length));
  }
}

// ---------------------------------------------------------------------------
// 8. git behavior
// ---------------------------------------------------------------------------
console.log('\ngit behavior:');
{
  // a. git absent — PATH override in the spawn env
  const r = runJson('git absent (PATH override)', [path.join(FIX, 'good-state')], { env: { ...process.env, PATH: '/nonexistent-designer-test' } });
  if (r?.j) {
    if (r.j.git.available === false && r.j.git.note === 'git: unavailable') ok('git absent → graceful "git: unavailable"'); else bad('git absent → graceful', JSON.stringify(r.j.git));
    if (r.status === 0) ok('default mode still exits 0 without git'); else bad('default mode still exits 0 without git', `exit ${r.status}`);
  }
  // b. not a repository
  const tmpPlain = fs.mkdtempSync(path.join(os.tmpdir(), 'designer-ctx-plain-'));
  fs.writeFileSync(path.join(tmpPlain, 'index.html'), '<p>no repo here</p>\n');
  const r2 = runJson('git non-repo root', ['--doctor', tmpPlain], { guardDirs: [tmpPlain] });
  if (r2?.j) {
    if (r2.j.items.some((i) => i.id === 'product-md-missing')) ok('doctor routes missing PRODUCT.md to init'); else bad('doctor routes missing PRODUCT.md to init', JSON.stringify(r2.j.items));
    if (!r2.j.items.some((i) => i.id === 'critique-stale')) ok('no stale-critique without git'); else bad('no stale-critique without git', 'fired without git');
  }
  fs.rmSync(tmpPlain, { recursive: true, force: true });

  // c. real throwaway repository: dirty UI file + stale snapshot → critique-stale
  if (spawnSync('git', ['--version']).status === 0) {
    const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'designer-ctx-repo-'));
    fs.mkdirSync(path.join(tmpRepo, '.designer', 'critique'), { recursive: true });
    spawnSync('git', ['init', '-q', tmpRepo]);
    fs.writeFileSync(path.join(tmpRepo, 'index.html'), '<p>dirty</p>\n');
    fs.writeFileSync(path.join(tmpRepo, 'PRODUCT.md'), '<!-- designer:product-schema 1 -->\n# PRODUCT.md\n');
    fs.writeFileSync(path.join(tmpRepo, '.designer', 'critique', '2026-01-05T12-00-00Z.json'), JSON.stringify({
      schema: 'designer:critique-snapshot 1',
      timestamp: '2026-01-05T12:00:00.000Z',
      surface: 'index.html', mode: 'work', verdict: 'old run',
      scores: { nielsenTotal: 10, nielsenMax: 40, renormalized: false, perHeuristic: { visibility: 1 } },
      priorities: [], fingerprint: { algo: 'sha256', head8: 'deadbeef', bytes: 10 },
      provenance: { detectorRun: true, degraded: null }, recommendedSequence: [],
    }));
    const r3 = runJson('git repo dirty + stale', ['--doctor', tmpRepo], { guardDirs: [tmpRepo] });
    if (r3?.j) {
      if (r3.j.items.some((i) => i.id === 'critique-stale' && i.tag === 'route')) ok('stale critiqued state + dirty UI files → route to critique'); else bad('stale critiqued state → route', JSON.stringify(r3.j.items));
    }
    const r4 = runJson('git repo dirty default', [tmpRepo], { guardDirs: [tmpRepo] });
    if (r4?.j) {
      if (r4.j.git.available === true && r4.j.git.dirtyUiFiles.includes('index.html') && r4.j.git.dirtyCount >= 1) ok('git-dirty UI files listed'); else bad('git-dirty UI files listed', JSON.stringify(r4.j.git));
    }
    // --stale-days configurable: huge threshold suppresses the stale item
    const r5 = runJson('stale-days configurable', ['--doctor', '--stale-days=100000', tmpRepo], { guardDirs: [tmpRepo] });
    if (r5?.j) {
      if (!r5.j.items.some((i) => i.id === 'critique-stale') && r5.j.staleDays === 100000) ok('--stale-days=N suppresses stale item'); else bad('--stale-days=N suppresses stale item', JSON.stringify(r5.j.items.map((i) => i.id)));
    }
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  } else {
    console.log('  skip git-repo section (git not on PATH)');
  }
}

// ---------------------------------------------------------------------------
// 9. CLI surface
// ---------------------------------------------------------------------------
console.log('\nCLI surface:');
{
  const r = runCtx(['--nonsense'], { name: 'unknown flag' });
  if (r.status === 1 && r.stderr.includes('unknown flag')) ok('unknown flag → exit 1'); else bad('unknown flag → exit 1', `exit ${r.status}`);
  const h = runCtx(['--help'], { name: '--help' });
  if (h.status === 0 && h.stdout.includes('--doctor') && h.stdout.includes('--trend')) ok('--help'); else bad('--help', `exit ${h.status}`);
  const t = runCtx(['--trend', '--text', path.join(FIX, 'trend-state')], { name: 'trend --text' });
  if (t.status === 0 && t.stdout.includes('REGRESSION:') && t.stdout.includes('open backlog:')) ok('--trend --text renders regressions + backlog'); else bad('--trend --text renders', `exit ${t.status}`);
  const d = runCtx(['--doctor', '--text', path.join(FIX, 'drift-state')], { name: 'doctor --text' });
  if (d.status === 2 && d.stdout.includes('[P1][mention] design-sidecar-mismatch') && d.stdout.includes('REPORT ONLY')) ok('--doctor --text severity-tagged lines'); else bad('--doctor --text severity-tagged lines', `exit ${d.status}`);
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log(failures.map((f) => `  - ${f}`).join('\n')); process.exit(1); }
process.exit(0);
