#!/usr/bin/env node
// Scaffolds representative configurations (no network, no native copy) and fails if the
// written files still contain template tags or identifiers that configuration must not have.
import { readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { scaffold } from '../src/scaffold.mjs';
import { normalizeChoices, PRESETS } from '../src/context.mjs';
import { pinned } from '../src/resolver/index.mjs';
import { tmpDir } from '../src/native.mjs';

const p = pinned();
if (!p) { console.error('audit needs data/pinned.json'); process.exit(1); }

const CONFIGS = [
  { name: 'standard', choices: PRESETS.standard, forbid: ['zustand', '@tanstack', 'expo-router', 'react-native-unistyles', 'AsyncStorage'] },
  { name: 'expo', choices: PRESETS.expo, forbid: ['@reduxjs', 'react-redux', '@react-navigation/native-stack', 'react-native-config'] },
  { name: 'minimal', choices: PRESETS.minimal, forbid: ['@reduxjs', 'zustand', '@tanstack', 'nativewind', 'react-native-mmkv', 'react-hook-form', 'i18next', '@shopify/flash-list', 'kickstart.store', 'HomeContent'] },
  { name: 'zustand-unistyles', choices: { ...PRESETS.standard, state: 'zustand', styling: 'unistyles', storage: 'async-storage' }, forbid: ['@reduxjs', 'react-redux', 'nativewind', 'react-native-mmkv', 'className='] },
  { name: 'stylesheet-nostate', choices: { ...PRESETS.standard, state: 'none', styling: 'stylesheet', storage: 'none', forms: 'none', i18n: 'none' }, forbid: ['@reduxjs', 'zustand', 'nativewind', 'react-native-unistyles', 'useTranslation', 'zodResolver', 'react-native-mmkv'] },
  { name: 'all-modules', choices: { ...PRESETS.standard, modules: ['crash', 'analytics', 'roles', 'media', 'push'] }, forbid: [] },
  { name: 'no-sample', choices: { ...PRESETS.standard, sample: 'no' }, forbid: ['HomeContent', 'sampleItems'] },
];

let failures = 0;
for (const cfg of CONFIGS) {
  const out = tmpDir(`rnk-audit-${cfg.name}`);
  const choices = normalizeChoices(cfg.choices);
  try {
    const set = (choices.workflow === 'expo' && p.expo) || p;
    await scaffold({ name: 'AuditApp', bundleId: 'com.example.auditapp', outDir: out, choices, versions: set.versions, row: set.rnRow, pm: 'npm', skipNative: true, kickstartCmd: 'rn-kickstart' });
  } catch (e) {
    console.error(`✗ ${cfg.name}: ${e.message}`);
    failures++;
    continue;
  }
  const problems = [];
  for (const f of walk(out)) {
    if (/\.(png|jpg|jar|keystore)$/.test(f)) continue;
    const text = readFileSync(f, 'utf8');
    const rel = f.slice(out.length + 1);
    if (/\{\{[\w.#/]+\}\}/.test(text)) problems.push(`${rel}: leftover template tag`);
    if (rel.endsWith('.md')) continue;
    for (const id of cfg.forbid) {
      const hit = text.split('\n').findIndex((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && l.includes(id));
      if (hit >= 0) problems.push(`${rel}:${hit + 1}: contains "${id}"`);
    }
  }
  if (problems.length) { failures++; console.error(`✗ ${cfg.name}\n  ${problems.join('\n  ')}`); }
  else console.log(`✓ ${cfg.name}`);
  rmSync(out, { recursive: true, force: true });
}
process.exit(failures ? 1 : 0);

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const f = join(dir, e);
    statSync(f).isDirectory() ? walk(f, out) : out.push(f);
  }
  return out;
}
