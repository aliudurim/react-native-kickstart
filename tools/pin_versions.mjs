#!/usr/bin/env node
// Resolves every artifact in the catalog and writes data/pinned.json, the --offline fallback.
// Refuses to write if anything failed to resolve.
import { writeFileSync } from 'node:fs';
import { catalog, resolveAll } from '../src/resolver/index.mjs';

const keys = Object.keys(catalog.artifacts).filter((k) => !catalog.profiles.expo.includes(k) && k !== 'expoRouter');
const { versions, ranges, warnings, row } = await resolveAll(keys, { workflow: 'bare', onProgress: (k, v) => process.stderr.write(`  ${k.padEnd(18)} ${v}\n`) });

const failed = Object.entries(versions).filter(([, v]) => !v).map(([k]) => k);
for (const w of warnings) console.error('warn:', w);
if (failed.length) {
  console.error(`refusing to pin; unresolved: ${failed.join(', ')}`);
  process.exit(1);
}
const expoKeys = Object.keys(catalog.artifacts).filter((k) => !catalog.profiles.bare.includes(k));
const expo = await resolveAll(expoKeys, { workflow: 'expo', onProgress: (k, v) => process.stderr.write(`  expo ${k.padEnd(13)} ${v}\n`) });
for (const w of expo.warnings) console.error('warn (expo):', w);
const expoFailed = Object.entries(expo.versions).filter(([, v]) => !v).map(([k]) => k);
if (expoFailed.length) {
  console.error(`refusing to pin; unresolved for expo: ${expoFailed.join(', ')}`);
  process.exit(1);
}
const out = { pinnedAt: new Date().toISOString(), rnRow: row, versions, ranges, expo: { rnRow: expo.row, versions: expo.versions, ranges: expo.ranges } };
writeFileSync(new URL('../data/pinned.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.error(`pinned ${Object.keys(versions).length} artifacts`);
