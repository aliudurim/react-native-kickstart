#!/usr/bin/env node
// Local GUI for react-native-kickstart: one page on 127.0.0.1, token-guarded JSON API, SSE for the
// long-running create. Folder picking goes through the platform's native dialog because a browser
// never hands a page a real filesystem path.

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { GROUPS, MODULES, PRESETS, DEFAULTS, normalizeChoices, slugify, buildContext } from '../src/context.mjs';
import { keysFor, resolveAll, pinned, rnRow, rnCeilingForXcode, libraries } from '../src/resolver/index.mjs';
import { scaffold, validateIdentifiers, dirIsEmpty, planFiles } from '../src/scaffold.mjs';
import { fetchTemplate } from '../src/native.mjs';
import { detectAll, defaultOutRoot } from '../src/detect.mjs';
import { buildPackageJson } from '../src/packagejson.mjs';
import { hostIsLoopback, tokenMatches } from '../src/guard.mjs';

const toolRoot = pathResolve(dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const flag = (n, d) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const PORT = Number(flag('port', '0'));
const NO_OPEN = argv.includes('--no-open');
const KEEP_ALIVE = argv.includes('--keep-alive');

// The GUI is an app, not a daemon: the page heartbeats and the server exits once nobody is looking.
const IDLE_TIMEOUT_MS = 20_000;
let lastSeen = Date.now();
let job = null;

if (!KEEP_ALIVE) {
  setInterval(() => {
    if (job) { lastSeen = Date.now(); return; }
    if (Date.now() - lastSeen > IDLE_TIMEOUT_MS) { console.log('browser closed - shutting down'); process.exit(0); }
  }, 5000).unref();
}

const TOKEN = randomBytes(24).toString('hex');
const tokenIsValid = (url, headers) => tokenMatches(TOKEN, url.searchParams.get('t') ?? headers['x-rnk-token']);

let envCache = null;
const env = () => (envCache ??= detectAll());

function pickPm(found) {
  for (const pm of ['pnpm', 'yarn', 'bun', 'npm']) if (found[pm]) return pm;
  return 'npm';
}

// Same version pipeline as bin/kickstart.mjs: live with the Xcode cap, or pinned.json when offline;
// any key the live lookup could not settle falls back to its pinned value.
async function resolvePlan(choices, { offline = false, onProgress } = {}) {
  const keys = keysFor(choices);
  const warnings = [];
  let versions, row, ranges = {};
  const p = pinned();
  if (offline) {
    if (!p) throw new Error('no data/pinned.json; run `npm run pin` once while online');
    const set = choices.workflow === 'expo' ? p.expo : p;
    if (!set) throw new Error('data/pinned.json has no expo versions; run `npm run pin` once while online');
    versions = { ...set.versions }; row = set.rnRow; ranges = set.ranges ?? {};
    warnings.push(`offline: versions pinned ${p.pinnedAt.slice(0, 10)}`);
  } else {
    const r = await resolveAll(keys, { rnCeiling: rnCeilingForXcode(env().xcode?.version), workflow: choices.workflow, onProgress });
    versions = r.versions; row = r.row; ranges = r.ranges; warnings.push(...r.warnings);
    for (const k of keys) if (!versions[k] && p?.versions[k]) { versions[k] = p.versions[k]; warnings.push(`${k}: lookup failed, using pinned ${p.versions[k]}`); }
  }
  if (!versions.rn) throw new Error('could not resolve react-native');
  row ??= rnRow(versions.rn);
  return { keys, versions, row, ranges, warnings };
}

function toolchainWarnings(e, row) {
  const out = [];
  if (!row) return out;
  if (compareVer(e.node, row.node) < 0) out.push(`node ${e.node} is below react-native's floor ${row.node}`);
  if (process.platform === 'darwin' && !e.xcode) out.push('Xcode not found; iOS builds will not work');
  if (process.platform === 'darwin' && e.xcode && compareVer(e.xcode.version, row.xcodeMin) < 0) out.push(`Xcode ${e.xcode.version} is below the floor ${row.xcodeMin}`);
  if (!e.jdk) out.push('no JDK found (set JAVA_HOME or install Android Studio)');
  else if (e.jdk.major < row.jdk) out.push(`JDK ${e.jdk.major} is below the floor ${row.jdk}`);
  if (!e.androidSdk) out.push('Android SDK not found (ANDROID_HOME)');
  else if (row.ndk && !e.androidSdk.ndks.includes(row.ndk)) out.push(`NDK ${row.ndk} not installed (found ${e.androidSdk.ndks.join(', ') || 'none'})`);
  if (process.platform === 'darwin' && !e.cocoapods) out.push('CocoaPods not found');
  return out;
}
function compareVer(a, b) {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? 0) - (y[i] ?? 0); if (d) return d; }
  return 0;
}

