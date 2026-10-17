import { fetchJson } from './npm.mjs';

// New Architecture support per package, from the React Native Directory.
// Returns { pkg: 'supported' | 'unsupported' | 'untested' | 'unknown' }.
export async function newArchSupport(pkgs) {
  if (!pkgs.length) return {};
  const url = `https://reactnative.directory/api/libraries/check?packages=${encodeURIComponent(pkgs.join(','))}`;
  const data = await fetchJson(url);
  const out = {};
  for (const p of pkgs) out[p] = data[p]?.newArchitecture ?? 'unknown';
  return out;
}
