#!/usr/bin/env node
// rn-kickstart-store: capture raw shots, render store screenshots and icons, write fastlane metadata.
import { existsSync, mkdirSync, readFileSync, readSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bold, cyan, dim, green, red, yellow } from '../src/color.mjs';
import { detectChrome } from '../src/detect.mjs';
import { render } from '../src/render.mjs';
import { CONFIG_REL, capturePath, loadConfig, readiness } from '../src/store/config.mjs';
import { captureAndroid, captureIos, hasMaestro, listBooted, runMaestroFlow } from '../src/store/capture.mjs';
import { renderAll } from '../src/store/export.mjs';
import { generateIcons } from '../src/store/icons.mjs';
import { writeMetadata } from '../src/store/fastlane.mjs';
import { SIZES } from '../src/store/presets.mjs';

const argv = process.argv.slice(2);
const cmd = argv.find((a) => !a.startsWith('-')) ?? 'help';
const flag = (n, d) => { const a = argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : argv.includes(`--${n}`) ? true : d; };
const list = (n) => { const v = flag(n); return typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined; };
const root = resolve(flag('project', process.cwd()));
const templatesRoot = fileURLToPath(new URL('../templates/store/', import.meta.url));
const log = (s) => console.log(s);

const HELP = `${bold('rn-kickstart-store')} - App Store / Google Play assets with zero dependencies

  init                                 write ${CONFIG_REL} and store/README.md if missing
  capture [--platform=ios|android|both] [--udid=] [--serial=] [--locale=] [--screen=id] [--flow=.maestro/store.yaml]
                                       one shot per screen into store/shots/<locale>/<id>.<platform>.png
  render  [--locale=a,b] [--size=a,b] [--out=dir] [--no-metadata]
                                       render every size through headless Chrome into fastlane/
  icons   [--from=store/icon.png] [--no-chrome]
                                       iOS asset catalog, Android mipmaps + adaptive layers, Play 512
  metadata                             deliver/supply txt files from "listing"
  check                                readiness report; exit 1 when the set cannot export
  --project=<dir>                      project root (default: cwd)

Sizes: ${SIZES.map((s) => s.id).join(', ')}`;

try {
  switch (cmd) {
    case 'init': init(); break;
    case 'capture': capture(); break;
    case 'render': await renderCmd(); break;
    case 'icons': await icons(); break;
    case 'metadata': metadata(); break;
    case 'check': check(); break;
    case 'help': case '--help': log(HELP); break;
    default: log(HELP); process.exit(2);
  }
} catch (e) {
  console.error(red(`error: ${e.message}`));
  process.exit(1);
}

