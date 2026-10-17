#!/usr/bin/env node
// End-to-end: scaffold real projects, verify them, drive the GUI server over HTTP,
// render store assets with the installed Chrome, and (optionally) build natively.
//   node test/e2e.mjs [--out=<dir>] [--native] [--skip-build] [--only=scaffold|gui|store|expo]
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const argv = process.argv.slice(2);
const flag = (n, d) => { const a = argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const has = (n) => argv.includes(`--${n}`);
const outRoot = flag('out', '/Users/da/Desktop/Personal/durAIM Projects/rnk-e2e');
const only = flag('only');
const build = !has('skip-build');
mkdirSync(outRoot, { recursive: true });

const results = [];
const step = async (name, fn) => {
  if (only && only !== name.split(':')[0]) return;
  const t = Date.now();
  process.stdout.write(`\n▶ ${name}\n`);
  try { await fn(); results.push([name, 'ok', Date.now() - t]); console.log(`✓ ${name} (${((Date.now() - t) / 1000).toFixed(0)}s)`); }
  catch (e) { results.push([name, `FAIL ${e.message}`, Date.now() - t]); console.error(`✗ ${name}: ${e.message}`); }
};
const assert = (c, m) => { if (!c) throw new Error(m); };
const run = (cmd, args, cwd = root, env = {}) => new Promise((res, rej) => {
  const p = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { LANG: 'en_US.UTF-8', ...process.env, ...env } });
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  p.on('exit', (code) => (code === 0 ? res(out) : rej(new Error(`${cmd} ${args.join(' ')} exited ${code}\n${out.split('\n').slice(-25).join('\n')}`))));
});
const kickstart = (args, extra = []) => run('node', [join(root, 'bin/kickstart.mjs'), '--yes', '--offline', '--force', '--pm=npm', ...args, ...extra]);
const files = (dir, out = []) => { for (const e of readdirSync(dir)) { const p = join(dir, e); if (e === 'node_modules' || e === '.git') continue; statSync(p).isDirectory() ? files(p, out) : out.push(p); } return out; };

// 1. Standard preset: scaffold + install + tsc + eslint + jest (+ native when asked).
const stdDir = join(outRoot, 'e2eapp');
const fresh = (dir) => { for (const e of existsSync(dir) ? readdirSync(dir) : []) if (e !== 'node_modules') rmSync(join(dir, e), { recursive: true, force: true }); };
await step('scaffold:standard', async () => {
  fresh(stdDir);
  const out = await kickstart(['--name=E2EApp', '--package=com.durim.e2eapp', `--out=${stdDir}`, ...(build ? [has('native') ? '--build=native' : '--build'] : [])]);
  assert(/wrote \d+ files/.test(out), 'no files written');
  for (const f of ['package.json', 'App.tsx', 'CLAUDE.md', 'ios/E2EApp.xcodeproj/project.pbxproj', 'android/app/build.gradle', 'src/store/store.ts', 'src/screens/login/LoginScreen.tsx', '.github/workflows/ci.yml', 'store/kickstart.store.json'])
    assert(existsSync(join(stdDir, f)), `missing ${f}`);
  const pkg = JSON.parse(readFileSync(join(stdDir, 'package.json'), 'utf8'));
  assert(/^\d+\.\d+\.\d+$/.test(pkg.dependencies['react-native']), 'react-native must be an exact pin');
  assert(pkg.dependencies['@reduxjs/toolkit'].startsWith('^'), 'JS-only deps keep carets');
  assert(!readFileSync(join(stdDir, 'android/app/build.gradle'), 'utf8').includes('helloworld'), 'placeholder left in gradle');
  if (build) assert(/✓ build passed/.test(out), 'build gate did not pass');
});

