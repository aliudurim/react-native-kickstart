import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { hostIsLoopback, tokenMatches } from '../src/guard.mjs';
import { GROUPS, MODULES, PRESETS, normalizeChoices } from '../src/context.mjs';
import { libraries } from '../src/resolver/index.mjs';

const html = readFileSync(new URL('../gui/index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

test('the page has exactly one inline script and it parses', () => {
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new vm.Script(scripts[0]));
  assert.ok(!/<script[^>]+src=/.test(html), 'no external scripts');
  assert.ok(!/https?:\/\/[^"' ]+\.(js|css)/.test(html), 'no CDN assets');
});

test('nothing in the page or server is a template token', () => {
  const server = readFileSync(new URL('../bin/gui.mjs', import.meta.url), 'utf8');
  assert.ok(!/\{\{\w+\}\}/.test(html));
  assert.ok(!/\{\{\w+\}\}/.test(server));
});

test('Host must be a loopback literal, so DNS rebinding is refused', () => {
  for (const ok of ['127.0.0.1', '127.0.0.1:5173', 'localhost', 'localhost:80', '[::1]:5173']) assert.equal(hostIsLoopback(ok), true, ok);
  for (const bad of ['evil.example', 'evil.example:5173', '127.0.0.1.evil.example', '', undefined]) assert.equal(hostIsLoopback(bad), false, String(bad));
});

test('the API token is compared safely and rejects near misses', () => {
  const token = 'a'.repeat(48);
  assert.equal(tokenMatches(token, token), true);
  for (const bad of ['', null, undefined, 'a'.repeat(47), 'a'.repeat(49), `b${'a'.repeat(47)}`, 42]) assert.equal(tokenMatches(token, bad), false, String(bad));
});

test('the server mints a 48-hex token and only accepts it via ?t= or x-rnk-token', () => {
  const server = readFileSync(new URL('../bin/gui.mjs', import.meta.url), 'utf8');
  assert.match(server, /randomBytes\(24\)\.toString\('hex'\)/);
  assert.match(server, /searchParams\.get\('t'\) \?\? headers\['x-rnk-token'\]/);
  assert.match(server, /replace\('__RNK_TOKEN__', TOKEN\)/);
  assert.match(server, /\/\^\[A-Za-z0-9\._-\]\+\$\//, 'static file names are restricted');
});

test('every API call from the page goes through api() and carries the token', () => {
  const script = scripts[0];
  const raw = script.match(/(?:fetch|EventSource|sendBeacon)\(\s*['"`]\/api\//g) ?? [];
  assert.deepEqual(raw, [], `bypass api(): ${raw.join(', ')}`);
  assert.match(script, /const TOKEN = '__RNK_TOKEN__'/);
  assert.match(script, /u\.searchParams\.set\('t', TOKEN\)/);
  const calls = script.match(/api\('\/api\/[a-z-]+'/g) ?? [];
  for (const path of ['/api/init', '/api/preview', '/api/pick-folder', '/api/create', '/api/ping', '/api/bye']) assert.ok(calls.some((c) => c.includes(`'${path}'`)), `page never calls ${path}`);
});

test('every preset sets every group to a valid value and names only real modules', () => {
  for (const [name, p] of Object.entries(PRESETS)) {
    for (const [g, allowed] of Object.entries(GROUPS)) assert.ok(allowed.includes(p[g]), `${name}.${g} = ${p[g]}`);
    for (const m of p.modules) assert.ok(MODULES.includes(m), `${name} module ${m}`);
    assert.doesNotThrow(() => normalizeChoices(p), name);
  }
  const meta = new vm.Script(`${scripts[0].match(/const PRESET_META = \{[\s\S]*?\n\};/)[0]}; PRESET_META`).runInNewContext();
  for (const name of Object.keys(PRESETS)) assert.ok(meta[name]?.title, `page has no card text for preset "${name}"`);
  assert.ok(meta.custom, 'page needs a "custom" card');
});

test('the page labels every option, every module and every group it renders', () => {
  const src = scripts[0];
  const labels = new vm.Script(`${src.match(/const OPTION_LABELS = \{[\s\S]*?\n\};/)[0]}; OPTION_LABELS`).runInNewContext();
  const groupLabels = new vm.Script(`${src.match(/const GROUP_LABELS = \{.*\};/)[0]}; GROUP_LABELS`).runInNewContext();
  for (const [g, opts] of Object.entries(GROUPS)) {
    if (g === 'sample' || g === 'store') continue;
    assert.ok(groupLabels[g], `no label for group ${g}`);
    for (const o of opts) assert.ok(labels[o], `no label for option ${o}`);
  }
  for (const m of MODULES) assert.ok(labels[m], `no label for module ${m}`);
});

test('libraries.json has an entry for every option and module', () => {
  const absent = new Set(['none', 'yes', 'no']);
  for (const opts of Object.values(GROUPS)) for (const o of opts) if (!absent.has(o)) assert.ok(libraries[o]?.summary, `libraries.json lacks "${o}"`);
  for (const m of MODULES) assert.ok(libraries[m]?.summary, `libraries.json lacks "${m}"`);
});

function pageFn(name) {
  const src = scripts[0];
  const esc = src.match(/^const esc = .*$/m)[0];
  const fn = src.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`))[0];
  return new vm.Script(`${esc}\n${fn}\n${name}`).runInNewContext();
}

test('package.json highlighter marks exact pins and dims ranges without altering the text', () => {
  const highlightPkg = pageFn('highlightPkg');
  const pkg = { name: 'x', version: '0.0.1', scripts: { test: 'jest' }, dependencies: { 'react-native': '0.88.1', react: '^19.3.0', '@tanstack/react-query': '~5.90.0' }, engines: { node: '>=22.13.0' } };
  const out = highlightPkg(pkg);
  assert.match(out, /<span class="pin">&quot;0\.88\.1&quot;<\/span>/);
  assert.match(out, /<span class="str">&quot;0\.0\.1&quot;<\/span>/, 'only dependency versions are pins');
  assert.match(out, /<span class="range">&quot;\^19\.3\.0&quot;<\/span>/);
  assert.match(out, /<span class="range">&quot;~5\.90\.0&quot;<\/span>/);
  assert.match(out, /<span class="range">&quot;&gt;=22\.13\.0&quot;<\/span>/);
  assert.match(out, /<span class="str">&quot;jest&quot;<\/span>/);
  assert.match(out, /<span class="key">&quot;@tanstack\/react-query&quot;<\/span>/);
  const stripped = out.replace(/<\/?span[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
  assert.equal(stripped, JSON.stringify(pkg, null, 2));
});

test('the page hides navigation and data options the CLI would reject', () => {
  const src = scripts[0];
  const body = src.match(/function optionHidden\([^)]*\) \{[\s\S]*?\n\}/)[0];
  const ctx = { choices: { workflow: 'bare', state: 'rtk' } };
  vm.runInNewContext(`${body}; globalThis.optionHidden = optionHidden`, ctx);
  assert.equal(ctx.optionHidden('nav', 'expo-router'), true);
  assert.equal(ctx.optionHidden('data', 'tanstack-query'), true);
  assert.equal(ctx.optionHidden('data', 'rtk-query'), false);
  ctx.choices = { workflow: 'expo', state: 'zustand' };
  assert.equal(ctx.optionHidden('nav', 'expo-router'), false);
  assert.equal(ctx.optionHidden('data', 'rtk-query'), true);
  assert.equal(ctx.optionHidden('data', 'fetch'), false);
});

test('tab bar has New project active and Store assets as a disabled placeholder', () => {
  assert.match(html, /role="tab" aria-selected="true">New project</);
  assert.match(html, /role="tab"[^>]*disabled[^>]*title="coming next">Store assets</);
});
