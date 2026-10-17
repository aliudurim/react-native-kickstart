import { readFileSync } from 'node:fs';
import { packument, resolveLatest, mapLimit, fetchJson } from './npm.mjs';
import { compare, isStable, satisfies, minorOf, gte, underCeiling, newestSatisfying } from '../semver.mjs';
import { latestSdk, bundledNativeModules } from './expo.mjs';
import { newArchSupport } from './directory.mjs';

const dataDir = new URL('../../data/', import.meta.url);
export const catalog = JSON.parse(readFileSync(new URL('catalog.json', dataDir), 'utf8'));
export const compat = JSON.parse(readFileSync(new URL('compat.json', dataDir), 'utf8'));
export const libraries = JSON.parse(readFileSync(new URL('libraries.json', dataDir), 'utf8'));
export function pinned() {
  try { return JSON.parse(readFileSync(new URL('pinned.json', dataDir), 'utf8')); } catch { return null; }
}

// choices: { workflow, nav, state, data, styling, storage, forms, i18n, lists, modules: [] }
export function keysFor(choices) {
  const p = catalog.profiles;
  const keys = new Set([...p.base, ...(p[choices.workflow] ?? [])]);
  for (const group of ['nav', 'state', 'data', 'styling', 'storage', 'forms', 'i18n', 'lists'])
    for (const k of p[group]?.[choices[group]] ?? []) keys.add(k);
  for (const m of choices.modules ?? []) for (const k of p.modules[m] ?? []) keys.add(k);
  return [...keys];
}

export function rnRow(version) {
  const minor = minorOf(version);
  return compat.rn.find((r) => r.minor === minor) ?? null;
}

export function rnCeilingForXcode(xcodeVersion) {
  if (!xcodeVersion) return null;
  const rows = compat.toolchain.xcode.slice().sort((a, b) => compare(fill(b.version), fill(a.version)));
  for (const r of rows) if (gte(fill(xcodeVersion), fill(r.version))) return r.rnMax;
  return rows.at(-1)?.rnMax ?? null;
}
const fill = (v) => { const p = String(v).split('.'); while (p.length < 3) p.push('0'); return p.join('.'); };