// 2. Expo preset: scaffold + verify.
const expoDir = join(outRoot, 'e2eexpo');
await step('expo:scaffold', async () => {
  fresh(expoDir);
  const out = await kickstart(['--preset=expo', '--name=E2EExpo', '--package=com.durim.e2eexpo', `--out=${expoDir}`, ...(build ? ['--build'] : [])]);
  assert(existsSync(join(expoDir, 'app.config.ts')) && existsSync(join(expoDir, 'app/_layout.tsx')), 'expo files missing');
  assert(!existsSync(join(expoDir, 'ios')), 'expo must not have ios/');
  if (build) assert(/✓ build passed/.test(out), 'expo build gate did not pass');
});

// 2b. Expo prebuild must succeed from the generated config (needs node_modules).
await step('expo:prebuild', async () => {
  if (!build) return;
  rmSync(join(expoDir, 'ios'), { recursive: true, force: true });
  const out = await run('npx', ['expo', 'prebuild', '--platform', 'ios', '--no-install'], expoDir, { CI: '1' });
  assert(/Finished prebuild/.test(out) && existsSync(join(expoDir, 'ios/Podfile')), `prebuild failed\n${out.slice(-600)}`);
});

// 2c. Simulator / emulator capture, only for devices that are already booted.
await step('store:capture', async () => {
  const { listBooted, captureIos, captureAndroid } = await import(join(root, 'src/store/capture.mjs'));
  const { pngInfo } = await import(join(root, 'src/store/png.mjs'));
  const booted = await listBooted();
  const dir = join(stdDir, 'store/shots/captured');
  mkdirSync(dir, { recursive: true });
  let n = 0;
  if (booted.ios?.length) { const out = join(dir, 'ios.png'); await captureIos({ udid: booted.ios[0].udid, out }); const i = pngInfo(readFileSync(out)); assert(i.width > 500 && i.height > i.width, 'ios capture shape'); n++; }
  if (booted.android?.length) { const out = join(dir, 'android.png'); await captureAndroid({ serial: booted.android[0].serial, out }); const i = pngInfo(readFileSync(out)); assert(i.width > 500 && i.height > i.width, 'android capture shape'); n++; }
  console.log(`  captured from ${n} booted device(s)${n ? '' : ' (none booted; skipped)'}`);
});

