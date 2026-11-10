#!/usr/bin/env node
/**
 * designer-detect — source-rule antipattern detector for the "designer" skill.
 *
 * Zero-dependency Node >= 20. No network, no binary, no telemetry, no shell exec.
 * Single pass per file; a rule fires ONLY on what the file itself proves
 * (no cascade/inheritance resolution, no @import following, no cross-file
 * inference — the only cross-file input is the project design-token sidecar,
 * which gates the design-system rules).
 *
 * All rule metadata (ids, severities, scopes, tiers, statuses, thresholds)
 * lives in ../data/rules.json — the single source of truth, read at runtime.
 *
 * Exit codes: 0 = clean, 2 = gating findings (blocker|warning), 1 = scan failure.
 * Advisory findings (polish|informational) never gate the exit code.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.dirname(SCRIPT_DIR);

// ---------------------------------------------------------------------------
// Data (single source of truth)
// ---------------------------------------------------------------------------

const RULESET = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'data', 'rules.json'), 'utf8'));
let UTILITY = null;
try {
  UTILITY = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'data', 'utility-classes.json'), 'utf8'));
} catch {
  UTILITY = null;
}

const ADVISORY_SEVERITIES = RULESET.severityPolicy.advisory; // polish|informational
const GATING_SEVERITIES = RULESET.severityPolicy.gating;     // blocker|warning
const SCAN_EXTS = new Set(['.html', '.htm', '.css', '.scss', '.less', '.vue', '.svelte', '.jsx', '.tsx', '.ts', '.js', '.astro']);
const MARKUP_EXTS = new Set(['.html', '.htm', '.vue', '.svelte', '.jsx', '.tsx', '.astro']);
const CSS_EXTS = new Set(['.css', '.scss', '.less']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.cache']);

// --scope vocabulary: the two proof scopes + 'all' + every rule category in rules.json.
const SCOPE_VALUES = ['css', 'html', 'all', ...new Set(RULESET.rules.map((r) => r.category))];

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { json: false, listRules: false, scope: 'all', noAdvisory: false, noDesignSystem: false, files: [] };
  for (const arg of argv) {
    if (arg === '--json') opts.json = true;
    else if (arg === '--list-rules') opts.listRules = true;
    else if (arg.startsWith('--scope=')) {
      const v = arg.slice('--scope='.length);
      if (!SCOPE_VALUES.includes(v)) throw new Error(`invalid --scope value "${v}" (${SCOPE_VALUES.join('|')})`);
      opts.scope = v;
    } else if (arg === '--no-advisory') opts.noAdvisory = true;
    else if (arg === '--no-design-system') opts.noDesignSystem = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg.startsWith('--')) throw new Error(`unknown flag "${arg}"`);
    else opts.files.push(arg);
  }
  return opts;
}

const USAGE = `designer-detect — source-rule antipattern detector (zero deps, zero network)

usage: node detect.mjs [flags] <files-or-dirs...>

flags:
  --json               machine-readable output to stdout (human text goes to stderr)
  --list-rules         print the rule registry (from data/rules.json) and exit
  --scope=<v>          run only matching rules: css|html|all, or a rule category
                       from data/rules.json (e.g. slop|quality) as a filter
  --no-advisory        suppress advisory rules (polish|informational)
  --no-design-system   disable the design-system drift rules (sidecar-gated)
  --help               this help

inline ignores:
  CSS:  /* designer-lint-disable rule-id[, rule-id2|*]: reason */ ... /* designer-lint-enable */
  HTML: <!-- designer-lint-disable rule-id[, rule-id2|*]: reason --> ... <!-- designer-lint-enable -->
  The rule list accepts comma/space-separated ids or the '*' wildcard; a trailing
  ': reason' after the rule list is stripped and echoed in --json activeIgnores.

exit codes: 0 clean · 2 gating findings (blocker|warning) · 1 scan failure`;

// ---------------------------------------------------------------------------
// Color + length utilities
// ---------------------------------------------------------------------------

const NAMED_COLORS = {
  black: '#000000', white: '#ffffff', silver: '#c0c0c0', gray: '#808080', grey: '#808080',
  dimgray: '#696969', dimgrey: '#696969', darkgray: '#a9a9a9', darkgrey: '#a9a9a9',
  lightgray: '#d3d3d3', lightgrey: '#d3d3d3', gainsboro: '#dcdcdc', whitesmoke: '#f5f5f5',
  red: '#ff0000', crimson: '#dc143c', darkred: '#8b0000', firebrick: '#b22222',
  tomato: '#ff6347', coral: '#ff7f50', salmon: '#fa8072', darksalmon: '#e9967a',
  lightsalmon: '#ffa07a', orangered: '#ff4500', indianred: '#cd5c5c', pink: '#ffc0cb',
  lightpink: '#ffb6c1', hotpink: '#ff69b4', deeppink: '#ff1493', palevioletred: '#db7093',
  gold: '#ffd700', yellow: '#ffff00', lightyellow: '#ffffe0', lemonchiffon: '#fffacd',
  ivory: '#fffff0', beige: '#f5f5dc', cornsilk: '#fff8dc', antiquewhite: '#faebd7',
  linen: '#faf0e6', bisque: '#ffe4c4', wheat: '#f5deb3', moccasin: '#ffe4b5',
  navajowhite: '#ffdead', papayawhip: '#ffefd5', blanchedalmond: '#ffebcd', peachpuff: '#ffdab9',
  orange: '#ffa500', darkorange: '#ff8c00', tan: '#d2b48c', rosybrown: '#bc8f8f',
  peru: '#cd853f', chocolate: '#d2691e', sienna: '#a0522d', brown: '#a52a2a',
  saddlebrown: '#8b4513', sandybrown: '#f4a460', burlywood: '#deb887',
  navy: '#000080', blue: '#0000ff', royalblue: '#4169e1', midnightblue: '#191970',
  steelblue: '#4682b4', dodgerblue: '#1e90ff', deepskyblue: '#00bfff', skyblue: '#87ceeb',
  lightskyblue: '#87cefa', cornflowerblue: '#6495ed', aliceblue: '#f0f8ff',
  lightblue: '#add8e6', powderblue: '#b0e0e6', lightsteelblue: '#b0c4de',
  indigo: '#4b0082', slateblue: '#6a5acd', mediumslateblue: '#7b68ee', rebeccapurple: '#663399',
  purple: '#800080', darkviolet: '#9400d3', darkmagenta: '#8b008b', mediumpurple: '#9370db',
  blueviolet: '#8a2be2', violet: '#ee82ee', plum: '#dda0dd', orchid: '#da70d6',
  magenta: '#ff00ff', fuchsia: '#ff00ff', mediumorchid: '#ba55d3', darkorchid: '#9932cc',
  lavender: '#e6e6fa', lavenderblush: '#fff0f5', thistle: '#d8bfd8', ghostwhite: '#f8f8ff',
  green: '#008000', darkgreen: '#006400', seagreen: '#2e8b57', mediumseagreen: '#3cb371',
  forestgreen: '#228b22', limegreen: '#32cd32', lime: '#00ff00', lawngreen: '#7cfc00',
  springgreen: '#00ff7f', mediumspringgreen: '#00fa9a', darkslategray: '#2f4f4f',
  darkslategrey: '#2f4f4f', teal: '#008080', darkcyan: '#008b8b', lightseagreen: '#20b2aa',
  cadetblue: '#5f9ea0', turquoise: '#40e0d0', mediumturquoise: '#48d1cc', aqua: '#00ffff',
  cyan: '#00ffff', aquamarine: '#7fffd4', lightcyan: '#e0ffff', paleturquoise: '#afeeee',
  palegreen: '#98fb98', darkolivegreen: '#556b2f', olivedrab: '#6b8e23', olive: '#808000',
  yellowgreen: '#9acd32', greenyellow: '#adff2f', chartreuse: '#7fff00',
  darkseagreen: '#8fbc8f', lightgreen: '#90ee90', mintcream: '#f5fffa', honeydew: '#f0fff0',
  azure: '#f0ffff', lightgoldenrodyellow: '#fafad2', khaki: '#f0e68c', darkkhaki: '#bdb76b',
};

function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 && h.length !== 8) return null;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return { r: r / 255, g: g / 255, b: b / 255, a };
}

function rgbToHsl({ r, g, b, a }) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l, a: a ?? 1 };
}

/** Parse a single color literal. Returns {h,s,l,a,hex} or null (unprovable). */
function parseColor(str) {
  if (!str) return null;
  const s = str.trim().toLowerCase();
  if (!s || s === 'transparent' || s === 'currentcolor' || s === 'inherit' || s === 'none' || s === 'initial') return null;
  if (s.startsWith('#')) {
    const rgb = hexToRgb(s);
    if (!rgb) return null;
    const c = rgbToHsl(rgb);
    return { ...c, hex: s.toLowerCase() };
  }
  const fn = s.match(/^(rgba?|hsla?)\(([\s\S]*)\)$/);
  if (fn) {
    const parts = fn[2].split(/[,/\s]+/).filter(Boolean).map((p) => p.trim());
    let rgb = null;
    if (fn[1].startsWith('rgb')) {
      const conv = (p) => (p.endsWith('%') ? parseFloat(p) / 100 : parseFloat(p) / 255);
      rgb = { r: conv(parts[0]), g: conv(parts[1]), b: conv(parts[2]), a: parts[3] !== undefined ? parseFloat(parts[3]) : 1 };
    } else {
      const h = parseFloat(parts[0]), sa = parseFloat(parts[1]) / 100, l = parseFloat(parts[2]) / 100;
      rgb = hslToRgb({ h: ((h % 360) + 360) % 360, s: sa, l, a: parts[3] !== undefined ? parseFloat(parts[3]) : 1 });
    }
    if ([rgb.r, rgb.g, rgb.b].some((v) => Number.isNaN(v))) return null;
    const c = rgbToHsl(rgb);
    return { ...c, hex: rgbToHex(rgb) };
  }
  if (NAMED_COLORS[s]) {
    const rgb = hexToRgb(NAMED_COLORS[s]);
    const c = rgbToHsl(rgb);
    return { ...c, hex: NAMED_COLORS[s] };
  }
  return null; // oklch()/lab()/color() etc: not provable -> pass by construction
}

function hslToRgb({ h, s, l, a }) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp >= 0 && hp < 1) { r = c; g = x; }
  else if (hp < 2) { r = x; g = c; }
  else if (hp < 3) { g = c; b = x; }
  else if (hp < 4) { g = x; b = c; }
  else if (hp < 5) { r = x; b = c; }
  else { r = c; b = x; }
  const m = l - c / 2;
  return { r: r + m, g: g + m, b: b + m, a };
}

function rgbToHex({ r, g, b }) {
  const f = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
  return `#${f(r)}${f(g)}${f(b)}`;
}

