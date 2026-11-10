#!/usr/bin/env node
/**
 * designer test runner — zero-dependency.
 *
 * 1. Fixture pairs for EVERY v1-source rule (read from data/rules.json — no
 *    hard-coded rule list): flag.html must trigger exactly that rule,
 *    pass.html must yield zero findings. Exit code 2 is asserted for gating
 *    severities (blocker|warning); advisory rules (polish|informational)
 *    assert exit 0 WITH the finding present — advisories never gate the exit
 *    code (binding severity policy from the blueprint).
 * 2. --json schema check (findings + activeIgnores shape).
 * 3. --list-rules completeness (registry read from rules.json only).
 * 4. Inline-ignore check (oversized-h1 fixture carries a disable region).
 * 4b. Ignore-with-reason round-trip (documented triage syntax, CSS + HTML).
 * 4c. CLI robustness: unknown flag / invalid --scope -> clean usage + exit 1;
 *     rule-category names work as --scope filters.
 * 4d. Stray '}' in CSS is noise, not a scan failure.
 * 5. Utility-class expansion check (bg-blue-500 passes, bg-[#7c3aed] flags).
 * 6. Perf smoke: ~5000-line synthetic CSS scans in <1s.
 * 6b. Perf gate: ~200KB synthetic HTML scans in <1s (line lookup must stay O(log n)).
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.dirname(HERE);
const DETECT = path.join(HERE, 'detect.mjs');
const RULES = JSON.parse(fs.readFileSync(path.join(SKILL, 'data', 'rules.json'), 'utf8'));
const ADVISORY = RULES.severityPolicy.advisory;

let passed = 0, failed = 0;
const failures = [];

function ok(name) { passed++; console.log(`  ok   ${name}`); }
function bad(name, why) { failed++; failures.push(`${name}: ${why}`); console.log(`  FAIL ${name} — ${why}`); }

function runDetect(args) {
  const r = spawnSync(process.execPath, [DETECT, ...args], { encoding: 'utf8', timeout: 30000 });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

// ---------------------------------------------------------------------------
console.log('designer test runner\n');

// 1. fixture pairs ------------------------------------------------------------
console.log('fixture pairs (every v1-source rule):');
const v1Rules = RULES.rules.filter((r) => r.status === 'v1-source');
if (v1Rules.length === 0) bad('v1 rules present', 'rules.json has no v1-source rules');

for (const rule of v1Rules) {
  const dir = path.join(SKILL, 'tests', 'fixtures', rule.id);
  const flag = path.join(dir, 'flag.html');
  const pass = path.join(dir, 'pass.html');
  if (!fs.existsSync(flag) || !fs.existsSync(pass)) { bad(rule.id, 'missing fixture pair'); continue; }

  const fr = runDetect(['--json', flag]);
  let fj = null;
  try { fj = JSON.parse(fr.stdout); } catch { bad(rule.id, `flag run produced no JSON (exit ${fr.status}): ${fr.stderr.slice(0, 200)}`); continue; }
  const flagRules = [...new Set(fj.findings.map((f) => f.rule))];
  if (!fj.findings.some((f) => f.rule === rule.id)) { bad(rule.id, `flag.html does not trigger it (got: ${flagRules.join(',') || 'nothing'})`); continue; }
  if (flagRules.length !== 1 || flagRules[0] !== rule.id) { bad(rule.id, `flag.html triggers other rules too: ${flagRules.join(',')}`); continue; }
  const expectedExit = ADVISORY.includes(rule.severity) ? 0 : 2;
  if (fj.exitCode !== expectedExit) { bad(rule.id, `flag exit ${fj.exitCode}, expected ${expectedExit} (severity ${rule.severity})`); continue; }

  const pr = runDetect(['--json', pass]);
  let pj = null;
  try { pj = JSON.parse(pr.stdout); } catch { bad(rule.id, `pass run produced no JSON (exit ${pr.status})`); continue; }
  if (pr.status !== 0 || pj.exitCode !== 0) { bad(rule.id, `pass.html exits ${pj.exitCode} with findings: ${pj.findings.map((f) => f.rule).join(',')}`); continue; }
  if (pj.findings.length !== 0) { bad(rule.id, `pass.html has findings: ${pj.findings.map((f) => f.rule).join(',')}`); continue; }
  ok(rule.id);
}

// 2. --json schema --------------------------------------------------------------
console.log('\n--json schema:');
{
  const r = runDetect(['--json', path.join(SKILL, 'tests', 'fixtures', 'gray-on-color', 'flag.html')]);
  let j = null;
  try { j = JSON.parse(r.stdout); } catch { bad('json parse', 'no JSON'); }
  if (j) {
    const top = ['tool', 'files', 'findings', 'counts', 'activeIgnores', 'exitCode'];
    const missingTop = top.filter((k) => !(k in j));
    if (missingTop.length) bad('json top-level', `missing keys: ${missingTop.join(',')}`);
    else ok('json top-level keys');
    const fkeys = ['file', 'line', 'rule', 'severity', 'message', 'evidence'];
    const badFindings = j.findings.filter((f) => fkeys.some((k) => !(k in f)));
    if (badFindings.length) bad('json finding shape', `${badFindings.length} findings missing keys`);
    else ok('json finding keys');
    if (!Array.isArray(j.activeIgnores)) bad('json activeIgnores', 'not an array');
    else ok('json activeIgnores array');
  }
}

// 3. --list-rules completeness ---------------------------------------------------
console.log('\n--list-rules completeness:');
{
  const r = runDetect(['--list-rules', '--json']);
  let j = null;
  try { j = JSON.parse(r.stdout); } catch { bad('list-rules json', 'no JSON'); }
  if (j) {
    const expected = RULES.rules.map((r2) => r2.id).sort().join(',');
    const got = j.rules.map((r2) => r2.id).sort().join(',');
    if (expected !== got) bad('list-rules ids', `registry mismatch (${j.rules.length} printed vs ${RULES.rules.length} in rules.json)`);
    else ok(`all ${RULES.rules.length} rule ids listed`);
    const missingStatus = RULES.rules.filter((r2) => !j.rules.find((x) => x.id === r2.id && x.status === r2.status));
    if (missingStatus.length) bad('list-rules statuses', `status mismatch: ${missingStatus.map((r2) => r2.id).join(',')}`);
    else ok('every rule carries its status');
  }
}

// 4. inline ignores ---------------------------------------------------------------
console.log('\ninline ignores:');
{
  const r = runDetect(['--json', path.join(SKILL, 'tests', 'fixtures', 'oversized-h1', 'flag.html')]);
  const j = JSON.parse(r.stdout);
  const ig = j.activeIgnores.find((x) => x.rule === 'flat-type-hierarchy');
  if (!ig) bad('ignore listed', 'activeIgnores lacks flat-type-hierarchy region');
  else ok('ignore region listed in --json');
  if (j.findings.some((f) => f.rule === 'flat-type-hierarchy')) bad('ignore suppresses', 'flat-type-hierarchy fired despite disable region');
  else ok('disable region suppressed the rule');
  if (!j.findings.some((f) => f.rule === 'oversized-h1')) bad('ignore scoped', 'disable region suppressed oversized-h1 too');
  else ok('ignore stays scoped to its rule');
}

// 4b. ignore-with-reason round-trip (the documented triage syntax) -------------------
console.log('\nignore-with-reason round-trip (CSS + HTML):');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'designer-ig-'));

  // CSS: /* designer-lint-disable overused-font: Inter is the brand font — DESIGN.md Typography */
  const css = [
    '/* designer-lint-disable overused-font: Inter is the brand font — DESIGN.md Typography */',
    '.hero{font-family:Inter,sans-serif}',
    '/* designer-lint-enable */',
  ].join('\n');
  fs.writeFileSync(path.join(tmp, 'a.css'), css);
  const cr = runDetect(['--json', path.join(tmp, 'a.css')]);
  const cj = JSON.parse(cr.stdout);
  const cig = cj.activeIgnores[0];
  if (!cig || cig.rule !== 'overused-font') bad('css ignore reason', `activeIgnores rule is "${cig?.rule}" — reason not stripped from rule id`);
  else if (cig.reason !== 'Inter is the brand font — DESIGN.md Typography') bad('css ignore reason', `reason echoed as "${cig.reason}"`);
  else if (cj.findings.some((f) => f.rule === 'overused-font') || cig.suppressed !== 1) bad('css ignore reason', `suppression broken (suppressed=${cig.suppressed}, findings=${cj.findings.map((f) => f.rule).join(',')})`);
  else ok('CSS: reason stripped from rule id, echoed, suppression works');

  // HTML: <!-- designer-lint-disable tiny-text: legal smallprint per DESIGN.md -->
  const html = [
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head><body>',
    '<!-- designer-lint-disable tiny-text, overused-font: deliberate demo pair -->',
    '<style>.x{font-size:11px;font-family:Inter,sans-serif}</style>',
    '<!-- designer-lint-enable -->',
    '</body></html>',
  ].join('\n');
  fs.writeFileSync(path.join(tmp, 'b.html'), html);
  const hr = runDetect(['--json', path.join(tmp, 'b.html')]);
  const hj = JSON.parse(hr.stdout);
  const hig = hj.activeIgnores.find((x) => x.rule && x.rule.includes('tiny-text'));
  if (!hig || hig.rule !== 'tiny-text,overused-font') bad('html ignore list', `activeIgnores rule is "${hig?.rule}" — comma list / reason not parsed`);
  else if (hig.reason !== 'deliberate demo pair') bad('html ignore list', `reason echoed as "${hig.reason}"`);
  else if (hig.suppressed !== 2) bad('html ignore list', `expected 2 suppressions, got ${hig.suppressed}`);
  else ok('HTML: comma-separated list + reason parsed, both rules suppressed');
  fs.rmSync(tmp, { recursive: true, force: true });
}