function init() {
  const pkg = existsSync(join(root, 'package.json')) ? JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) : {};
  const name = flag('app', typeof pkg.name === 'string' ? pkg.name.replace(/^@.*\//, '') : 'App');
  const ctx = { APP_NAME: name, BUNDLE_ID: flag('bundle-id', `com.example.${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`) };
  mkdirSync(join(root, 'store'), { recursive: true });
  for (const [tmpl, dest] of [['kickstart.store.json.tmpl', CONFIG_REL], ['README.md.tmpl', 'store/README.md']]) {
    const out = join(root, dest);
    if (existsSync(out)) { log(dim(`${dest} exists, kept`)); continue; }
    writeFileSync(out, render(readFileSync(join(templatesRoot, tmpl), 'utf8'), ctx));
    log(green(`wrote ${dest}`));
  }
}

function capture() {
  const cfg = loadConfig(root);
  const locale = flag('locale', cfg.locales[0]);
  const only = flag('screen');
  const want = flag('platform', 'both');
  const platforms = want === 'both' ? ['ios', 'android'] : [want];
  const booted = listBooted();
  const screens = cfg.screens.filter((s) => !only || s.id === only);
  if (only && !screens.length) throw new Error(`no screen with id "${only}"`);
  const flow = flag('flow');
  for (const platform of platforms) {
    const udid = flag('udid', booted.ios[0]?.udid ?? 'booted');
    const serial = flag('serial', booted.android[0]?.serial);
    if (platform === 'ios' && (process.platform !== 'darwin' || !booted.ios.length) && want === 'both') { log(dim('no booted iOS simulator, skipping ios')); continue; }
    if (platform === 'android' && !booted.android.length && want === 'both') { log(dim('no Android device connected, skipping android')); continue; }
    if (typeof flow === 'string') {
      if (!hasMaestro()) throw new Error('maestro is not on PATH');
      const outDir = join(root, 'store/shots', locale);
      log(cyan(`maestro ${flow} (${platform}) -> ${outDir}`));
      runMaestroFlow({ flow: resolve(root, flow), outDir, platform, udid, serial });
      for (const s of screens) {
        const shot = join(outDir, `${s.id}.png`);
        if (existsSync(shot)) { writeFileSync(join(root, capturePath(locale, s.id, platform)), readFileSync(shot)); log(green(`${capturePath(locale, s.id, platform)}`)); }
        else log(yellow(`flow did not produce ${s.id}.png (add "takeScreenshot: ${s.id}")`));
      }
      continue;
    }
    for (const s of screens) {
      const rel = capturePath(locale, s.id, platform);
      if (screens.length > 1 && !only) { log(`${bold(s.id)}: navigate the ${platform} app to this screen, then press Enter`); waitEnter(); }
      platform === 'ios' ? captureIos({ udid, out: join(root, rel) }) : captureAndroid({ serial, out: join(root, rel) });
      log(green(rel));
    }
  }
}

function waitEnter() {
  const buf = Buffer.alloc(1);
  try { while (readSync(0, buf, 0, 1, null) > 0 && buf[0] !== 10); } catch {}
}

async function renderCmd() {
  const cfg = loadConfig(root);
  const locales = list('locale');
  const sizes = list('size');
  for (const l of locales ?? []) if (!cfg.locales.includes(l)) throw new Error(`locale "${l}" is not in the config`);
  for (const s of sizes ?? []) if (!SIZES.some((x) => x.id === s)) throw new Error(`unknown size "${s}"`);
  const chromePath = detectChrome();
  if (!chromePath) throw new Error('no Chrome, Chromium or Edge found; install one or use the GUI Screenshots tab');
  const ready = readiness(cfg, root, { locales, sizes });
  printReadiness(ready);
  if (!ready.canExport && !flag('force')) throw new Error('capture the missing shots first (or pass --force to render what exists)');
  const outDir = typeof flag('out') === 'string' ? resolve(flag('out')) : root;
  const { written } = await renderAll(root, cfg, { locales, sizes, chromePath, outDir, log: (s) => log(dim(s)), metadata: !argv.includes('--no-metadata') });
  log(green(`${written.length} files written under ${outDir}`));
}

async function icons() {
  const cfg = loadConfig(root);
  if (typeof flag('from') === 'string') cfg.icon = flag('from');
  const { written, background } = await generateIcons(root, cfg, { chromePath: detectChrome(), useChrome: !argv.includes('--no-chrome'), log: (s) => log(yellow(s)) });
  for (const f of written) log(dim(f.slice(root.length + 1)));
  log(green(`${written.length} icon files written (adaptive background ${background})`));
}

function metadata() {
  const cfg = loadConfig(root);
  const written = writeMetadata(root, cfg);
  for (const f of written) log(dim(f.slice(root.length + 1)));
  log(green(`${written.length} metadata files written`));
}

function check() {
  const cfg = loadConfig(root);
  const ready = readiness(cfg, root);
  printReadiness(ready);
  if (!ready.canExport) process.exit(1);
}

function printReadiness({ rows, warnings, canExport }) {
  for (const r of rows) {
    const status = r.canExport ? green('ready') : red(`${r.missingShots} shot${r.missingShots === 1 ? '' : 's'} missing`);
    const notes = [];
    if (r.missingCopy) notes.push(`${r.missingCopy} without headline`);
    if (r.overLimit) notes.push(`${r.tiles} tiles > ${r.store} max ${r.limit.max}`);
    if (r.underMin) notes.push(`${r.tiles} tiles < ${r.store} min ${r.limit.min}`);
    log(`${bold(r.locale)} ${r.sizeId.padEnd(20)} ${status}${notes.length ? dim(`  (${notes.join(', ')})`) : ''}`);
    for (const m of r.missing) log(dim(`    ${m}`));
  }
  for (const w of warnings) log(yellow(`warning: ${w}`));
  log(canExport ? green('exportable') : red('not exportable'));
}
