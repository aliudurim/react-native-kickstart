import { compare, isStable, underCeiling, gte } from '../semver.mjs';

export const REGISTRY = 'https://registry.npmjs.org';
const ABBREVIATED = 'application/vnd.npm.install-v1+json';
const UA = 'react-native-kickstart (+https://github.com/durAIM/react-native-kickstart)';

const cache = new Map();

export async function fetchJson(url, { headers = {}, timeoutMs = 15000 } = {}) {
  if (cache.has(url)) return cache.get(url);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, ...headers }, signal: ac.signal });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    const json = await res.json();
    cache.set(url, json);
    return json;
  } finally {
    clearTimeout(t);
  }
}

export const encodeName = (pkg) => pkg.replace('/', '%2F');

export async function packument(pkg) {
  return fetchJson(`${REGISTRY}/${encodeName(pkg)}`, { headers: { accept: ABBREVIATED } });
}

export async function manifest(pkg, version = 'latest') {
  return fetchJson(`${REGISTRY}/${encodeName(pkg)}/${version}`);
}

// Resolves the newest stable version of one package.
// opts: { ceiling, floor, stablePattern, range, includeDeprecated }
export async function resolveLatest(pkg, opts = {}) {
  const doc = await packument(pkg);
  const all = Object.keys(doc.versions);
  const stable = all.filter((v) => isStable(v, opts.stablePattern))
    .filter((v) => opts.includeDeprecated || !doc.versions[v].deprecated);
  const bounded = stable
    .filter((v) => underCeiling(v, opts.ceiling))
    .filter((v) => !opts.floor || gte(v, opts.floor))
    .filter((v) => !opts.range || opts.range(v));
  const sorted = bounded.sort(compare);
  const version = sorted.at(-1) ?? null;
  const latestTag = doc['dist-tags']?.latest ?? null;
  return {
    pkg,
    version,
    latestTag,
    newestAny: all.sort(compare).at(-1),
    skippedPrerelease: all.length - stable.length,
    cappedBelowLatest: version && latestTag && compare(version, latestTag) < 0,
    peerDependencies: version ? doc.versions[version].peerDependencies ?? {} : {},
    dependencies: version ? doc.versions[version].dependencies ?? {} : {},
    engines: version ? doc.versions[version].engines ?? {} : {},
    tarball: version ? doc.versions[version].dist?.tarball : null,
  };
}

export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }));
  return out;
}