// 4c. CLI robustness ------------------------------------------------------------------
console.log('\nCLI robustness:');
{
  const uf = runDetect(['--frobnicate', 'x.html']);
  if (uf.status !== 1 || /at \w+ \(/.test(uf.stderr)) bad('unknown flag', `exit ${uf.status}, stack-trace-looking stderr: ${uf.stderr.slice(0, 80)}`);
  else ok('unknown flag -> clean usage + exit 1');

  const bs = runDetect(['--scope=bogus', 'x.html']);
  if (bs.status !== 1 || /at \w+ \(/.test(bs.stderr)) bad('invalid scope', `exit ${bs.status}, stderr: ${bs.stderr.slice(0, 80)}`);
  else ok('invalid --scope -> clean usage + exit 1');

  const cat = runDetect(['--json', '--scope=slop', path.join(SKILL, 'tests', 'fixtures', 'marquee', 'flag.html')]);
  let catj = null; try { catj = JSON.parse(cat.stdout); } catch {}
  if (!catj || !catj.findings.some((f) => f.rule === 'marquee')) bad('category scope filter', 'slop category filter dropped the marquee (slop) finding');
  else {
    const q = runDetect(['--json', '--scope=quality', path.join(SKILL, 'tests', 'fixtures', 'marquee', 'flag.html')]);
    const qj = JSON.parse(q.stdout);
    if (qj.findings.length !== 0) bad('category scope filter', `quality filter still fired: ${qj.findings.map((f) => f.rule).join(',')}`);
    else ok('category names accepted as --scope filters');
  }
}

// 4d. stray-brace resilience ------------------------------------------------------------
console.log('\nstray-brace resilience:');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'designer-brace-'));
  const file = path.join(tmp, 'stray.css');
  fs.writeFileSync(file, '.a{color:#333}\n}\n.b{padding:6px;background:#eee}\n');
  const r = runDetect(['--json', file]);
  let j = null; try { j = JSON.parse(r.stdout); } catch {}
  if (!j || j.exitCode === 1 || j.errors.length) bad('stray brace', `exit ${j?.exitCode}, errors: ${(j?.errors || []).join('; ')}`);
  else ok(`stray '}' treated as noise (exit ${j.exitCode}, ${j.findings.length} finding(s))`);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// 5. utility-class expansion --------------------------------------------------------
