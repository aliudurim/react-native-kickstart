#!/usr/bin/env node
// Generates real projects and verifies each one (install + tsc + eslint + jest), failing on any
// non-zero exit. This is the only test that proves the resolved version set composes across
// option combinations, not just for the defaults.
//
// The full cartesian product is 2*3*3*3*2*2*2*2 = 864 projects, which nobody will ever run.
// The default is an all-pairs (pairwise) set: every pair of option values appears together in
// at least one project, which is where interaction bugs actually live. --full does the lot.
// `data` and `nav` are derived from `state` and `workflow`, not varied.
//
//   node test/matrix.mjs                     pairwise (default)
//   node test/matrix.mjs --full              every combination
//   node test/matrix.mjs --start=0 --limit=4 slice it to fit a time window
//   node test/matrix.mjs --quick             reuse node_modules already in the target dirs
//   node test/matrix.mjs --native            --build=native (pod install, xcodebuild, gradlew)
//   node test/matrix.mjs --out=<dir>         where projects and matrix-report.json go

import { spawn } from 'node:child_process';
import { rmSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const toolRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n, d) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const has = (n) => argv.includes(`--${n}`);
const outRoot = resolve(flag('out', '/Users/da/Desktop/Personal/durAIM Projects/rnk-matrix'));
const quick = has('quick');
const native = has('native');

const DIMS = {
  workflow: ['bare', 'expo'],
  state:    ['rtk', 'zustand', 'none'],
  styling:  ['nativewind', 'unistyles', 'stylesheet'],
  storage:  ['mmkv', 'async-storage', 'none'],
  forms:    ['rhf-zod', 'none'],
  i18n:     ['i18next', 'none'],
  lists:    ['flash-list', 'flatlist'],
  sample:   ['yes', 'no'],
};
const NAMES = Object.keys(DIMS);

const derive = (row) => ({
  ...row,
  nav: row.workflow === 'expo' ? 'expo-router' : 'react-navigation',
  data: row.state === 'rtk' ? 'rtk-query' : 'tanstack-query',
});

function cartesian() {
  return NAMES.reduce((acc, key) => acc.flatMap((row) => DIMS[key].map((v) => ({ ...row, [key]: v }))), [{}]);
}

const pairsOf = (row) => {
  const out = [];
  for (let i = 0; i < NAMES.length; i++) {
    for (let j = i + 1; j < NAMES.length; j++) out.push(`${NAMES[i]}=${row[NAMES[i]]}|${NAMES[j]}=${row[NAMES[j]]}`);
  }
  return out;
};

// Greedy all-pairs: each round takes the candidate covering the most still-uncovered value
// pairs. The product is small enough to scan in full every round, which gives a tighter set
// than a randomised heuristic.
function pairwise() {
  const required = new Set();
  for (let i = 0; i < NAMES.length; i++) {
    for (let j = i + 1; j < NAMES.length; j++) {
      for (const a of DIMS[NAMES[i]]) for (const b of DIMS[NAMES[j]]) required.add(`${NAMES[i]}=${a}|${NAMES[j]}=${b}`);
    }
  }
  const all = cartesian();
  const covered = new Set();
  const chosen = [];
  while (covered.size < required.size) {
    let best = null, bestGain = 0;
    for (const row of all) {
      const gain = pairsOf(row).filter((p) => !covered.has(p)).length;
      if (gain > bestGain) { bestGain = gain; best = row; }
    }
    if (!best) break;
    for (const p of pairsOf(best)) covered.add(p);
    chosen.push(best);
  }
  return chosen;
}

const all = (has('full') ? cartesian() : pairwise()).map(derive);
const start = Number(flag('start', '0'));
const limit = Number(flag('limit', String(all.length)));
const combos = all.slice(start, start + limit);

function run(cmd, args, cwd) {
  return new Promise((res) => {
    const p = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('error', (e) => res({ code: 1, out: out + e.message }));
    p.on('close', (code) => res({ code: code ?? 1, out }));
  });
}