function choicesFrom(input) {
  const raw = {};
  for (const g of Object.keys(GROUPS)) if (input[g] != null && input[g] !== '') raw[g] = input[g];
  if (input.modules != null) raw.modules = input.modules;
  return normalizeChoices(raw);
}

function kickstartCmdFor(name, bundleId, choices) {
  return `rn-kickstart --yes --name=${name} --package=${bundleId} ${Object.keys(GROUPS).map((g) => `--${g}=${choices[g]}`).join(' ')} --modules=${choices.modules.join(',')}`;
}

function pickFolder() {
  return new Promise((resolve) => {
    let cmd, args;
    if (process.platform === 'win32') {
      // -STA: FolderBrowserDialog is a single-threaded-apartment control. The invisible TopMost owner
      // keeps the dialog in front of the browser window.
      cmd = 'powershell';
      args = ['-NoProfile', '-STA', '-Command',
        'Add-Type -AssemblyName System.Windows.Forms;'
        + '$owner = New-Object System.Windows.Forms.Form; $owner.TopMost = $true; $owner.ShowInTaskbar = $false; $owner.Opacity = 0; $owner.Show(); $owner.Activate();'
        + '$d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = "Choose where to create the project"; $d.ShowNewFolderButton = $true;'
        + '$result = $d.ShowDialog($owner); $owner.Close();'
        + 'if ($result -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.SelectedPath }'];
    } else if (process.platform === 'darwin') {
      cmd = 'osascript';
      args = ['-e', 'POSIX path of (choose folder with prompt "Choose where to create the project")'];
    } else {
      cmd = 'zenity';
      args = ['--file-selection', '--directory', '--title=Choose where to create the project'];
    }
    const p = spawn(cmd, args, { windowsHide: false });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => resolve({ error: e.message }));
    p.on('close', () => {
      const path = out.trim().split('\n').pop()?.trim().replace(/[\\/]+$/, '');
      resolve(path ? { path } : { error: err.trim() || null });
    });
  });
}

function sse(res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const send = (event, data) => { if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
  return {
    step: (name, text) => send('step', { name, text }),
    log: (text) => send('log', { text }),
    done: (message, extra = {}) => { send('done', { ok: true, message, ...extra }); res.end(); },
    error: (message) => { send('error', { ok: false, message }); res.end(); },
  };
}

// Streams a child's stdout/stderr line by line into the log. Resolves with the exit code.
function run(cmd, args, cwd, stream, extraEnv = {}) {
  stream.log(`$ ${cmd} ${args.join(' ')}   (${cwd})`);
  return new Promise((resolve, reject) => {
    // CocoaPods raises "Unicode Normalization not appropriate for ASCII-8BIT" without a UTF-8 locale.
    const locale = process.env.LANG || process.env.LC_ALL ? {} : { LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' };
    const p = spawn(cmd, args, { cwd, env: { ...locale, ...process.env, ...Object.fromEntries(Object.entries(extraEnv).filter(([, v]) => v)) }, shell: process.platform === 'win32' });
    const pipe = (s) => {
      let buf = '';
      s.on('data', (d) => {
        buf += d;
        const lines = buf.split(/\r?\n/);
        buf = lines.pop();
        for (const l of lines) stream.log(l);
      });
      s.on('end', () => { if (buf) stream.log(buf); });
    };
    pipe(p.stdout); pipe(p.stderr);
    p.on('error', reject);
    p.on('close', resolve);
  });
}

function openInVsCode(dir) {
  const e = env();
  if (!e.vscode) return false;
  const viaCli = !e.vscode.endsWith('.app');
  const [cmd, args] = viaCli ? ['code', [dir]] : ['open', ['-a', 'Visual Studio Code', dir]];
  try { spawn(cmd, args, { detached: true, stdio: 'ignore', shell: process.platform === 'win32' }).unref(); return true; } catch { return false; }
}

const readBody = (req) => new Promise((resolve, reject) => {
  let b = '';
  req.on('data', (d) => { b += d; if (b.length > 1e6) reject(new Error('body too large')); });
  req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(e); } });
});

