import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifests } from '../src/scaffold.mjs';
import { render } from '../src/render.mjs';
import { buildContext, normalizeChoices, GROUPS, PRESETS } from '../src/context.mjs';
import { pinned } from '../src/resolver/index.mjs';
import { validateIdentifiers } from '../src/scaffold.mjs';
import { fileURLToPath } from 'node:url';

const templatesRoot = fileURLToPath(new URL('../templates/', import.meta.url));
const p = pinned();

test('manifests reference existing templates and known flags', () => {
  const files = loadManifests();
  assert.ok(files.length > 20, `only ${files.length} templates in manifests`);
  const ctx = buildContext({ name: 'X', slug: 'x', bundleId: 'com.x.x', choices: normalizeChoices(PRESETS.standard), versions: p.versions, row: p.rnRow, pm: 'npm' });
  for (const [tmpl, dest, cond] of files) {
    assert.doesNotThrow(() => readFileSync(join(templatesRoot, tmpl)), `${tmpl} missing (dest ${dest})`);
    if (cond) assert.ok(cond in ctx, `${tmpl}: unknown condition flag "${cond}"`);
  }
});

test('every state × styling × storage × nav combination renders with no leftover tags', () => {
  const combos = [];
  for (const state of GROUPS.state) for (const styling of GROUPS.styling) for (const storage of GROUPS.storage) for (const workflow of GROUPS.workflow)
    combos.push({ state, styling, storage, workflow, nav: workflow === 'expo' ? 'expo-router' : 'react-navigation' });
  for (const c of combos) {
    const choices = normalizeChoices({ ...PRESETS.standard, ...c, modules: ['crash', 'analytics', 'roles', 'media', 'push'] });
    const ctx = buildContext({ name: 'X', slug: 'x', bundleId: 'com.x.x', choices, versions: p.versions, row: p.rnRow, pm: 'npm' });
    ctx.KICKSTART_CMD = 'rn-kickstart';
    for (const [tmpl, , cond] of loadManifests()) {
      if (cond && !ctx[cond]) continue;
      let out;
      assert.doesNotThrow(() => { out = render(readFileSync(join(templatesRoot, tmpl), 'utf8'), ctx); }, `${tmpl} with ${JSON.stringify(c)}`);
      assert.ok(!/\{\{[\w.#/]+\}\}/.test(out), `${tmpl} leaves a tag with ${JSON.stringify(c)}`);
    }
  }
});

test('hostile identifiers are rejected', () => {
  for (const name of ['My App', '1abc', 'a;rm', '../x', ''])
    assert.throws(() => validateIdentifiers({ name, bundleId: 'com.example.app' }), name);
  for (const bundleId of ['com', 'Com.Example', 'com.1x', 'com.example.class', 'com.exa mple'])
    assert.throws(() => validateIdentifiers({ name: 'App', bundleId }), bundleId);
  assert.doesNotThrow(() => validateIdentifiers({ name: 'Shoply', bundleId: 'com.example.shoply' }));
});

test('expo-router requires the expo workflow', () => {
  assert.throws(() => normalizeChoices({ workflow: 'bare', nav: 'expo-router' }));
});

test('bare App.tsx mounts NavigationRoot (the NavigationContainer), not the bare stack', () => {
  const ctx = buildContext({ name: 'X', slug: 'x', bundleId: 'com.x.x', choices: normalizeChoices(PRESETS.standard), versions: p.versions, row: p.rnRow, pm: 'npm' });
  const out = render(readFileSync(join(templatesRoot, 'root/App.tsx.tmpl'), 'utf8'), ctx);
  assert.match(out, /<NavigationRoot \/>/);
  assert.doesNotMatch(out, /<RootNavigator/);
});

test('tailwind config gets flat colour strings from tokens, not the light/dark map', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { createRequire } = await import('node:module');
  const ctx = buildContext({ name: 'X', slug: 'x', bundleId: 'com.x.x', choices: normalizeChoices(PRESETS.standard), versions: p.versions, row: p.rnRow, pm: 'npm' });
  const dir = mkdtempSync(join(tmpdir(), 'rnk-tokens-'));
  writeFileSync(join(dir, 'tokens.js'), render(readFileSync(join(templatesRoot, 'src/theme/tokens.js.tmpl'), 'utf8'), ctx));
  const { tailwindTheme } = createRequire(import.meta.url)(join(dir, 'tokens.js'));
  const tw = render(readFileSync(join(templatesRoot, 'root/tailwind.config.js.tmpl'), 'utf8'), ctx);
  assert.match(tw, /tailwindTheme\.colors/);
  assert.doesNotMatch(tw, /colors\.primary/);
  assert.match(tailwindTheme.colors.primary.DEFAULT, /^#[0-9A-Fa-f]{6}$/);
  assert.match(tailwindTheme.spacing.md, /^\d+px$/);
});