function normColorKey(parsed) {
  return parsed.hex ?? null;
}

/** All color literals appearing in a value string, in order. */
function colorsInValue(value) {
  if (!value || value.includes('var(') || /[$@]\{?[\w-]+\}?/.test(value)) return [];
  const out = [];
  const push = (m) => { const c = parseColor(m); if (c) out.push(c); };
  const re = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g;
  let m;
  while ((m = re.exec(value))) push(m[0]);
  const wordRe = /\b[a-zA-Z]{3,20}\b/g;
  while ((m = wordRe.exec(value))) {
    const w = m[0].toLowerCase();
    if (NAMED_COLORS[w] && !out.some((c) => c.hex === NAMED_COLORS[w])) push(w);
  }
  return out;
}

function parseLen(str) {
  const m = String(str).trim().match(/^(-?\d+(?:\.\d+)?)(px|pt|pc|em|rem|ch|ex|%|vw|vh|vmin|vmax|Q|cm|mm|in|s|ms|deg|fr)?$/);
  if (!m) return null;
  return { num: parseFloat(m[1]), unit: m[2] ?? '' };
}

/** Convert a length to px at the given root/font basis. Returns null when not provable. */
function lenToPx(len, basis = 16) {
  if (!len) return null;
  switch (len.unit) {
    case 'px': return len.num;
    case 'pt': return len.num * (4 / 3);
    case 'pc': return len.num * 16;
    case 'rem': return len.num * 16;
    case 'em': return len.num * basis;
    default: return null; // %, vw, ch, unitless... not provable
  }
}

function nl(s) { let n = 0; for (let i = 0; i < s.length; i++) if (s[i] === '\n') n++; return n; }

/** Precompute newline offsets once per file: offs[k] = start index of line k (0-based). */
function buildLineIndex(s) {
  const offs = [0];
  for (let i = 0; i < s.length; i++) if (s[i] === '\n') offs.push(i + 1);
  return offs;
}

/** 1-based line number of `index` via binary search over precomputed offsets (O(log n)). */
function lineOf(offs, index) {
  let lo = 0, hi = offs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (offs[mid] <= index) lo = mid; else hi = mid - 1;
  }
  return lo + 1;
}

/**
 * Parse a designer-lint-disable payload: a rule list (comma/space-separated ids,
 * '*' wildcard allowed) optionally followed by ': reason'. The reason is mandatory
 * per doctrine, so the parser must accept and echo it — everything after the FIRST
 * colon is the reason (reasons may contain colons/commas; rule ids never do).
 */
function parseIgnorePayload(payload) {
  const s = String(payload).trim();
  const colon = s.indexOf(':');
  const rulePart = colon === -1 ? s : s.slice(0, colon);
  const reason = colon === -1 ? '' : s.slice(colon + 1).trim();
  const rules = rulePart.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
  return { rules, reason };
}

// ---------------------------------------------------------------------------
// CSS parsing (single pass: comment/ignore scan -> strip -> brace tree -> flatten)
// ---------------------------------------------------------------------------

function scanCssIgnores(css, baseLine, regions) {
  const re = /\/\*[\s\S]*?\*\//g;
  let m;
  while ((m = re.exec(css))) {
    const inner = m[0].slice(2, -2).trim();
    const line = baseLine + nl(css.slice(0, m.index));
    let d = inner.match(/^designer-lint-disable\s+([\s\S]+)$/i);
    if (d) {
      const { rules, reason } = parseIgnorePayload(d[1]);
      if (rules.length) regions.push({ startLine: line, endLine: null, rules, reason, suppressed: 0, css: true });
      continue;
    }
    if (/^designer-lint-enable\b/i.test(inner)) {
      for (let i = regions.length - 1; i >= 0; i--) {
        if (regions[i].endLine === null && regions[i].css) { regions[i].endLine = line; break; }
      }
    }
  }
  // close dangling regions at EOF
  for (const r of regions) if (r.endLine === null) r.endLine = baseLine + nl(css);
}

function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

function consumeString(css, i) {
  const q = css[i]; let j = i + 1;
  while (j < css.length) {
    if (css[j] === '\\') { j += 2; continue; }
    if (css[j] === q) return { str: css.slice(i, j + 1), next: j + 1 };
    j++;
  }
  return { str: css.slice(i), next: css.length };
}

function consumeBalanced(css, i, open, close) {
  let depth = 0, j = i;
  while (j < css.length) {
    const ch = css[j];
    if (ch === '"' || ch === "'") { const s = consumeString(css, j); j = s.next; continue; }
    if (ch === open) depth++;
    else if (ch === close) { depth--; if (depth === 0) return { str: css.slice(i, j + 1), next: j + 1 }; }
    j++;
  }
  return { str: css.slice(i), next: css.length };
}

/** Paren-aware extract of a CSS function's inner arguments. */
function extractFuncArgs(value, name) {
  const idx = value.indexOf(name + '(');
  if (idx === -1) return null;
  const inner = value.slice(idx + name.length + 1);
  let depth = 1, j = 0;
  while (j < inner.length) {
    const ch = inner[j];
    if (ch === '"' || ch === "'") { const s = consumeString(inner, j); j = s.next; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (depth === 0) return inner.slice(0, j); }
    j++;
  }
  return inner;
}

/** Paren-aware extract of EVERY occurrence of a CSS function's inner arguments. */
function extractAllFuncArgs(value, name) {
  const out = [];
  const token = name + '(';
  let i = value.indexOf(token);
  while (i !== -1) {
    const inner = value.slice(i + token.length);
    let depth = 1, j = 0;
    while (j < inner.length) {
      const ch = inner[j];
      if (ch === '"' || ch === "'") { const s = consumeString(inner, j); j = s.next; continue; }
      if (ch === '(') depth++;
      else if (ch === ')') { depth--; if (depth === 0) break; }
      j++;
    }
    out.push(inner.slice(0, j));
    i = value.indexOf(token, i + token.length + j + 1);
  }
  return out;
}

function splitTopLevel(str, sep = ',') {
  const out = []; let buf = '', depth = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '"' || ch === "'") { const s = consumeString(str, i); buf += s.str; i = s.next - 1; continue; }
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === sep && depth === 0) { out.push(buf.trim()); buf = ''; continue; }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function parseCss(css, baseLine) {
  const ignores = [];
  scanCssIgnores(css, baseLine, ignores);
  const text = stripCssComments(css);

  const root = { prelude: '', decls: [], children: [], line: baseLine };
  const stack = [root];
  let buf = '', segStart = baseLine, line = baseLine, i = 0;

  const flushDecl = () => {
    const t = buf.trim();
    if (t) {
      const ci = t.indexOf(':');
      if (ci > 0) {
        const prop = t.slice(0, ci).trim().toLowerCase();
        const value = t.slice(ci + 1).trim();
        if (prop && value) stack[stack.length - 1].decls.push({ prop, value, line: segStart });
      }
    }
    buf = '';
  };

  while (i < text.length) {
    const ch = text[i];
    if (ch === '\n') { line++; buf += ch; i++; continue; }
    if (ch === '"' || ch === "'") { const s = consumeString(text, i); buf += s.str; line += nl(s.str); i = s.next; continue; }
    if (ch === '(') { const s = consumeBalanced(text, i, '(', ')'); buf += s.str; line += nl(s.str); i = s.next; continue; }
    if (ch === '[') { const s = consumeBalanced(text, i, '[', ']'); buf += s.str; line += nl(s.str); i = s.next; continue; }
    if (ch === ';') { flushDecl(); segStart = line; i++; continue; }
    if (ch === '{') {
      const node = { prelude: buf.trim(), decls: [], children: [], line };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
      buf = ''; segStart = line;
      i++; continue;
    }
    if (ch === '}') {
      flushDecl();
      // stray '}' (stack underflow) is noise, not a scan failure: guard the pop
      if (stack.length > 1) stack.pop();
      buf = ''; segStart = line;
      i++; continue;
    }
    buf += ch; i++;
  }
  flushDecl();

  const out = { blocks: [], keyframes: [] };
  flattenCss(root, null, '', out);
  return { blocks: out.blocks, keyframes: out.keyframes, ignores };
}

function flattenCss(node, atRule, parentSel, out) {
  for (const child of node.children) {
    const pre = child.prelude;
    if (!pre) continue;
    if (/^@keyframes\b/i.test(pre)) {
      const name = (pre.split(/[\s{]+/)[1] || '').trim();
      out.keyframes.push({
        name,
        line: child.line,
        frames: child.children.map((f) => ({ stop: f.prelude, decls: f.decls, line: f.line })),
      });
      continue;
    }
    if (/^@(media|supports|layer|container|scope)\b/i.test(pre)) { flattenCss(child, pre, parentSel, out); continue; }
    if (/^@(import|charset|namespace)\b/i.test(pre)) continue; // never followed
    const sel = parentSel ? `${parentSel} ${pre}` : pre;
    out.blocks.push({ selector: sel, atRule, line: child.line, decls: child.decls });
    if (child.children.length) flattenCss(child, atRule, sel, out);
  }
}

// ---------------------------------------------------------------------------
// HTML extraction
// ---------------------------------------------------------------------------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '\u2014', ndash: '\u2013', hellip: '\u2026', rsquo: '\u2019', lsquo: '\u2018', ldquo: '\u201c', rdquo: '\u201d', times: '\u00d7', middot: '\u00b7' };

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => ENTITIES[name] ?? m);
}

function attrOf(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'));
  if (!m) return null;
  return (m[2] ?? m[3] ?? m[4] ?? '').trim();
}

function blankKeepLines(s) { return s.replace(/[^\n]/g, ' '); }