console.log('\nutility-class expansion:');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'designer-ut-'));
  fs.mkdirSync(path.join(tmp, '.designer'));
  fs.writeFileSync(path.join(tmp, '.designer', 'design.json'), JSON.stringify({ version: 1, tokens: { color: ['#1d4ed8'] } }));
  fs.writeFileSync(path.join(tmp, 'token.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head><body><div class="bg-blue-500 text-white p-4 rounded-lg shadow-md">Cards</div></body></html>');
  fs.writeFileSync(path.join(tmp, 'literal.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head><body><div class="bg-[#7c3aed]">Cards</div></body></html>');

  const tr = runDetect(['--json', path.join(tmp, 'token.html')]);
  const tj = JSON.parse(tr.stdout);
  const dsHits = tj.findings.filter((f) => f.rule.startsWith('design-system-'));
  if (dsHits.length) bad('utility token pass', `token utilities flagged: ${dsHits.map((f) => f.rule + ' ' + f.evidence).join('; ')}`);
  else ok('mapped utility classes pass design-system rules');

  const lr = runDetect(['--json', path.join(tmp, 'literal.html')]);
  const lj = JSON.parse(lr.stdout);
  if (!lj.findings.some((f) => f.rule === 'ai-color-palette')) bad('arbitrary literal flag', 'bg-[#7c3aed] did not hit ai-color-palette');
  else ok('arbitrary-value utility carries its literal into checking');
  fs.rmSync(tmp, { recursive: true, force: true });
}

// 6. perf smoke -----------------------------------------------------------------------
console.log('\nperf smoke (~5000-line CSS, must scan in <1s):');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'designer-perf-'));
  const file = path.join(tmp, 'big.css');
  const chunks = [];
  for (let i = 0; i < 1000; i++) {
    const pad = [4, 8, 12, 16, 24, 32][i % 6];
    chunks.push(`.c${i} {\n  padding: ${pad}px;\n  margin: ${pad / 2}px;\n  color: #${((i * 7919) % 0xffffff).toString(16).padStart(6, '0')};\n  border-radius: ${(i % 4) * 2}px;\n  transition: opacity .2s ease;\n}\n`);
  }
  fs.writeFileSync(file, chunks.join(''));
  const lines = fs.readFileSync(file, 'utf8').split('\n').length;
  const t0 = Date.now();
  const r = runDetect(['--json', file]);
  const dt = Date.now() - t0;
  if (![0, 2].includes(r.status)) bad('perf scan', `exit ${r.status}`);
  else if (dt >= 1000) bad('perf smoke', `${lines}-line CSS took ${dt}ms (>= 1s)`);
  else ok(`${lines}-line CSS scanned in ${dt}ms`);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// 6b. HTML perf gate (line numbers must be O(log n): ~200KB HTML in <1s) ---------------