const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const FIRST_ERROR = /^(error |.*error TS\d+|.*\berror\b.*@typescript-eslint|FAIL |npm ERR!|npm error|ERR_|.*✖ \d+ problems?|\s*● .*›)/m;
const firstError = (plain) => (plain.match(FIRST_ERROR)?.[0] ?? plain.trim().split('\n').filter(Boolean).at(-1) ?? '').trim().slice(0, 110);

async function generate(i, combo) {
  const dir = join(outRoot, `m${i}`);
  const reuse = quick && existsSync(join(dir, 'node_modules'));
  if (!reuse) rmSync(dir, { recursive: true, force: true });

  const gen = [
    join(toolRoot, 'bin', 'kickstart.mjs'), '--yes', '--offline', '--force', '--pm=npm',
    `--name=M${i}`, `--out=${dir}`,
    ...Object.keys(combo).map((k) => `--${k}=${combo[k]}`),
  ];
  if (!reuse) gen.push(native ? '--build=native' : '--build');

  let r = await run('node', gen, toolRoot);
  if (r.code === 0 && reuse) r = await run('npm', ['run', 'verify'], dir);
  return { ...r, dir, reuse };
}

mkdirSync(outRoot, { recursive: true });
const label = (c) => NAMES.map((k) => c[k]).join('-');
console.log(`${all.length} combination(s) ${has('full') ? '(full)' : '(pairwise)'}; running ${combos.length} from index ${start}`
  + `${quick ? ' [quick]' : ''}${native ? ' [native]' : ''} → ${outRoot}\n`);

const results = [];
const t0 = Date.now();

for (let n = 0; n < combos.length; n++) {
  const i = start + n;
  const combo = combos[n];
  process.stdout.write(`m${String(i).padEnd(3)} ${label(combo).padEnd(70)} `);
  const tc = Date.now();

  // npm install occasionally fails for reasons unrelated to the generated code (registry
  // hiccups, tarball timeouts). Retry once so a flake is reported as flaky, not as broken.
  let r = await generate(i, combo);
  let flaky = false;
  if (r.code !== 0) {
    const retry = await generate(i, combo);
    if (retry.code === 0) flaky = true;
    r = retry;
  }

  const plain = strip(r.out);
  const ok = r.code === 0;
  const secs = Math.round((Date.now() - tc) / 1000);
  const error = ok ? null : firstError(plain);
  results.push({ index: i, name: `M${i}`, dir: r.dir, choices: combo, ok, flaky, reused: r.reuse, seconds: secs, error });
  if (!ok) writeFileSync(join(outRoot, `m${i}.log`), plain, 'utf8');

  console.log(ok ? `${flaky ? 'OK (needed a retry)' : 'OK'} ${secs}s${r.reuse ? ' (reused node_modules)' : ''}` : `FAILED ${secs}s  ${error}`);
}

const passed = results.filter((r) => r.ok);
const flakes = results.filter((r) => r.flaky);
const total = Math.round((Date.now() - t0) / 1000);

console.log(`\n${'#'.padEnd(5)}${'result'.padEnd(8)}${'time'.padEnd(7)}${NAMES.map((n) => n.padEnd(14)).join('')}`);
for (const r of results) {
  console.log(`${`m${r.index}`.padEnd(5)}${(r.ok ? (r.flaky ? 'flaky' : 'ok') : 'FAIL').padEnd(8)}${`${r.seconds}s`.padEnd(7)}${NAMES.map((n) => r.choices[n].padEnd(14)).join('')}`);
}
console.log(`\n${passed.length}/${results.length} passed in ${total}s`
  + (flakes.length ? `  (${flakes.length} needed a retry: ${flakes.map((f) => f.name).join(', ')})` : ''));

writeFileSync(join(outRoot, 'matrix-report.json'), JSON.stringify({
  ranAt: new Date().toISOString(), mode: has('full') ? 'full' : 'pairwise', quick, native, start, limit: combos.length,
  totalCombos: all.length, passed: passed.length, failed: results.length - passed.length, seconds: total, results,
}, null, 2) + '\n', 'utf8');

const bad = results.filter((r) => !r.ok);
if (bad.length) {
  console.log('\nneeds attention:');
  for (const r of bad) console.log(`  ${r.name}  ${r.error}\n      log: ${join(outRoot, `m${r.index}.log`)}`);
  process.exit(1);
}
