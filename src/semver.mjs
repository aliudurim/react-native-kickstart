const STABLE = /^\d+\.\d+\.\d+$/;

export function isStable(v, pattern) {
  if (pattern) return new RegExp(pattern).test(v);
  return STABLE.test(v);
}

export function parse(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(String(v).trim());
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ?? null };
}

export function compare(a, b) {
  const pa = parse(a), pb = parse(b);
  if (!pa || !pb) return String(a).localeCompare(String(b));
  for (const k of ['major', 'minor', 'patch']) if (pa[k] !== pb[k]) return pa[k] - pb[k];
  if (pa.pre === pb.pre) return 0;
  if (pa.pre === null) return 1;
  if (pb.pre === null) return -1;
  const xs = pa.pre.split('.'), ys = pb.pre.split('.');
  for (let i = 0; i < Math.max(xs.length, ys.length); i++) {
    const x = xs[i], y = ys[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
    if (nx && ny && +x !== +y) return +x - +y;
    if (nx !== ny) return nx ? -1 : 1;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export const gte = (a, b) => compare(a, b) >= 0;
export const lt = (a, b) => compare(a, b) < 0;

export function minorOf(v) {
  const p = parse(v);
  return p ? `${p.major}.${p.minor}` : null;
}

// A ceiling is a prefix: "3" admits 3.x.x, "0.88" admits 0.88.x.
export function underCeiling(v, ceiling) {
  if (!ceiling) return true;
  const p = parse(v), c = String(ceiling).split('.').map(Number);
  if (!p) return false;
  const parts = [p.major, p.minor, p.patch];
  for (let i = 0; i < c.length; i++) {
    if (parts[i] < c[i]) return true;
    if (parts[i] > c[i]) return false;
  }
  return true;
}

// Supports the small subset npm packages actually use in compatibility data:
// "*", "0.88.0", "~4.3.0", "^2.8.2", ">=4.19 <4.25", "0.86 - 0.88", "4.7.x", "3.6.x - 3.8.x", "a || b".
export function satisfies(v, range) {
  if (!range || range.trim() === '*' || range.trim() === '') return true;
  return range.split('||').some((alt) => satisfiesOne(v, alt.trim()));
}

function satisfiesOne(v, rawRange) {
  const p = parse(v);
  if (!p) return false;
  const range = rawRange.replace(/(>=|<=|>|<|~|\^|=)\s+/g, '$1').trim();
  const hyphen = /^(\S+)\s+-\s+(\S+)$/.exec(range);
  if (hyphen) return gte(v, fill(hyphen[1])) && underCeiling(v, stripX(hyphen[2]));
  return range.split(/\s+/).every((tok) => {
    const m = /^(>=|<=|>|<|~|\^|=)?(.+)$/.exec(tok);
    const op = m[1] ?? '', raw = stripX(m[2]);
    const hasX = /x|\*/i.test(m[2]) || raw.split('.').length < 3;
    const full = fill(raw);
    switch (op) {
      case '>=': return gte(v, full);
      case '>': return compare(v, full) > 0;
      case '<': return lt(v, full);
      case '<=': return compare(v, full) <= 0;
      case '~': { const q = parse(full); return gte(v, full) && underCeiling(v, `${q.major}.${q.minor}`); }
      case '^': {
        const q = parse(full);
        const ceil = q.major > 0 ? `${q.major}` : q.minor > 0 ? `0.${q.minor}` : full;
        return gte(v, full) && (ceil === full ? compare(v, full) === 0 : underCeiling(v, ceil));
      }
      default: return hasX ? underCeiling(v, raw) && gte(v, full) : compare(v, full) === 0;
    }
  });
}

const stripX = (s) => s.replace(/\.(x|\*)$/gi, '').replace(/\.(x|\*)$/gi, '');
const fill = (s) => { const parts = s.split('.'); while (parts.length < 3) parts.push('0'); return parts.join('.'); };

export function newestSatisfying(versions, range, pattern) {
  return versions.filter((v) => isStable(v, pattern) && satisfies(v, range)).sort(compare).at(-1) ?? null;
}