async function create(q, stream) {
  const name = String(q.name ?? '').trim();
  const bundleId = String(q.package ?? '').trim();
  validateIdentifiers({ name, bundleId });
  const choices = choicesFrom(q);
  const outDir = pathResolve(String(q.out ?? '').trim() || `./${slugify(name)}`);
  if (!dirIsEmpty(outDir) && q.force !== '1') throw new Error(`${outDir} is not empty (tick "overwrite" to write anyway)`);
  const e = env();
  const pm = q.pm && e.packageManagers[q.pm] ? q.pm : pickPm(e.packageManagers);

  stream.step('resolve', 'resolving versions');
  const plan = await resolvePlan(choices, { offline: q.offline === '1', onProgress: (k, v) => stream.log(`  ${k.padEnd(18)} ${v}`) });
  stream.log(`react-native ${plan.versions.rn} · react ${plan.versions.react} · node ≥ ${plan.row?.node ?? '?'} · jdk ${plan.row?.jdk ?? '?'}`);
  for (const w of [...plan.warnings, ...toolchainWarnings(e, plan.row)]) stream.log(`warn ${w}`);

  let template = null;
  if (choices.workflow === 'bare') {
    stream.step('template', `fetching @react-native-community/template@${plan.versions.rn}`);
    template = await fetchTemplate(plan.versions.rn);
  }

  stream.step('scaffold', `writing ${outDir}`);
  const { written } = await scaffold({ name, bundleId, outDir, choices, versions: plan.versions, row: plan.row, pm, template, kickstartCmd: kickstartCmdFor(name, bundleId, choices), androidSdkDir: e.androidSdk?.dir });
  stream.log(`wrote ${written.length} files to ${outDir}`);

  if (q.build === '1') {
    stream.step('install', `${pm} install`);
    let code = await run(pm, ['install'], outDir, stream);
    if (code !== 0) throw new Error(`${pm} install exited ${code}, see the log`);
    stream.step('verify', `${pm} run verify`);
    code = await run(pm, ['run', 'verify'], outDir, stream);
    if (code !== 0) throw new Error(`${pm} run verify exited ${code}, see the log`);
    stream.log('✓ typecheck, lint and tests passed');
  }

  let opened = false;
  if (q.open === '1') { opened = openInVsCode(outDir); stream.log(opened ? 'opening in VS Code' : 'VS Code not found; open the folder manually'); }
  const next = `cd ${outDir} && ${pm} install && ${pm} run ios`;
  return { dir: outDir, pm, files: written.length, opened, next };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const json = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  const text = (code, body) => { res.writeHead(code, { 'Content-Type': 'text/plain' }); res.end(body); };

  try {
    if (!hostIsLoopback(req.headers.host)) return text(403, 'react-native-kickstart only answers requests addressed to localhost.\n');
    if (url.pathname.startsWith('/api/') && !tokenIsValid(url, req.headers)) return text(403, 'missing or bad token - open the URL this tool printed.\n');

    if (url.pathname === '/') {
      // The page reads its token from here; another origin cannot, because reading this response is
      // blocked by the same-origin policy and the Host check above stops DNS rebinding.
      const html = readFileSync(join(toolRoot, 'gui', 'index.html'), 'utf8').replace('__RNK_TOKEN__', TOKEN);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(html);
    }

    if (url.pathname === '/libraries.json') return json(200, libraries);

    if (url.pathname.startsWith('/logos/') || url.pathname.startsWith('/fonts/')) {
      const dir = url.pathname.startsWith('/logos/') ? 'logos' : 'fonts';
      const name = decodeURIComponent(url.pathname.split('/').pop() ?? '');
      if (!/^[A-Za-z0-9._-]+$/.test(name) || name.includes('..')) return text(400, 'bad name');
      const file = join(toolRoot, 'gui', dir, name);
      if (!existsSync(file)) return text(404, 'not found');
      const type = name.endsWith('.svg') ? 'image/svg+xml' : name.endsWith('.png') ? 'image/png' : name.endsWith('.woff2') ? 'font/woff2' : name.endsWith('.css') ? 'text/css' : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
      return res.end(readFileSync(file));
    }

    if (url.pathname === '/api/ping') { lastSeen = Date.now(); return json(200, { ok: true, busy: !!job }); }

    if (url.pathname === '/api/bye') {
      lastSeen = 0;
      res.writeHead(204); res.end();
      if (!KEEP_ALIVE && !job) setTimeout(() => process.exit(0), 250);
      return undefined;
    }

    if (url.pathname === '/api/init') {
      const e = env();
      return json(200, {
        env: e, groups: GROUPS, modules: MODULES, presets: PRESETS, defaults: DEFAULTS,
        defaultOut: defaultOutRoot(), defaultPm: pickPm(e.packageManagers),
        pinnedAt: pinned()?.pinnedAt ?? null, libraries, platform: process.platform,
      });
    }

    if (url.pathname === '/api/pick-folder' && req.method === 'POST') return json(200, await pickFolder());

    if (url.pathname === '/api/preview' && req.method === 'POST') {
      const body = await readBody(req);
      let choices;
      try { choices = choicesFrom(body.choices ?? body); } catch (e) { return json(400, { error: e.message }); }
      const name = String(body.name ?? 'MyApp').trim() || 'MyApp';
      const slug = slugify(name);
      const bundleId = String(body.package ?? '').trim() || `com.example.${slug.replace(/-/g, '')}`;
      const e = env();
      const pm = body.pm && e.packageManagers[body.pm] ? body.pm : pickPm(e.packageManagers);
      const plan = await resolvePlan(choices, { offline: !!body.offline });
      const packageJson = buildPackageJson({ name, slug, keys: plan.keys, versions: plan.versions, choices, row: plan.row, pm });
      const ctx = buildContext({ name, slug, bundleId, choices, versions: plan.versions, row: plan.row, pm });
      const nativeCount = choices.workflow === 'bare' ? 2 : 0;
      return json(200, {
        versions: plan.versions, packageJson, row: plan.row, choices, pm,
        warnings: [...plan.warnings, ...toolchainWarnings(e, plan.row)],
        fileCount: planFiles(ctx).length + 1 + nativeCount,
      });
    }

    if (url.pathname === '/api/create') {
      if (job) return json(409, { error: 'a project is already being set up' });
      const q = Object.fromEntries(url.searchParams);
      const stream = sse(res);
      job = { startedAt: Date.now() };
      try {
        const result = await create(q, stream);
        stream.done(`Project ready at ${result.dir}`, result);
      } catch (e) {
        stream.error(e.message);
      } finally {
        job = null; lastSeen = Date.now();
      }
      return undefined;
    }

    return text(404, 'not found');
  } catch (e) {
    if (!res.headersSent) json(500, { error: e.message });
    else res.end();
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}`;
  console.log(`react-native-kickstart GUI  ${url}`);
  console.log(KEEP_ALIVE ? 'press Ctrl+C to stop' : 'closes automatically when you close the tab (--keep-alive to stay up)');
  if (NO_OPEN) return;
  const opener = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(opener[0], opener[1], { stdio: 'ignore', detached: true }).unref();
});