// Resolves every key for the given choices. Returns { versions, ranges, meta, warnings }.
export async function resolveAll(keys, { rnCeiling = null, workflow = 'bare', onProgress = () => {} } = {}) {
  const A = catalog.artifacts;
  const warnings = [];
  const versions = {};
  const meta = {};
  const rangeOverrides = {};

  // 1. React Native, and in Expo mode the SDK's known-good set.
  let expoInfo = null;
  if (workflow === 'expo') {
    expoInfo = await latestSdk();
    versions.rn = expoInfo.reactNative;
    const bundled = await bundledNativeModules(expoInfo.sdk);
    for (const [key, art] of Object.entries(A)) if (bundled[art.pkg] && key !== 'rn') rangeOverrides[key] = bundled[art.pkg];
    if (rangeOverrides.expo === undefined) rangeOverrides.expo = `~${expoInfo.sdk.split('.')[0]}.0.0`;
    meta.expo = expoInfo;
  } else {
    const r = await resolveLatest('react-native', { ceiling: rnCeiling });
    versions.rn = r.version;
    meta.rn = r;
    if (r.cappedBelowLatest) warnings.push(`react-native capped at ${r.version} (latest is ${r.latestTag}) by your Xcode.`);
  }
  const rn = versions.rn;
  const row = rnRow(rn);
  if (!row) warnings.push(`compat.json has no row for react-native ${minorOf(rn)}; Node/Xcode/JDK/NDK floors are unverified.`);
  onProgress('rn', rn);

  // 2. Everything else, in dependency order: keys that give ranges to others go first.
  const ordered = topo(keys, A);
  const peerDocs = {};
  for (const key of ordered) {
    const art = A[key];
    if (!art) { warnings.push(`catalog has no artifact "${key}"`); continue; }
    if (key === 'rn') continue;
    try {
      let v;
      if (art.trackRn) {
        v = await pickTrackingRn(art.pkg, rn);
      } else {
        const range = rangeOverrides[key] ?? (art.rangeFromPeerOf ? peerRange(peerDocs, A, art.rangeFromPeerOf, art.pkg) : null);
        const doc = await packument(art.pkg);
        peerDocs[key] = doc;
        const all = Object.keys(doc.versions);
        const stable = all.filter((x) => isStable(x, art.stablePattern));
        const bounded = (list) => list.filter((x) => underCeiling(x, art.ceiling) && (!art.floor || gte(x, art.floor)));
        let candidates = bounded(stable.filter((x) => !doc.versions[x].deprecated));
        if (!candidates.length && bounded(stable).length) {
          candidates = bounded(stable);
          warnings.push(`${art.pkg}: every version under the ceiling ${art.ceiling} is marked deprecated on npm; taking the newest anyway (${art.note ?? 'ceiling set in catalog'}).`);
        }
        if (range) candidates = candidates.filter((x) => satisfies(x, range));
        if (art.rnPeer) {
          const ok = candidates.filter((x) => satisfies(rn, doc.versions[x].peerDependencies?.['react-native'] ?? '*'));
          if (ok.length) candidates = ok; else warnings.push(`${art.pkg}: no stable version declares support for react-native ${rn}; taking the newest and letting the build decide.`);
        }
        v = candidates.sort(compare).at(-1) ?? null;
        if (!v) throw new Error(`no version of ${art.pkg} satisfies ${[range, art.ceiling && `<= ${art.ceiling}`, art.floor && `>= ${art.floor}`].filter(Boolean).join(', ')}`);
        if (art.pairedWith) {
          for (const paired of art.pairedWith) {
            const peer = doc.versions[v].peerDependencies?.[A[paired].pkg];
            if (peer && peer !== '*') rangeOverrides[paired] = rangeOverrides[paired] ?? peer;
          }
        }
        if (art.compatJson) await applyCompatJson(art, v, rn, A, rangeOverrides, warnings);
        meta[key] = { latestTag: doc['dist-tags']?.latest, skippedPrerelease: all.length - candidates.length };
      }
      versions[key] = v;
      onProgress(key, v);
    } catch (e) {
      meta[key] = { error: e.message };
      warnings.push(`${art.pkg}: ${e.message}`);
      versions[key] = null;
    }
  }

  // 3. Health: New Architecture support for every native module.
  const nativePkgs = keys.filter((k) => A[k]?.native && !A[k].dev && !A[k].trackRn && k !== 'rn' && !k.startsWith('expo')).map((k) => A[k].pkg);
  try {
    meta.newArch = await newArchSupport(nativePkgs);
    for (const [pkg, s] of Object.entries(meta.newArch)) if (s === 'unsupported') warnings.push(`${pkg} reports no New Architecture support (reactnative.directory).`);
  } catch (e) {
    warnings.push(`New Architecture check skipped: ${e.message}`);
  }

  return { versions, ranges: rangeOverrides, row, meta, warnings };
}

async function pickTrackingRn(pkg, rn) {
  const doc = await packument(pkg);
  const exact = doc.versions[rn] ? rn : null;
  if (exact) return exact;
  const v = newestSatisfying(Object.keys(doc.versions), `~${minorOf(rn)}.0`);
  if (!v) throw new Error(`no ${pkg} for react-native ${minorOf(rn)}`);
  return v;
}

function peerRange(peerDocs, A, fromKey, pkg) {
  const doc = peerDocs[fromKey];
  if (!doc) return null;
  return null;
}

async function applyCompatJson(art, v, rn, A, rangeOverrides, warnings) {
  try {
    const json = await fetchJson(art.compatJson.replace('{v}', v));
    const table = json.fabric ?? json;
    const entry = Object.entries(table).find(([k]) => k !== 'nightly' && satisfies(v, k));
    if (!entry) return;
    const [, info] = entry;
    const rnMinors = info['react-native'] ?? [];
    if (rnMinors.length && !rnMinors.includes(minorOf(rn)))
      warnings.push(`${art.pkg} ${v} lists react-native ${rnMinors.join(', ')} but not ${minorOf(rn)} (compatibility.json).`);
    const worklets = info['react-native-worklets'];
    if (worklets?.length) rangeOverrides.worklets = worklets.join(' || ');
  } catch (e) {
    warnings.push(`${art.pkg}: compatibility.json unavailable (${e.message}); using peerDependencies only.`);
  }
}

// Keys that hand ranges to others (pairedWith, compatJson) come first; rn stays first.
function topo(keys, A) {
  const set = new Set(keys);
  const givers = keys.filter((k) => A[k]?.pairedWith?.some((p) => set.has(p)) || A[k]?.compatJson);
  const rest = keys.filter((k) => !givers.includes(k));
  return ['rn', ...givers.filter((k) => k !== 'rn'), ...rest.filter((k) => k !== 'rn')];
}

// rn peer: react's range comes from react-native's own peerDependencies.
export async function reactRangeFor(rn) {
  const doc = await packument('react-native');
  return doc.versions[rn]?.peerDependencies ?? {};
}