// 3. GUI server: init → preview → create, all over HTTP with the token.
await step('gui:api', async () => {
  const gui = spawn('node', [join(root, 'bin/gui.mjs'), '--no-open', '--port=0', '--keep-alive'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const url = await new Promise((res, rej) => {
      let buf = '';
      const onData = (d) => { buf += d; const m = /(http:\/\/127\.0\.0\.1:\d+)/.exec(buf); if (m) res(m[1]); };
      gui.stdout.on('data', onData); gui.stderr.on('data', onData);
      gui.on('exit', () => rej(new Error(`gui exited early\n${buf}`)));
      setTimeout(() => rej(new Error(`gui did not print a URL\n${buf}`)), 15000);
    });
    const page = await (await fetch(url)).text();
    const token = /const TOKEN = '([0-9a-f]{48})'/.exec(page);
    assert(token, 'token not found in page');
    const t = token[1];
    assert((await fetch(`${url}/api/init`)).status >= 400, 'api must refuse without token');
    const init = await (await fetch(`${url}/api/init?t=${t}`)).json();
    assert(init.env && init.presets && init.groups, 'init shape');
    const prev = await (await fetch(`${url}/api/preview?t=${t}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'GuiApp', package: 'com.durim.guiapp', choices: { preset: 'standard' }, offline: true }) })).json();
    assert(prev.versions?.rn && prev.packageJson?.dependencies?.['react-native'], 'preview shape');
    const guiDir = join(outRoot, 'guiapp');
    rmSync(guiDir, { recursive: true, force: true });
    const q = new URLSearchParams({ t, name: 'GuiApp', package: 'com.durim.guiapp', out: guiDir, offline: '1', force: '1', pm: 'npm', workflow: 'bare', state: 'zustand', data: 'tanstack-query', styling: 'stylesheet', storage: 'async-storage' });
    const sse = await (await fetch(`${url}/api/create?${q}`)).text();
    assert(/event:\s*done/.test(sse), `create did not finish\n${sse.slice(-800)}`);
    assert(existsSync(join(guiDir, 'src/store/useAuthStore.ts')), 'zustand store not generated by GUI create');
    assert(!files(guiDir).some((f) => /\.tmpl$/.test(f)), 'template files leaked');
  } finally { gui.kill(); }
});

// 4. Store assets: config → placeholder shots → headless render → fastlane tree → icons.
await step('store:render', async () => {
  const { encodePng } = await import(join(root, 'src/store/png.mjs'));
  const shotsDir = join(stdDir, 'store/shots/en-US');
  mkdirSync(shotsDir, { recursive: true });
  const shot = (w, h, hue) => {
    const px = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; px[i] = hue; px[i + 1] = 60 + ((y / h) * 160) | 0; px[i + 2] = 200; px[i + 3] = 255; if (y < 120) px[i] = px[i + 1] = px[i + 2] = 245; }
    return encodePng(px, w, h);
  };
  writeFileSync(join(shotsDir, 'login.png'), shot(1320, 2868, 30));
  writeFileSync(join(shotsDir, 'home.png'), shot(1320, 2868, 120));
  const cfgPath = join(stdDir, 'store/kickstart.store.json');
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
  cfg.screens = [
    { id: 'login', source: 'store/shots/en-US/login.png', copy: { 'en-US': { headline: 'Sign in in *seconds*', subhead: 'One tap and you are home.' } } },
    { id: 'home', source: 'store/shots/en-US/home.png', copy: { 'en-US': { headline: 'Everything in *one place*', subhead: '' } } },
  ];
  cfg.sizes = ['iphone-6-9', 'android-phone'];
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  const out = await run('node', [join(root, 'bin/store.mjs'), 'render', `--project=${stdDir}`], stdDir);
  const ios = join(stdDir, 'fastlane/screenshots/en-US');
  const play = join(stdDir, 'fastlane/metadata/android/en-US/images/phoneScreenshots');
  assert(existsSync(ios) && readdirSync(ios).length >= 2, `no App Store tiles\n${out.slice(-500)}`);
  assert(existsSync(play) && readdirSync(play).length >= 2, 'no Play tiles');
  const dims = (f) => { const b = readFileSync(f); if (b[0] === 0x89) return [b.readUInt32BE(16), b.readUInt32BE(20)]; let i = 2; while (i < b.length) { if (b[i] !== 0xff) break; const m = b[i + 1], len = b.readUInt16BE(i + 2); if (m >= 0xc0 && m <= 0xc3) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)]; i += 2 + len; } return null; };
  const [iw, ih] = dims(join(ios, readdirSync(ios).sort()[0]));
  assert(iw === 1320 && ih === 2868, `App Store tile is ${iw}×${ih}`);
  const [pw, ph] = dims(join(play, readdirSync(play).sort()[0]));
  assert(pw === 1080 && ph === 1920, `Play tile is ${pw}×${ph}`);
  writeFileSync(join(stdDir, 'store/icon.png'), shot(1024, 1024, 200));
  await run('node', [join(root, 'bin/store.mjs'), 'icons', `--project=${stdDir}`, '--from=store/icon.png'], stdDir);
  assert(existsSync(join(stdDir, 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png')), 'android icon missing');
  assert(existsSync(join(stdDir, 'fastlane/metadata/android/en-US/images/icon.png')), 'play icon missing');
});

console.log('\n' + results.map(([n, r, ms]) => `${r === 'ok' ? '✓' : '✗'} ${n.padEnd(20)} ${(ms / 1000).toFixed(0)}s ${r === 'ok' ? '' : r}`).join('\n'));
process.exit(results.some(([, r]) => r !== 'ok') ? 1 : 0);
