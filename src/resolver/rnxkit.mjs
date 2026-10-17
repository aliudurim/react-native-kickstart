import { minorOf } from '../semver.mjs';

const RAW = 'https://raw.githubusercontent.com/microsoft/rnx-kit/main/packages/align-deps/src/presets/microsoft/react-native';

// Microsoft's align-deps profile for one RN minor: { capability: { name, version } }.
// The profiles are TypeScript object literals that spread the previous minor, so walk back
// until a profile exists and merge forward.
export async function alignDepsProfile(rnVersion, { maxBack = 3 } = {}) {
  const minor = minorOf(rnVersion);
  if (!minor) return null;
  const [maj, min] = minor.split('.').map(Number);
  const chain = [];
  for (let i = 0; i <= maxBack; i++) {
    const m = `${maj}.${min - i}`;
    const res = await fetch(`${RAW}/profile-${m}.ts`);
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`${res.status} align-deps profile ${m}`);
    chain.unshift({ minor: m, entries: parseProfile(await res.text()) });
    if (i === 0) break;
  }
  if (!chain.length) return null;
  const merged = {};
  for (const { entries } of chain) Object.assign(merged, entries);
  return { minor: chain.at(-1).minor, exact: chain.at(-1).minor === minor, entries: merged };
}

export function parseProfile(ts) {
  const out = {};
  const re = /^\s*(?:"([^"]+)"|([A-Za-z_][\w-]*)):\s*\{\s*name:\s*"([^"]+)",\s*version:\s*"([^"]+)"/gm;
  let m;
  while ((m = re.exec(ts))) out[m[1] ?? m[2]] = { name: m[3], version: m[4] };
  const consts = /const\s+(\w+):\s*Package\s*=\s*\{\s*name:\s*"([^"]+)",\s*version:\s*"([^"]+)"/g;
  const named = {};
  while ((m = consts.exec(ts))) named[m[1]] = { name: m[2], version: m[3] };
  const refs = /^\s*(?:"([^"]+)"|([A-Za-z_][\w-]*)):\s*(\w+),/gm;
  while ((m = refs.exec(ts))) if (named[m[3]]) out[m[1] ?? m[2]] = named[m[3]];
  return out;
}