console.log('\nperf gate (~200KB HTML, must scan in <1s):');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'designer-perf-html-'));
  const file = path.join(tmp, 'big.html');
  const parts = ['<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head><body>\n<style>\n.base{color:#333;font-size:14px}\n</style>\n'];
  for (let i = 0; i < 1500; i++) {
    parts.push(`<div class="row r${i}" style="padding:8px;color:#333"><h2>Section ${i} heading</h2><p class="copy">Body copy for section ${i} with some ordinary words that keep the scanner busy across the whole file.</p><img src="i${i}.png" alt="x"></div>\n`);
  }
  parts.push('</body></html>\n');
  fs.writeFileSync(file, parts.join(''));
  const bytes = fs.statSync(file).size;
  const t0 = Date.now();
  const r = runDetect(['--json', file]);
  const dt = Date.now() - t0;
  if (![0, 2].includes(r.status)) bad('perf html scan', `exit ${r.status}: ${r.stderr.slice(0, 120)}`);
  else if (dt >= 1000) bad('perf gate', `${(bytes / 1024).toFixed(0)}KB HTML took ${dt}ms (>= 1s) — line lookup is quadratic again`);
  else ok(`${(bytes / 1024).toFixed(0)}KB HTML scanned in ${dt}ms`);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log('\nfailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