function extractHtml(src) {
  const html = { lang: null, headings: [], imgs: [], marquees: [], classes: [], inlineStyles: [], textChunks: [] };
  const ignores = [];

  // Line numbers: newline offsets precomputed ONCE (binary search per lookup —
  // the per-match `nl(src.slice(0, i))` was O(n^2) on large HTML).
  // `cleaned` below is length-preserving with newlines intact, so LINES stays valid for it.
  const LINES = buildLineIndex(src);

  // HTML comment ignores
  const cRe = /<!--\s*designer-lint-(disable|enable)\b([\s\S]*?)-->/g;
  let cm;
  while ((cm = cRe.exec(src))) {
    const line = lineOf(LINES, cm.index);
    if (cm[1] === 'disable') {
      const { rules, reason } = parseIgnorePayload(cm[2]);
      if (rules.length) ignores.push({ startLine: line, endLine: null, rules, reason, suppressed: 0, css: false });
    } else {
      for (let i = ignores.length - 1; i >= 0; i--) {
        if (ignores[i].endLine === null && !ignores[i].css) { ignores[i].endLine = line; break; }
      }
    }
  }
  for (const r of ignores) if (r.endLine === null) r.endLine = lineOf(LINES, src.length);

  const langM = src.match(/<html[^>]*\blang\s*=\s*["']?([a-zA-Z-]+)/i);
  if (langM) html.lang = langM[1].toLowerCase();

  // <style> blocks
  const styles = [];
  const sRe = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;
  let sm;
  while ((sm = sRe.exec(src))) {
    const baseLine = lineOf(LINES, sm.index + sm[0].indexOf('>') + 1);
    styles.push({ css: sm[1], baseLine });
  }

  // headings
  const hRe = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi;
  let hm;
  while ((hm = hRe.exec(src))) {
    const text = decodeEntities(hm[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    html.headings.push({ level: parseInt(hm[1]), text, line: lineOf(LINES, hm.index) });
  }

  // imgs
  const iRe = /<img\b[^>]*>/gi;
  let im;
  while ((im = iRe.exec(src))) {
    html.imgs.push({ src: attrOf(im[0], 'src'), line: lineOf(LINES, im.index) });
  }

  // marquee
  const mRe = /<marquee\b[^>]*>/gi;
  let mm;
  while ((mm = mRe.exec(src))) html.marquees.push(lineOf(LINES, mm.index));

  // tags: classes + inline styles (also used to build text chunks with parent tracking)
  const tagRe = /<\/?\s*([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'area', 'base', 'col', 'embed', 'track', 'wbr']);
  const stack = ['body'];
  let tm;
  while ((tm = tagRe.exec(src))) {
    const closing = tm[0][1] === '/';
    const tag = tm[1].toLowerCase();
    const attrs = tm[2] || '';
    if (!closing) {
      if (!VOID.has(tag)) stack.push(tag);
      const cls = attrOf(tm[0], 'class');
      if (cls) html.classes.push({ element: tag, classes: cls.split(/\s+/).filter(Boolean), line: lineOf(LINES, tm.index) });
      const style = attrOf(tm[0], 'style');
      if (style) html.inlineStyles.push({ element: tag, value: style, line: lineOf(LINES, tm.index) });
    } else if (stack.length > 1 && stack[stack.length - 1] === tag) {
      stack.pop();
    }
    tm._parent = stack[stack.length - 1];
  }

  // text chunks (visible copy) with parent tag + line
  const EXEMPT_TEXT = new Set(['script', 'style', 'svg', 'head', 'code', 'pre', 'kbd', 'samp', 'noscript', 'template', 'textarea', 'title']);
  let cleaned = src
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, (m) => blankKeepLines(m))
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, (m) => blankKeepLines(m))
    .replace(/<svg\b[\s\S]*?<\/svg\s*>/gi, (m) => blankKeepLines(m))
    .replace(/<head\b[\s\S]*?<\/head\s*>/gi, (m) => blankKeepLines(m))
    .replace(/<!--[\s\S]*?-->/g, (m) => blankKeepLines(m));

  const chunkRe = /<[^>]*>/g;
  const openStack = ['body'];
  let parent = 'body';
  let pos = 0;
  let m;
  while ((m = chunkRe.exec(cleaned))) {
    const before = cleaned.slice(pos, m.index);
    if (before.trim()) {
      const text = decodeEntities(before).replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, ' ');
      if (text.trim()) html.textChunks.push({ text: text.trim(), line: lineOf(LINES, m.index), parent, exempt: EXEMPT_TEXT.has(parent) });
    }
    const tag = m[0];
    const nameM = tag.match(/^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9:-]*)/);
    if (nameM) {
      const name = nameM[2].toLowerCase();
      const isClose = nameM[1] === '/';
      if (!isClose && !VOID.has(name)) {
        if (!EXEMPT_TEXT.has(name)) { openStack.push(name); parent = name; }
        else { openStack.push(name); parent = name; } // track through exempt blocks too
      } else if (isClose) {
        const idx = openStack.lastIndexOf(name);
        if (idx > 0) openStack.splice(idx);
        parent = openStack[openStack.length - 1] ?? 'body';
      }
    }
    pos = m.index + tag.length;
  }
  const tail = cleaned.slice(pos);
  if (tail.trim()) {
    const text = decodeEntities(tail).replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, ' ');
    if (text.trim()) html.textChunks.push({ text: text.trim(), line: lineOf(LINES, pos), parent });
  }

  return { html, styles, ignores };
}

// ---------------------------------------------------------------------------
// Utility-class expansion
// ---------------------------------------------------------------------------

function expandUtilityClass(cls) {
  if (!UTILITY) return [];
  const out = [];
  for (const p of UTILITY.patterns || []) {
    let re;
    try { re = new RegExp(p.match); } catch { continue; }
    const m = cls.match(re);
    if (m) {
      let token = p.token;
      token = token.replace(/\$(\d)(\|([a-z-]+))?/g, (_, d, _pipe, fallback) => (m[Number(d)] ?? fallback ?? 'md'));
      out.push({ prop: propForKind(p.kind), value: token, tokenLike: true });
      return out;
    }
  }
  // arbitrary values: prefix-[value]
  const arb = cls.match(/^([a-z-]+)-\[([^\]]+)\]$/);
  if (arb) {
    const prefix = arb[1];
    const val = arb[2];
    const kindMap = UTILITY.arbitrary?.prefixes ?? {};
    const target = kindMap[prefix];
    if (!target) return out;
    if (target === 'text-or-size') {
      if (/^(#|rgb\(|hsl\(|oklch\()/i.test(val)) out.push({ prop: 'color', value: val, tokenLike: false });
      else out.push({ prop: 'font-size', value: val, tokenLike: false });
    } else if (target === 'border-color-or-width') {
      if (/^(#|rgb\(|hsl\(|oklch\()/i.test(val)) out.push({ prop: 'border-color', value: val, tokenLike: false });
      else out.push({ prop: 'border-width', value: val, tokenLike: false });
    } else {
      out.push({ prop: target, value: val, tokenLike: false });
    }
  }
  return out;
}

function propForKind(kind) {
  const map = {
    color: 'background', spacing: 'padding', radius: 'border-radius', shadow: 'box-shadow',
    font: 'font-family', 'font-weight': 'font-weight', 'font-size': 'font-size',
    leading: 'line-height', tracking: 'letter-spacing', opacity: 'opacity', z: 'z-index', duration: 'transition-duration',
  };
  return map[kind] ?? 'unknown';
}

// ---------------------------------------------------------------------------
// Design-token sidecar (the ONLY cross-file input; gates design-system rules)
// ---------------------------------------------------------------------------

const sidecarCache = new Map();

function parseDesignJson(obj) {
  const t = { colors: new Set(), fonts: new Set(), radii: new Set(), sizes: new Set() };
  const tok = obj?.tokens ?? obj ?? {};
  const grab = (v) => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);
  for (const c of grab(tok.color ?? tok.colors)) { const p = parseColor(c); if (p?.hex) t.colors.add(normColorKey(p)); }
  for (const f of grab(tok.font ?? tok.fonts ?? tok.fontFamily ?? tok['font-family'] ?? tok.typography)) {
    for (const fam of String(f).split(',')) { const x = fam.replace(/["']/g, '').trim().toLowerCase(); if (x) t.fonts.add(x); }
  }
  for (const r of grab(tok.radius ?? tok.radii ?? tok.rounded)) { const l = parseLen(r); if (l?.unit === 'px') t.radii.add(l.num); }
  for (const s of grab(tok.fontSize ?? tok['font-size'] ?? tok.sizes ?? tok.typeScale)) {
    const l = parseLen(s); if (l?.unit === 'px') t.sizes.add(l.num);
    else if (l?.unit === 'rem') t.sizes.add(Math.round(l.num * 16 * 100) / 100);
  }
  return t;
}

function parseDesignMdFrontmatter(text) {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return null;
  const t = { colors: new Set(), fonts: new Set(), radii: new Set(), sizes: new Set() };
  let section = '';
  for (const raw of m[1].split('\n')) {
    const secM = raw.match(/^([A-Za-z-]+):/);
    if (secM && !raw.startsWith(' ')) { section = secM[1].toLowerCase(); continue; }
    const kv = raw.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.+)$/);
    if (!kv) continue;
    const values = kv[2].split(',');
    const keyCtx = (section + ' ' + kv[1]).toLowerCase();
    for (const v of values) {
      const val = v.replace(/["']/g, '').trim();
      if (!val || val.startsWith('{')) continue;
      const c = parseColor(val);
      if (c?.hex && /colou?r/.test(keyCtx)) t.colors.add(normColorKey(c));
      if (/font|typograph|type/.test(keyCtx) && !/size|weight|height/.test(keyCtx)) {
        for (const fam of val.split(',')) { const x = fam.trim().toLowerCase(); if (x && !/sans-serif|serif|mono/.test(x)) t.fonts.add(x); }
      }
      const l = parseLen(val);
      if (l?.unit === 'px' && /radiu|round|corner/.test(keyCtx)) t.radii.add(l.num);
      if ((l?.unit === 'px' || l?.unit === 'rem') && /size|scale|ramp/.test(keyCtx)) {
        t.sizes.add(l.unit === 'px' ? l.num : Math.round(l.num * 16 * 100) / 100);
      }
    }
  }
  return t;
}

function findTokensFor(startDir) {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 32; i++) {
    if (sidecarCache.has(dir)) return sidecarCache.get(dir);
    let tokens = null;
    const dj = path.join(dir, '.designer', 'design.json');
    const dm = path.join(dir, 'DESIGN.md');
    try {
      if (fs.existsSync(dj)) tokens = parseDesignJson(JSON.parse(fs.readFileSync(dj, 'utf8')));
      else if (fs.existsSync(dm)) tokens = parseDesignMdFrontmatter(fs.readFileSync(dm, 'utf8'));
    } catch { tokens = null; }
    if (tokens) { sidecarCache.set(dir, tokens); return tokens; }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// ---------------------------------------------------------------------------
// File model
// ---------------------------------------------------------------------------

function buildModel(file) {
  const src = fs.readFileSync(file, 'utf8');
  const ext = path.extname(file).toLowerCase();
  const model = { file, ext, blocks: [], keyframes: [], ignores: [], html: null, styles: [], tokens: findTokensFor(path.dirname(file)) };

  const cssParts = [];
  if (CSS_EXTS.has(ext)) {
    cssParts.push({ css: src, baseLine: 1 });
  } else if (MARKUP_EXTS.has(ext)) {
    const ex = extractHtml(src);
    model.html = ex.html;
    model.ignores.push(...ex.ignores);
    model.styles = ex.styles;
    for (const st of ex.styles) cssParts.push(st);
  }

  for (const part of cssParts) {
    const parsed = parseCss(part.css, part.baseLine);
    model.blocks.push(...parsed.blocks);
    model.keyframes.push(...parsed.keyframes);
    model.ignores.push(...parsed.ignores);
  }

  // utility classes + inline styles -> synthetic declarations
  if (model.html) {
    for (const cl of model.html.classes) {
      const decls = [];
      for (const c of cl.classes) for (const d of expandUtilityClass(c)) decls.push(d);
      if (decls.length) model.blocks.push({ selector: `${cl.element}.${cl.classes.join('.')}`, line: cl.line, atRule: null, decls: decls.map((d) => ({ prop: d.prop, value: d.value, line: cl.line })) });
    }
    for (const is of model.html.inlineStyles) {
      const decls = [];
      for (const seg of is.value.split(';')) {
        const ci = seg.indexOf(':');
        if (ci > 0) {
          const prop = seg.slice(0, ci).trim().toLowerCase();
          const value = seg.slice(ci + 1).trim();
          if (prop && value) decls.push({ prop, value, line: is.line });
        }
      }
      if (decls.length) model.blocks.push({ selector: `${is.element}@inline`, line: is.line, atRule: null, decls });
    }
  }
  return model;
}

// ---------------------------------------------------------------------------
// Shared rule helpers
// ---------------------------------------------------------------------------

const HEADING_SEL_RE = /(^|[\s,+>~:])h[1-6]\b/;
const BODY_SEL_RE = /(^|[\s,+>~.])body$|(^|[\s,+>~])body\b[\s,{:+>~]/;
const FUNCTIONAL_SEL_RE = /(btn|button|label|tag|badge|chip|input|select|hint|meta|caption|tab\b|menu|nav|link|action)/i;
const GENERIC_FONTS = new Set(['sans-serif', 'serif', 'monospace', 'system-ui', 'cursive', 'fantasy', 'math', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'ui-rounded', 'inherit', 'initial']);
const COLOR_PROPS = new Set(['color', 'background', 'background-color', 'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline-color', 'fill', 'stroke', 'text-decoration-color', 'caret-color']);
const LAYOUT_PROPS = new Set(['width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'top', 'left', 'right', 'bottom', 'inset', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'flex-basis', 'flex-grow', 'grid-template-columns', 'grid-template-rows', 'gap', 'font-size', 'line-height']);
const OVERUSED_FONTS = /\b(inter|roboto|fraunces|geist|plus jakarta sans|space grotesk)\b/i;
const BUZZWORDS = /\b(streamline|empower(?:ed|ing|s)?|supercharg(?:e|ed|ing)|world-class|unlock(?:ed|ing|s)?|seamless(?:ly)?|effortless(?:ly)?|elevat(?:e|d|s)|revolutioniz(?:e|ed|ing|ation)|cutting-edge|game-?changer|best-in-class|next-generation|unleash(?:ed|ing)?|limitless(?:ly)?|transformative journey)\b/gi;

function declProp(decl) { return decl.prop; }
function isTokenRef(value) { return /\{\w/.test(value) || value.includes('var(') || /^[$@][\w-]+$/.test(value.trim()); }
function blockFontSizePx(block) {
  let px = null;
  for (const d of block.decls) if (d.prop === 'font-size' && !d.prop.startsWith('--')) {
    if (isTokenRef(d.value)) return null;
    const l = parseLen(d.value);
    if (!l) return null;
    const v = lenToPx(l);
    if (v === null) return null;
    px = v;
  }
  return px;
}
function blockDecl(block, prop) { return block.decls.find((d) => d.prop === prop && !d.prop.startsWith('--')); }
function solidBgColor(block) {
  for (const prop of ['background-color', 'background']) {
    const d = blockDecl(block, prop);
    if (!d) continue;
    if (isTokenRef(d.value)) return { token: true };
    if (d.value.includes('(')) return null; // gradient/url: not a solid color
    const cols = colorsInValue(d.value);
    if (cols.length) return cols[0];
  }
  return undefined; // nothing declared
}
function parseShadowItems(value) {
  // returns [{x,y,blur,spread,colorParsed}] from a box-shadow value
  const items = [];
  for (const part of splitTopLevel(value)) {
    if (!part || part === 'none' || /^(inset)$/i.test(part)) continue;
    let v = part.replace(/\binset\b/gi, ' ').trim();
    if (isTokenRef(v)) continue;
    const cols = colorsInValue(v);
    let noColor = v;
    for (const c of cols) {
      // strip the color text
      noColor = noColor.replace(c.hex ?? '###', ' ');
      if (c.source) noColor = noColor.replace(c.source, ' ');
    }
    // also strip rgb/hsl function text
    noColor = noColor.replace(/rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-fA-F]{3,8}\b/g, ' ');
    const nums = noColor.trim().split(/\s+/).filter(Boolean).map(parseLen).filter(Boolean);
    if (nums.length < 2) continue;
    items.push({
      x: nums[0].num, xUnit: nums[0].unit,
      y: nums[1]?.num ?? 0, yUnit: nums[1]?.unit,
      blur: nums[2]?.num ?? 0, blurUnit: nums[2]?.unit,
      spread: nums[3]?.num ?? 0,
      color: cols[0] ?? null,
    });
  }
  return items;
}
function pxOf(num, unit) { if (unit === 'px' || unit === '') return num; if (unit === 'rem' || unit === 'em') return num * 16; if (unit === 'pt') return num * 4 / 3; return null; }

function gradientStops(value, fnName) {
  const args = extractFuncArgs(value, fnName);
  if (args === null) return [];
  return splitTopLevel(args)
    .map((s) => colorsInValue(s)[0])
    .filter(Boolean);
}

function headingLevelOfSelector(sel) {
  let min = 99;
  const re = /(?:^|[\s,+>~:])h([1-6])\b/g;
  let m;
  while ((m = re.exec(sel))) min = Math.min(min, parseInt(m[1]));
  return min === 99 ? null : min;
}

// ---------------------------------------------------------------------------
// Rule checks — each returns [{line, evidence}]; message/severity come from rules.json
// ---------------------------------------------------------------------------

const CHECKS = {};

CHECKS['marquee'] = (model) => {
  const out = [];
  if (model.html) {
    for (const line of model.html.marquees) out.push({ line, evidence: '<marquee> element' });
    if (out.length) return out;
  }
  const moving = model.keyframes.filter((k) => /marquee|ticker/i.test(k.name) || k.frames.some((f) => f.decls.some((d) => d.prop === 'transform' && /translate[x3]?[\s(]/i.test(d.value) && /%|p[xt]|rem|em/.test(d.value))));
  for (const k of moving) {
    for (const b of model.blocks) {
      const a = blockDecl(b, 'animation') ?? blockDecl(b, 'animation-name');
      if (a && a.value.includes(k.name) && /infinite/.test((blockDecl(b, 'animation') ?? a).value)) {
        out.push({ line: a.line, evidence: `animation "${k.name}" infinite + translating keyframes` });
      }
    }
  }
  return out;
};

CHECKS['hard-offset-shadow'] = (model) => {
  const out = [];
  for (const b of model.blocks) for (const d of b.decls) {
    if (d.prop !== 'box-shadow' || isTokenRef(d.value)) continue;
    for (const it of parseShadowItems(d.value)) {
      const x = pxOf(it.x, it.xUnit), y = pxOf(it.y, it.yUnit), blur = pxOf(it.blur, it.blurUnit) ?? 0;
      if (x === null || y === null) continue;
      if ((Math.abs(x) >= 4 || Math.abs(y) >= 4) && blur === 0) {
        out.push({ line: d.line, evidence: `${d.prop}: ${d.value.slice(0, 80)}` });
      }
    }
  }
  return out;
};

CHECKS['repeating-stripes-gradient'] = (model) => {
  const out = [];
  for (const b of model.blocks) for (const d of b.decls) {
    if (!['background', 'background-image'].includes(d.prop) || isTokenRef(d.value)) continue;
    if (/repeating-(linear|conic)-gradient\(/i.test(d.value)) {
      out.push({ line: d.line, evidence: `${d.prop}: repeating-gradient stripes` });
    }
  }
  return out;
};

CHECKS['grid-background'] = (model) => {
  const out = [];
  for (const b of model.blocks) {
    const img = blockDecl(b, 'background-image');
    const size = blockDecl(b, 'background-size');
    if (!img || !size || isTokenRef(img.value)) continue;
    const hairlines = (img.value.match(/linear-gradient\([^)]*[^0-9]-?1px[^)]*\)|linear-gradient\([^)]*\b1px\b[^)]*\)/g) || []).length;
    const sizeLens = (size.value.match(/-?\d+(?:\.\d+)?(?:px|rem|em|%)/g) || []).length;
    if (hairlines >= 2 && sizeLens >= 2) out.push({ line: img.line, evidence: '2+ hairline linear-gradients + background-size (tiled grid)' });
  }
  return out;
};

CHECKS['bounce-easing'] = (model) => {
  const out = [];
  const re = /cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/g;
  for (const b of model.blocks) for (const d of b.decls) {
    if (!/^(transition|animation|transition-timing-function|animation-timing-function)$/.test(d.prop)) continue;
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(d.value))) {
      if (parseFloat(m[2]) > 1 || parseFloat(m[4]) > 1) {
        out.push({ line: d.line, evidence: `${d.prop}: ${m[0]} (y-control > 1)` });
      }
    }
  }
  return out;
};

CHECKS['extreme-negative-tracking'] = (model) => {
  const out = [];
  for (const b of model.blocks) for (const d of b.decls) {
    if (d.prop !== 'letter-spacing' || isTokenRef(d.value)) continue;
    const l = parseLen(d.value);
    if (!l) continue;
    let em;
    if (l.unit === 'em') em = l.num;
    else if (l.unit === 'rem' || l.unit === 'px') em = lenToPx(l, 16) / 16;
    else continue;
    if (em < -0.04 - 1e-9) out.push({ line: d.line, evidence: `letter-spacing: ${d.value} (${em.toFixed(3)}em < -0.04em)` });
  }
  return out;
};

CHECKS['wide-tracking'] = (model) => {
  const out = [];
  for (const b of model.blocks) {
    if (HEADING_SEL_RE.test(b.selector)) continue;
    const up = b.decls.find((d) => d.prop === 'text-transform' && /uppercase/i.test(d.value));
    if (up) continue;
    for (const d of b.decls) {
      if (d.prop !== 'letter-spacing' || isTokenRef(d.value)) continue;
      const l = parseLen(d.value);
      if (!l) continue;
      let em;
      if (l.unit === 'em') em = l.num;
      else if (l.unit === 'rem' || l.unit === 'px') em = lenToPx(l, 16) / 16;
      else continue;
      if (em > 0.05 + 1e-9) out.push({ line: d.line, evidence: `letter-spacing: ${d.value} (${em.toFixed(3)}em > 0.05em) on body text` });
    }
  }
  return out;
};

CHECKS['skipped-heading'] = (model) => {
  if (!model.html) return [];
  const out = [];
  let prev = 0;
  for (const h of model.html.headings) {
    if (prev && h.level > prev + 1) out.push({ line: h.line, evidence: `h${prev} -> h${h.level} jump` });
    prev = Math.max(prev, h.level);
  }
  return out;
};

CHECKS['tiny-text'] = (model) => {
  const out = [];
  for (const b of model.blocks) {
    if (FUNCTIONAL_SEL_RE.test(b.selector)) continue;
    for (const d of b.decls) {
      if (d.prop !== 'font-size' || isTokenRef(d.value)) continue;
      const l = parseLen(d.value);
      if (!l || l.unit === 'em') continue;
      const px = lenToPx(l);
      if (px !== null && px < 12) out.push({ line: d.line, evidence: `font-size: ${d.value} (${px}px < 12px) in "${b.selector}"` });
    }
  }
  return out;
};

CHECKS['undersized-ui-text'] = (model) => {
  const out = [];
  for (const b of model.blocks) {
    if (!FUNCTIONAL_SEL_RE.test(b.selector)) continue;
    for (const d of b.decls) {
      if (d.prop !== 'font-size' || isTokenRef(d.value)) continue;
      const l = parseLen(d.value);
      if (!l || l.unit === 'em') continue;
      const px = lenToPx(l);
      if (px !== null && px < 11) out.push({ line: d.line, evidence: `font-size: ${d.value} (${px}px < 11px) on functional selector "${b.selector}"` });
    }
  }
  return out;
};

CHECKS['cramped-padding'] = (model) => {
  const out = [];
  for (const b of model.blocks) {
    for (const d of b.decls) {
      if (!/^padding(-top|-right|-bottom|-left)?$/.test(d.prop) || isTokenRef(d.value)) continue;
      const lens = (d.value.match(/-?\d+(?:\.\d+)?(?:px|rem|em|pt)/g) || []).map((x) => lenToPx(parseLen(x))).filter((x) => x !== null);
      if (!lens.some((v) => v > 0 && v < 8)) continue;
      // box styling proof
      const bg = solidBgColor(b);
      const boxed = (bg && bg !== null && !bg.token) || (() => {
        for (const dd of b.decls) {
          if (/^border/.test(dd.prop) && !/none/.test(dd.value) && !isTokenRef(dd.value)) return true;
          if (dd.prop === 'box-shadow' && !isTokenRef(dd.value) && dd.value !== 'none') return true;
          if (dd.prop === 'border-radius' && !isTokenRef(dd.value) && dd.value !== '0') {
            const rl = parseLen(dd.value);
            if (rl && (rl.num > 0 || /%/.test(dd.value))) return true;
          }
        }
        return false;
      })();
      if (boxed) out.push({ line: d.line, evidence: `${d.prop}: ${d.value} (side < 8px) on a styled box "${b.selector}"` });
    }
  }
  return out;
};

CHECKS['broken-image'] = (model) => {
  if (!model.html) return [];
  const out = [];
  for (const img of model.html.imgs) {
    const src = img.src;
    if (src === null || src === '' || src === '#' || /placehold/i.test(src) || /^data:image\/gif;base64,R0lGOD/i.test(src)) {
      out.push({ line: img.line, evidence: `<img src="${src ?? ''}">` });
    }
  }
  return out;
};

CHECKS['justified-text'] = (model) => {
  const lang = model.html?.lang ?? '';
  if (/^(zh|ja|ko|th|ar|he|fa|ug)/.test(lang)) return [];
  const out = [];
  for (const b of model.blocks) {
    const ta = blockDecl(b, 'text-align');
    if (!ta || !/^justify$/i.test(ta.value.trim())) continue;
    if (b.decls.some((d) => d.prop === 'hyphens')) continue;
    out.push({ line: ta.line, evidence: `text-align: justify without hyphens in "${b.selector}"` });
  }
  return out;
};

CHECKS['layout-transition'] = (model) => {
  const out = [];
  for (const b of model.blocks) for (const d of b.decls) {
    if (!/^(transition|transition-property)$/.test(d.prop) || isTokenRef(d.value)) continue;
    for (const part of splitTopLevel(d.value)) {
      const prop = part.split(/\s+/)[0].toLowerCase();
      if (LAYOUT_PROPS.has(prop)) out.push({ line: d.line, evidence: `${d.prop}: layout property "${prop}" animated` });
    }
  }
  return out;
};

CHECKS['organic-clip-path'] = (model) => {
  const out = [];
  for (const b of model.blocks) for (const d of b.decls) {
    if (d.prop !== 'clip-path' || isTokenRef(d.value)) continue;
    const m = d.value.match(/polygon\(([^)]*)\)/i);
    if (m) {
      const vertices = splitTopLevel(m[1]).length;
      if (vertices >= 6) out.push({ line: d.line, evidence: `clip-path: polygon with ${vertices} vertices` });
    }
  }
  return out;
};

CHECKS['numbered-section-labels'] = (model) => {
  if (!model.html) return [];
  const hits = model.html.textChunks.filter((c) => !c.exempt && /^0\d$/.test(c.text.trim()));
  if (hits.length >= 2) return [{ line: hits[0].line, evidence: `${hits.length} zero-padded section labels (e.g. "${hits[0].text.trim()}")` }];
  return [];
};

CHECKS['theater-slop-phrase'] = (model) => {
  if (!model.html) return [];
  for (const c of model.html.textChunks.filter((c) => !c.exempt)) {
    const m = c.text.match(/\b[a-z]+ theater\b/i);
    if (m) return [{ line: c.line, evidence: `"${m[0]}" in copy` }];
  }
  return [];
};

CHECKS['label-line-height'] = (model) => {
  const out = [];
  for (const b of model.blocks) {
    // source-spec filter: visible label/button-sized text only — headings, captions-as-body and body text are out of scope
    if (HEADING_SEL_RE.test(b.selector)) continue;
    if (!FUNCTIONAL_SEL_RE.test(b.selector)) continue;
    const fs = (() => {
      const d = blockDecl(b, 'font-size');
      if (!d || isTokenRef(d.value)) return null;
      const l = parseLen(d.value);
      return l && l.unit !== 'em' ? lenToPx(l) : null;
    })();
    if (fs === null || fs > 13) continue;
    const lh = blockDecl(b, 'line-height');
    if (!lh || isTokenRef(lh.value)) continue;
    const raw = lh.value.trim();
    let ratio = null;
    if (/^-?\d+(\.\d+)?$/.test(raw)) ratio = parseFloat(raw);
    else {
      const l = parseLen(raw);
      if (l && l.unit === 'px') ratio = l.num / fs;
    }
    if (ratio !== null && ratio > 1.7) out.push({ line: lh.line, evidence: `font-size ${fs}px with line-height ratio ${ratio.toFixed(2)} > 1.7` });
  }
  return out;
};

CHECKS['gpt-thin-border-wide-shadow'] = (model) => {
  const hits = [];
  for (const b of model.blocks) {
    let thinBorder = false;
    for (const d of b.decls) {
      if (!/^border(-top|-right|-bottom|-left)?$/.test(d.prop) || isTokenRef(d.value)) continue;
      if (/none/.test(d.value)) continue;
      const l = parseLen((d.value.match(/-?\d+(?:\.\d+)?(px|rem|em|pt)/) || [''])[0]);
      const px = l ? lenToPx(l) : null;
      if (px !== null && px <= 1) thinBorder = true;
    }
    if (!thinBorder) continue;
    const sh = blockDecl(b, 'box-shadow');
    if (!sh || isTokenRef(sh.value)) continue;
    for (const it of parseShadowItems(sh.value)) {
      const x = pxOf(it.x, it.xUnit), y = pxOf(it.y, it.yUnit), blur = pxOf(it.blur, it.blurUnit);
      if (x === null || y === null || blur === null) continue;
      if (blur >= 12 && Math.abs(x) <= 16 && Math.abs(y) <= 16) { hits.push({ line: sh.line, evidence: `ghost card "${b.selector}": hairline border + ${blur}px diffuse shadow` }); break; }
    }
  }
  return hits.length >= 2 ? [hits[1]] : [];
};

CHECKS['all-caps-body'] = (model) => {
  if (!model.html) return [];
  const out = [];
  const EXEMPT = new Set(['button', 'label', 'code', 'pre', 'kbd', 'samp', 'th']);
  for (const c of model.html.textChunks) {
    const t = c.text.trim();
    if (t.length < 80) continue;
    const letters = (t.match(/[a-zA-Z]/g) || []).length;
    if (letters < 20) continue;
    if (/[a-z]/.test(t)) continue;
    if (EXEMPT.has(c.parent) || c.exempt) continue;
    out.push({ line: c.line, evidence: `${letters} uppercase letters in <${c.parent}>: "${t.slice(0, 60)}…"` });
  }
  return out;
};

CHECKS['overused-font'] = (model) => {
  const out = [];
  for (const b of model.blocks) for (const d of b.decls) {
    if (d.prop !== 'font-family' || isTokenRef(d.value)) continue;
    const m = d.value.match(OVERUSED_FONTS);
    if (m) out.push({ line: d.line, evidence: `font-family uses "${m[1]}"` });
  }
  return out;
};

CHECKS['gradient-text'] = (model) => {
  const out = [];
  for (const b of model.blocks) {
    const bg = blockDecl(b, 'background') ?? blockDecl(b, 'background-image');
    if (!bg || isTokenRef(bg.value) || !/gradient\(/i.test(bg.value)) continue;
    const clip = b.decls.find((d) => /background-clip/i.test(d.prop) && /text/i.test(d.value)) ?? b.decls.find((d) => /-webkit-text-fill-color/i.test(d.prop) && /transparent/i.test(d.value));
    if (clip) out.push({ line: clip.line, evidence: `gradient background + ${clip.prop}: ${clip.value}` });
  }
  return out;
};

CHECKS['cream-palette'] = (model) => {
  const t = RULESET.rules.find((r) => r.id === 'cream-palette').detector.thresholds;
  for (const b of model.blocks) {
    const bg = solidBgColor(b);
    if (!bg || bg.token) continue;
    if (bg.h >= t.hue[0] && bg.h <= t.hue[1] && bg.s >= t.saturation[0] && bg.s <= t.saturation[1] && bg.l >= t.lightness[0] && bg.l <= t.lightness[1]) {
      return [{ line: b.line, evidence: `background ${bg.hex} (hsl ${bg.h.toFixed(0)}, ${(bg.s * 100).toFixed(0)}%, ${(bg.l * 100).toFixed(0)}%) in warm-cream range` }];
    }
  }
  return [];
};

CHECKS['dark-glow'] = (model) => {
  const out = [];
  for (const b of model.blocks) {
    for (const d of b.decls) {
      if (isTokenRef(d.value)) continue;
      let items = [];
      if (d.prop === 'box-shadow') items = parseShadowItems(d.value);
      if (d.prop === 'filter') {
        for (const args of extractAllFuncArgs(d.value, 'drop-shadow')) items.push(...parseShadowItems(args));
      }
      for (const it of items) {
        const x = pxOf(it.x, it.xUnit), y = pxOf(it.y, it.yUnit), blur = pxOf(it.blur, it.blurUnit);
        if (x === null || y === null || blur === null) continue;
        if (x !== 0 || y !== 0 || blur < 8) continue;
        const c = it.color;
        if (!c) continue; // colorless shadow: not provable
        if (c.s >= 0.35 && c.l >= 0.25 && c.l <= 0.9) {
          out.push({ line: d.line, evidence: `${d.prop}: zero-offset ${blur}px chromatic halo (${c.hex})` });
        }
      }
    }
  }
  return out;
};

CHECKS['radial-halo'] = (model) => {
  const out = [];
  for (const b of model.blocks) for (const d of b.decls) {
    if (!['background', 'background-image'].includes(d.prop) || isTokenRef(d.value)) continue;
    if (!/radial-gradient\(/i.test(d.value)) continue;
    const stops = gradientStops(d.value, 'radial-gradient');
    if (!stops.length) continue;
    const inner = stops[0];
    const allColors = colorsInValue(d.value);
    const hasDark = allColors.slice(1).some((c) => c.l <= 0.3);
    if (inner.s >= 0.4 && inner.a >= 0.85 && hasDark) {
      out.push({ line: d.line, evidence: `radial-gradient: saturated center ${inner.hex} on dark field` });
    }
  }
  return out;
};

CHECKS['side-tab'] = (model) => {
  const out = [];
  for (const b of model.blocks) {
    const sides = { left: null, right: null };
    let allSidesBorder = false;
    for (const d of b.decls) {
      if (d.prop === 'border' && !/none/.test(d.value)) allSidesBorder = true;
      const m = d.prop.match(/^border-(left|right)(-width)?$/);
      if (m) {
        const wSrc = d.prop.endsWith('width') ? d.value : (d.value.match(/-?\d+(\.\d+)?(px|rem|em|pt)/) || [''])[0];
        const l = parseLen(wSrc);
        const px = l ? lenToPx(l) : null;
        const styleNone = /none|^0[^.]/.test(d.value);
        sides[m[1]] = { px, line: d.line, raw: d.value, none: styleNone };
      }
    }
    for (const side of ['left', 'right']) {
      const s = sides[side];
      if (!s || s.none || s.px === null || s.px < 3) continue;
      if (allSidesBorder) continue;
      const bg = solidBgColor(b);
      const boxed = (bg && !bg.token) || b.decls.some((d) => (d.prop === 'box-shadow' && !isTokenRef(d.value) && d.value !== 'none') || (d.prop === 'border-radius' && !isTokenRef(d.value) && d.value !== '0' && d.value !== 'none'));
      if (boxed) out.push({ line: s.line, evidence: `border-${side}: ${s.raw} (side tab) on a styled box "${b.selector}"` });
    }
  }
  return out;
};

CHECKS['border-accent-on-rounded'] = (model) => {
  const out = [];
  for (const b of model.blocks) {
    const rd = blockDecl(b, 'border-radius');
    if (!rd || isTokenRef(rd.value) || /%|inherit/.test(rd.value)) continue;
    const corners = (rd.value.match(/-?\d+(\.\d+)?(px|rem|em|pt)/g) || []).map((x) => lenToPx(parseLen(x))).filter((x) => x !== null);
    if (!corners.length || Math.min(...corners) < 12) continue;
    for (const d of b.decls) {
      if (!/^border(-top|-right|-bottom|-left)?$/.test(d.prop) || isTokenRef(d.value) || /none/.test(d.value)) continue;
      const wl = parseLen((d.value.match(/-?\d+(\.\d+)?(px|rem|em|pt)/) || [''])[0]);
      const px = wl ? lenToPx(wl) : null;
      if (px === null || px < 2) continue;
      const cols = colorsInValue(d.value);
      const c = cols[0];
      if (c && c.s >= 0.3) { out.push({ line: d.line, evidence: `border-radius ${Math.min(...corners)}px + ${px}px saturated border (${c.hex})` }); break; }
    }
  }
  return out;
};

CHECKS['tight-leading'] = (model) => {
  const out = [];
  for (const b of model.blocks) {
    const fs = (() => {
      const d = blockDecl(b, 'font-size');
      if (!d || isTokenRef(d.value)) return null;
      const l = parseLen(d.value);
      return l && l.unit !== 'em' ? lenToPx(l) : null;
    })();
    const lh = blockDecl(b, 'line-height');
    if (fs === null || !lh || isTokenRef(lh.value) || /normal/i.test(lh.value)) continue;
    const raw = lh.value.trim();
    let ratio = null;
    if (/^-?\d+(\.\d+)?$/.test(raw)) ratio = parseFloat(raw);
    else {
      const l = parseLen(raw);
      if (l && l.unit === 'px') ratio = l.num / fs;
      else continue;
    }
    if (ratio < 1.3 - 1e-9) out.push({ line: lh.line, evidence: `font-size ${fs}px + line-height ${raw} (ratio ${ratio.toFixed(2)} < 1.3) in "${b.selector}"` });
  }
  return out;
};

CHECKS['gray-on-color'] = (model) => {
  const out = [];
  for (const b of model.blocks) {
    const cd = blockDecl(b, 'color');
    if (!cd || isTokenRef(cd.value)) continue;
    const fg = colorsInValue(cd.value)[0];
    if (!fg) continue;
    if (!(fg.s < 0.15 && fg.l >= 0.15 && fg.l <= 0.9)) continue;
    const bg = solidBgColor(b);
    if (!bg || bg.token) continue;
    if (bg.s > 0.4) out.push({ line: cd.line, evidence: `gray ${fg.hex} on colored ${bg.hex} (same block "${b.selector}")` });
  }
  return out;
};

CHECKS['line-length'] = (model) => {
  const out = [];
  for (const b of model.blocks) for (const d of b.decls) {
    if (!['width', 'max-width'].includes(d.prop) || isTokenRef(d.value)) continue;
    const l = parseLen(d.value);
    if (l && l.unit === 'ch' && l.num > 80) out.push({ line: d.line, evidence: `${d.prop}: ${d.value} (>80ch measure)` });
  }
  return out;
};

CHECKS['pulsing-dot'] = (model) => {
  const out = [];
  const pulseKfs = model.keyframes.filter((k) => {
    if (/pulse|ping|beat|ripple|breath/i.test(k.name)) return true;
    const ops = k.frames.flatMap((f) => f.decls.filter((d) => d.prop === 'opacity').map((d) => parseFloat(d.value)));
    if (ops.length >= 3) {
      let dirChanges = 0;
      for (let i = 2; i < ops.length; i++) {
        const a = ops[i - 1] - ops[i - 2], bb = ops[i] - ops[i - 1];
        if (a * bb < 0) dirChanges++;
      }
      return dirChanges >= 1;
    }
    return false;
  });
  for (const k of pulseKfs) {
    for (const b of model.blocks) {
      const a = blockDecl(b, 'animation') ?? blockDecl(b, 'animation-name');
      if (!a || !a.value.includes(k.name)) continue;
      const rd = blockDecl(b, 'border-radius');
      const w = blockDecl(b, 'width'), h = blockDecl(b, 'height');
      let dotShape = false;
      if (rd && !isTokenRef(rd.value)) {
        const rl = parseLen(rd.value);
        if (/50%/.test(rd.value)) dotShape = true;
        else if (rl) { const px = lenToPx(rl); if (px !== null && px >= 999) dotShape = true; }
      }
      if (!dotShape && w && h && !isTokenRef(w.value) && !isTokenRef(h.value)) {
        const wp = lenToPx(parseLen(w.value) ?? {}), hp = lenToPx(parseLen(h.value) ?? {});
        if (wp !== null && hp !== null && wp <= 16 && hp <= 16 && rd) dotShape = true;
      }
      if (dotShape) out.push({ line: a.line, evidence: `animation "${k.name}" on a dot-shaped element "${b.selector}"` });
    }
  }
  return out;
};

CHECKS['blinking-cursor'] = (model) => {
  const out = [];
  const CARET = /^[|▏▎▍▌▋▊▉█￨┃▮▯]$|^[|▏▎▍▌▋▊▉█￨┃▮▯]\s*$/;
  const blinkKfs = new Set(model.keyframes.filter((k) => /blink|caret/i.test(k.name)).map((k) => k.name));
  for (const b of model.blocks) {
    const isPseudo = /::?(before|after)/i.test(b.selector);
    const content = blockDecl(b, 'content');
    const anim = blockDecl(b, 'animation') ?? blockDecl(b, 'animation-name');
    if (isPseudo && content && anim) {
      const glyphM = content.value.match(/["']([^"']*)["']/);
      if (glyphM && CARET.test(glyphM[1])) {
        out.push({ line: content.line, evidence: `${b.selector} content "${glyphM[1]}" + animation (fake caret)` });
        continue;
      }
    }
    if (anim && blinkKfs.size) {
      for (const name of blinkKfs) {
        if (anim.value.includes(name) && /steps\(/i.test(anim.value)) {
          out.push({ line: anim.line, evidence: `animation "${name}" with steps() timing (fake caret)` });
        }
      }
    }
  }
  return out;
};

CHECKS['monotonous-spacing'] = (model) => {
  const values = [];
  let lines = [];
  for (const b of model.blocks) for (const d of b.decls) {
    if (!/^(margin|padding|gap|column-gap|row-gap)(-top|-right|-bottom|-left|-x|-y)?$/.test(d.prop) || isTokenRef(d.value) || d.value.includes('calc')) continue;
    for (const v of d.value.match(/-?\d+(?:\.\d+)?(?:px|rem|em|pt)/g) ?? []) { values.push(v); lines.push(d.line); }
  }
  const distinct = new Set(values);
  if (values.length >= 8 && distinct.size === 1) {
    return [{ line: lines[0], evidence: `${values.length} spacing declarations, all "${[...distinct][0]}"` }];
  }
  return [];
};

CHECKS['em-dash-overuse'] = (model) => {
  if (!model.html) return [];
  const text = model.html.textChunks.filter((c) => !c.exempt).map((c) => c.text).join(' ');
  const allChunks = model.html.textChunks;
  const count = (text.match(/\u2014/g) || []).length;
  if (count >= 8 && text.length / count <= 500) {
    const first = allChunks.find((c) => c.text.includes('\u2014'));
    return [{ line: first?.line ?? 1, evidence: `${count} em-dashes in ${text.length} chars (~1 per ${Math.round(text.length / count)})` }];
  }
  return [];
};

CHECKS['marketing-buzzword'] = (model) => {
  if (!model.html) return [];
  const out = [];
  const seen = new Set();
  for (const c of model.html.textChunks.filter((c) => !c.exempt)) {
    BUZZWORDS.lastIndex = 0;
    let m;
    while ((m = BUZZWORDS.exec(c.text))) {
      const w = m[1].toLowerCase();
      if (!seen.has(w)) { seen.add(w); out.push({ line: c.line, evidence: `"${m[1]}" in copy` }); }
    }
  }
  return out;
};

CHECKS['text-overflow'] = (model) => {
  const out = [];
  for (const b of model.blocks) {
    const ws = blockDecl(b, 'white-space');
    if (!ws || !/nowrap/i.test(ws.value)) continue;
    for (const d of b.decls) {
      if (!['width', 'max-width'].includes(d.prop) || isTokenRef(d.value)) continue;
      const l = parseLen(d.value);
      if (!l) continue;
      if (['px', 'pt', 'em', 'rem', 'ch'].includes(l.unit) || (l.unit === '%' && l.num < 100)) {
        out.push({ line: d.line, evidence: `white-space: nowrap + ${d.prop}: ${d.value} in "${b.selector}"` });
      }
    }
  }
  return out;
};

// design-system family (sidecar-gated)
// border/outline SHORTHAND values also carry color literals (e.g. `border:1px solid #fa709a`)
const BORDER_OUTLINE_SHORTHAND_RE = /^(border|outline)(-(top|right|bottom|left|inline|block))?$/;

CHECKS['design-system-font'] = (model) => {
  if (!model.tokens || !model.tokens.fonts.size) return [];
  const out = [];
  for (const b of model.blocks) for (const d of b.decls) {
    if (d.prop !== 'font-family' || d.prop.startsWith('--') || isTokenRef(d.value)) continue;
    for (const fam of splitTopLevel(d.value)) {
      const f = fam.replace(/["']/g, '').trim().toLowerCase();
      if (!f || GENERIC_FONTS.has(f)) continue;
      if (!model.tokens.fonts.has(f)) out.push({ line: d.line, evidence: `font-family "${fam.trim()}" not in recorded font tokens` });
    }
  }
  return out;
};

CHECKS['design-system-color'] = (model) => {
  if (!model.tokens || !model.tokens.colors.size) return [];
  const out = [];
  for (const b of model.blocks) for (const d of b.decls) {
    const shorthand = BORDER_OUTLINE_SHORTHAND_RE.test(d.prop);
    if ((!COLOR_PROPS.has(d.prop) && !shorthand) || d.prop.startsWith('--') || isTokenRef(d.value)) continue;
    if (d.prop === 'background' && d.value.includes('(')) continue; // gradients v2
    for (const c of colorsInValue(d.value)) {
      if (!normColorKey(c)) continue;
      if (!model.tokens.colors.has(normColorKey(c))) out.push({ line: d.line, evidence: `${d.prop}: ${c.hex} not in recorded color tokens` });
    }
  }
  return out;
};

CHECKS['design-system-radius'] = (model) => {
  if (!model.tokens || !model.tokens.radii.size) return [];
  const out = [];
  for (const b of model.blocks) for (const d of b.decls) {
    if (d.prop !== 'border-radius' || d.prop.startsWith('--') || isTokenRef(d.value)) continue;
    const valuePart = d.value.split('/')[0];
    for (const tok of valuePart.split(/[\s,]+/).filter(Boolean)) {
      if (/^(inherit|initial|unset)$/.test(tok)) continue;
      const l = parseLen(tok);
      if (!l) continue;
      if (l.unit === '%' || (l.unit === 'px' && l.num >= 999)) continue; // circle/pill exempt
      const px = lenToPx(l);
      if (px === null) continue;
      if (!model.tokens.radii.has(Math.round(px * 100) / 100)) out.push({ line: d.line, evidence: `border-radius: ${tok} not in recorded radius tokens` });
    }
  }
  return out;
};

CHECKS['design-system-font-size'] = (model) => {
  if (!model.tokens || !model.tokens.sizes.size) return [];
  const out = [];
  for (const b of model.blocks) for (const d of b.decls) {
    if (d.prop !== 'font-size' || d.prop.startsWith('--') || isTokenRef(d.value)) continue;
    const l = parseLen(d.value);
    if (!l || l.unit === 'em') continue;
    const px = lenToPx(l);
    if (px === null) continue;
    if (!model.tokens.sizes.has(Math.round(px * 100) / 100)) out.push({ line: d.line, evidence: `font-size: ${d.value} (${px}px) not on the recorded type ramp` });
  }
  return out;
};

// hard-in-source heuristics (advisory)
CHECKS['ai-color-palette'] = (model) => {
  const t = RULESET.rules.find((r) => r.id === 'ai-color-palette').detector.thresholds;
  const decls = [];
  for (const b of model.blocks) for (const d of b.decls) {
    if (!COLOR_PROPS.has(d.prop) && !['box-shadow', 'background-image'].includes(d.prop)) continue;
    if (isTokenRef(d.value)) continue;
    const cols = colorsInValue(d.value);
    if (cols.length) decls.push({ line: d.line, value: d.value, cols, block: b });
  }
  for (const { line, value, cols, block } of decls) {
    const siblingColors = [...cols, ...block.decls.filter((d) => COLOR_PROPS.has(d.prop) && !isTokenRef(d.value)).flatMap((d) => colorsInValue(d.value))];
    for (const c of cols) {
      if (c.h >= t.violetHue[0] && c.h <= t.violetHue[1] && c.s >= t.violetSat) {
        return [{ line, evidence: `violet/purple ${c.hex} (hsl ${c.h.toFixed(0)}, ${(c.s * 100).toFixed(0)}%) — saturated AI palette marker` }];
      }
      if (c.h >= t.cyanHue[0] && c.h <= t.cyanHue[1] && c.s >= t.cyanSat && c.l >= t.cyanLight) {
        const dark = siblingColors.some((o) => o !== c && o.l <= t.darkLight);
        if (dark) return [{ line, evidence: `bright cyan ${c.hex} on dark — saturated AI palette marker` }];
      }
      if (c.s >= t.neonSat && c.l >= t.neonLight[0] && c.l <= t.neonLight[1]) {
        const second = siblingColors.some((o) => o !== c && o.s >= 0.4 && Math.min(Math.abs(o.h - c.h), 360 - Math.abs(o.h - c.h)) >= t.hueDistance);
        if (second) return [{ line, evidence: `neon ${c.hex} with a second distinct hue — saturated AI palette marker` }];
      }
    }
  }
  return [];
};

CHECKS['radial-spotlight-glow'] = (model) => {
  const t = RULESET.rules.find((r) => r.id === 'radial-spotlight-glow').detector.thresholds;
  for (const b of model.blocks) for (const d of b.decls) {
    if (!['background', 'background-image'].includes(d.prop) || isTokenRef(d.value)) continue;
    if (!/radial-gradient\(/i.test(d.value)) continue;
    const stops = gradientStops(d.value, 'radial-gradient');
    if (!stops.length) continue;
    const inner = stops[0];
    if (inner.s >= t.saturation && inner.a >= t.alpha[0] && inner.a <= t.alpha[1]) {
      return [{ line: d.line, evidence: `translucent radial wash ${d.value.slice(0, 70)} (advisory)` }];
    }
  }
  return [];
};

CHECKS['flat-type-hierarchy'] = (model) => {
  const levels = new Map(); // level -> {px, line}
  for (const b of model.blocks) {
    const lvl = headingLevelOfSelector(b.selector);
    if (lvl === null) continue;
    const fs = blockDecl(b, 'font-size');
    if (!fs || isTokenRef(fs.value)) continue;
    const l = parseLen(fs.value);
    if (!l || l.unit === 'em') continue;
    const px = lenToPx(l);
    if (px === null) continue;
    const cur = levels.get(lvl);
    if (!cur || px > cur.px) levels.set(lvl, { px, line: fs.line });
  }
  const bodyBlock = model.blocks.find((b) => BODY_SEL_RE.test(b.selector));
  if (bodyBlock) {
    const fs = blockDecl(bodyBlock, 'font-size');
    if (fs && !isTokenRef(fs.value)) {
      const l = parseLen(fs.value);
      if (l && l.unit !== 'em') {
        const px = lenToPx(l);
        if (px !== null && (!levels.get(7) || px > levels.get(7).px)) levels.set(7, { px, line: fs.line });
      }
    }
  }
  const declared = [...levels.entries()].sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < declared.length; i++) {
    const [, big] = declared[i - 1];
    const [, small] = declared[i];
    const ratio = big.px / small.px;
    if (ratio < 1.25 - 1e-9) {
      return [{ line: small.line, evidence: `adjacent declared sizes ${big.px}px -> ${small.px}px (ratio ${ratio.toFixed(2)} < 1.25)` }];
    }
  }
  return [];
};

CHECKS['oversized-h1'] = (model) => {
  if (!model.html) return [];
  const t = RULESET.rules.find((r) => r.id === 'oversized-h1').detector.thresholds;
  let declaredH1 = null;
  for (const b of model.blocks) {
    if (headingLevelOfSelector(b.selector) !== 1) continue;
    const fs = blockDecl(b, 'font-size');
    if (!fs || isTokenRef(fs.value)) continue;
    const l = parseLen(fs.value);
    if (!l || l.unit === 'em') continue;
    const px = lenToPx(l);
    if (px === null) continue;
    declaredH1 = Math.max(declaredH1 ?? 0, px);
  }
  if (declaredH1 === null || declaredH1 < t.px) return [];
  for (const h of model.html.headings) {
    if (h.level !== 1) continue;
    const words = h.text.split(/\s+/).filter(Boolean).length;
    if (words >= t.words || h.text.length >= t.chars) {
      return [{ line: h.line, evidence: `h1 "${h.text.slice(0, 50)}…" (${words} words) at ${declaredH1}px display size` }];
    }
  }
  return [];
};

CHECKS['aphoristic-cadence'] = (model) => {
  if (!model.html) return [];
  const reA = /\b[A-Z][^.!?]{2,60}\.\s*(?:No|Not)\s+[^.!?]{2,60}\./g;
  const reB = /\bNot a\s[^.!?]{2,40}\.\s*[A-Z][^.!?]{2,40}\./g;
  let hits = 0, firstLine = null;
  for (const c of model.html.textChunks.filter((c) => !c.exempt)) {
    const a = c.text.match(reA) || [];
    const b = c.text.match(reB) || [];
    const n = Math.max(a.length, b.length);
    if (n && firstLine === null) firstLine = c.line;
    hits += n;
  }
  if (hits >= 3) return [{ line: firstLine ?? 1, evidence: `${hits} "X. No Y." style constructions in copy` }];
  return [];
};

// cream-palette is a plain function (defined above)

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

function activeRulesFor(opts) {
  return RULESET.rules.filter((r) => {
    if (r.status !== 'v1-source') return false;
    if (opts.scope === 'css' || opts.scope === 'html') {
      if (!r.scopes.includes(opts.scope)) return false;
    } else if (opts.scope !== 'all' && r.category !== opts.scope) {
      return false; // rule-category filter (category names come from rules.json)
    }
    if (opts.noAdvisory && ADVISORY_SEVERITIES.includes(r.severity)) return false;
    if (opts.noDesignSystem && r.detector?.group === 'design-system') return false;
    return true;
  });
}

function collectFiles(inputs, errors) {
  const files = [];
  for (const input of inputs) {
    let st;
    try { st = fs.statSync(input); } catch { errors.push(`cannot stat ${input}`); continue; }
    if (st.isFile()) { files.push(input); continue; }
    if (st.isDirectory()) {
      const walk = (dir) => {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { errors.push(`cannot read dir ${dir}: ${e.message}`); return; }
        for (const e of entries) {
          if (e.name.startsWith('.') && e.name !== '.designer') continue;
          if (SKIP_DIRS.has(e.name)) continue;
          const p = path.join(dir, e.name);
          if (e.isDirectory()) walk(p);
          else if (SCAN_EXTS.has(path.extname(e.name).toLowerCase())) files.push(p);
        }
      };
      walk(input);
    }
  }
  return files;
}

function suppressIgnored(findings, ignores) {
  const out = [];
  for (const f of findings) {
    let suppressed = false;
    for (const r of ignores) {
      if (r.endLine === null) r.endLine = Infinity;
      if (f.line >= r.startLine && f.line <= r.endLine && (r.rules.includes('*') || r.rules.includes(f.rule))) {
        r.suppressed++;
        suppressed = true;
        break;
      }
    }
    if (!suppressed) out.push(f);
  }
  return out;
}

function run(args) {
  let opts;
  try {
    opts = parseArgs(args);
  } catch (e) {
    process.stderr.write(`error: ${e.message}\n\n${USAGE}\n`);
    return 1;
  }

  if (opts.help) {
    process.stdout.write(USAGE + '\n');
    return 0;
  }

  if (opts.listRules) {
    const rows = RULESET.rules.map((r) => ({
      id: r.id, name: r.name, category: r.category, severity: r.severity,
      scopes: r.scopes, tier: r.tier, status: r.status,
      advisory: ADVISORY_SEVERITIES.includes(r.severity),
    }));
    if (opts.json) {
      process.stdout.write(JSON.stringify({ tool: RULESET.tool, rulesetVersion: RULESET.version, count: rows.length, rules: rows }, null, 2) + '\n');
    } else {
      const w = (s, n) => String(s).padEnd(n);
      process.stdout.write(`${w('ID', 28)}${w('SEVERITY', 13)}${w('CATEGORY', 10)}${w('SCOPES', 10)}${w('TIER', 20)}STATUS\n`);
      for (const r of rows) process.stdout.write(`${w(r.id, 28)}${w(r.severity, 13)}${w(r.category, 10)}${w(r.scopes.join(','), 10)}${w(r.tier, 20)}${r.status}${r.advisory ? ' (advisory)' : ''}\n`);
      const byStatus = {};
      for (const r of RULESET.rules) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      process.stdout.write(`\n${RULESET.rules.length} rules total: ` + Object.entries(byStatus).map(([k, v]) => `${v} ${k}`).join(', ') + '\n');
    }
    return 0;
  }

  if (!opts.files.length) {
    process.stderr.write('error: no files given\n\n' + USAGE + '\n');
    return 1;
  }

  const errors = [];
  const files = collectFiles(opts.files, errors);
  const rules = activeRulesFor(opts);
  const findings = [];
  const activeIgnores = [];

  for (const file of files) {
    let model;
    try {
      model = buildModel(file);
    } catch (e) {
      errors.push(`scan failure ${file}: ${e.message}`);
      continue;
    }
    const fileFindings = [];
    for (const rule of rules) {
      const check = CHECKS[rule.id];
      if (!check) continue;
      let hits = [];
      try { hits = check(model) ?? []; } catch { /* a failing check must never crash the scan */ }
      for (const h of hits) {
        fileFindings.push({
          file,
          line: h.line ?? 1,
          rule: rule.id,
          severity: rule.severity,
          message: rule.message ?? rule.name,
          evidence: h.evidence ?? '',
        });
      }
    }
    const kept = suppressIgnored(fileFindings, model.ignores);
    findings.push(...kept);
    for (const ig of model.ignores) {
      activeIgnores.push({ file, rule: ig.rules.join(','), reason: ig.reason || '', line: ig.startLine, endLine: ig.endLine === Infinity ? null : ig.endLine, suppressed: ig.suppressed });
    }
  }

  const counts = { blocker: 0, warning: 0, polish: 0, informational: 0 };
  for (const f of findings) counts[f.severity]++;
  const gating = counts.blocker + counts.warning;
  const exitCode = errors.length ? 1 : gating > 0 ? 2 : 0;

  if (opts.json) {
    process.stdout.write(JSON.stringify({
      tool: RULESET.tool,
      rulesetVersion: RULESET.version,
      files: files,
      scanned: files.length,
      findings,
      counts: { ...counts, total: findings.length, gating },
      activeIgnores,
      errors,
      exitCode,
    }, null, 2) + '\n');
  } else {
    for (const f of findings) {
      process.stderr.write(`${f.file}:${f.line}  [${f.severity}] ${f.rule} — ${f.message}\n    ${f.evidence}\n`);
    }
    for (const ig of activeIgnores) {
      process.stderr.write(`${ig.file}:${ig.line}  [ignore] ${ig.rule}${ig.suppressed ? ` (suppressed ${ig.suppressed})` : ''}${ig.reason ? ` — ${ig.reason}` : ''}\n`);
    }
    for (const e of errors) process.stderr.write(`error: ${e}\n`);
    if (!findings.length && !errors.length) process.stderr.write(`designer-detect: clean (${files.length} file${files.length === 1 ? '' : 's'} scanned)\n`);
    else process.stderr.write(`designer-detect: ${findings.length} finding(s) (${counts.blocker} blocker, ${counts.warning} warning, ${counts.polish} polish, ${counts.informational} informational) in ${files.length} file(s)\n`);
  }
  return exitCode;
}

process.exit(run(process.argv.slice(2)));
