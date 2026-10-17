#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { spawn } from 'node:child_process';
import { resolve as resolvePath, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { GROUPS, MODULES, ADDONS, ADDON_IDS, DEFAULTS, PRESETS, normalizeChoices, slugify } from '../src/context.mjs';
import { keysFor, resolveAll, pinned, rnRow, rnCeilingForXcode, libraries, compat } from '../src/resolver/index.mjs';
import { scaffold, validateIdentifiers, dirIsEmpty } from '../src/scaffold.mjs';
import { fetchTemplate } from '../src/native.mjs';
import { detectAll, toolchainWarnings, nativeBuildPlan } from '../src/detect.mjs';
import { buildPackageJson } from '../src/packagejson.mjs';
import { bold, dim, green, yellow, red, cyan } from '../src/color.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const a = argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const has = (n) => argv.includes(`--${n}`) || argv.includes(n) || argv.some((x) => x.startsWith(`--${n}=`));

const JSON_OUT = has('json');
if (JSON_OUT) console.log = (...a) => process.stderr.write(a.join(' ') + '\n');
const emit = (o) => process.stdout.write(JSON.stringify(o) + '\n');
process.on('unhandledRejection', (e) => die(e?.message ?? String(e)));

if (has('help') || argv[0] === 'help') { help(); process.exit(0); }
if (has('list-libs')) { listLibs(); process.exit(0); }
if (has('options')) { emit({ groups: GROUPS, defaults: DEFAULTS, presets: PRESETS, modules: MODULES, addons: ADDONS, libraries }); process.exit(0); }
if (flag('info')) { info(flag('info')); process.exit(0); }
if (has('version')) { console.log(JSON.parse((await import('node:fs')).readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version); process.exit(0); }

const yes = has('yes');
const interactive = !yes && (has('interactive') || process.stdin.isTTY);
const env = detectAll();

let answers = {
  name: flag('name', 'MyApp'),
  package: flag('package'),
  preset: flag('preset'),
  out: flag('out'),
  pm: flag('pm'),
};
for (const g of Object.keys(GROUPS)) answers[g] = flag(g);
answers.modules = flag('modules');
answers.addons = flag('addons');
if (flag('answers')) {
  const raw = flag('answers');
  const file = JSON.parse(raw.trimStart().startsWith('{') ? raw : readFileSync(resolvePath(raw), 'utf8'));
  for (const [k, v] of Object.entries(file)) if (v != null && (k in answers || k === 'build' || k === 'offline' || k === 'force')) answers[k] = Array.isArray(v) ? v.join(',') : v;
  if (file.build != null) argv.push(file.build === 'native' ? '--build=native' : '--build');
  if (file.offline) argv.push('--offline');
  if (file.force) argv.push('--force');
}

if (interactive) answers = await prompt(answers);

const preset = answers.preset ? PRESETS[answers.preset] : null;
if (answers.preset && !preset) die(`unknown preset "${answers.preset}" (${Object.keys(PRESETS).join(', ')})`);
const choices = normalizeChoices({ ...(preset ?? {}), ...Object.fromEntries(Object.entries(answers).filter(([k, v]) => (k in GROUPS || k === 'modules' || k === 'addons') && v != null)) });
const name = answers.name;
const slug = slugify(name);
const bundleId = answers.package ?? `com.example.${slug.replace(/-/g, '')}`;
const outDir = resolvePath(answers.out ?? `./${slug}`);
const pm = answers.pm ?? pickPm(env.packageManagers);

validateIdentifiers({ name, bundleId });
if (!dirIsEmpty(outDir) && !has('force')) die(`${outDir} is not empty (use --force to write anyway)`);

// Versions: offline from pinned.json, or live with the toolchain cap.
let versions, row, warnings = [], ranges = {};
const keys = keysFor(choices);
const rnCeiling = flag('rn') ?? rnCeilingForXcode(env.xcode?.version);
if (has('offline')) {
  const p = pinned();
  if (!p) die('no data/pinned.json; run `npm run pin` once while online');
  const set = choices.workflow === 'expo' ? p.expo : p;
  if (!set) die('data/pinned.json has no expo versions; run `npm run pin` once while online');
  versions = set.versions; row = set.rnRow; ranges = set.ranges ?? {}; warnings.push(`offline: versions pinned ${p.pinnedAt.slice(0, 10)}`);
} else {
  process.stderr.write(dim(`resolving ${keys.length} packages for ${choices.workflow}…\n`));
  const r = await resolveAll(keys, { rnCeiling, workflow: choices.workflow, onProgress: (k, v) => process.stderr.write(dim(`  ${k.padEnd(18)} ${v}\n`)) });
  versions = r.versions; row = r.row; warnings = r.warnings; ranges = r.ranges;
  const p = pinned();
  for (const k of keys) if (!versions[k] && p?.versions[k]) { versions[k] = p.versions[k]; warnings.push(`${k}: lookup failed, using pinned ${p.versions[k]}`); }
}
if (!versions.rn) die('could not resolve react-native');
row ??= rnRow(versions.rn);

const kickstartCmd = `rn-kickstart --yes --name=${name} --package=${bundleId} ${Object.keys(GROUPS).map((g) => `--${g}=${choices[g]}`).join(' ')} --modules=${choices.modules.join(',')}${choices.addons.length ? ` --addons=${choices.addons.join(',')}` : ''}`;
const pkg = buildPackageJson({ name, slug, keys, versions, choices, row, pm });

console.log();
console.log(bold(`${name}`) + dim(`  ${bundleId}  →  ${outDir}`));
console.log(dim(`react-native ${versions.rn} · react ${versions.react} · node ≥ ${row?.node ?? '?'} · jdk ${row?.jdk ?? '?'} · ios ${row?.iosTarget ?? '?'} · minSdk ${row?.minSdk ?? '?'}`));
console.log();
printDeps(pkg);
for (const w of warnings) console.log(yellow('warn ') + w);
for (const w of toolchainWarnings(env, row)) console.log(yellow('warn ') + w);


if (has('dry-run')) { console.log(dim('\n--dry-run: nothing written')); process.exit(0); }

let template = null;
if (choices.workflow === 'bare') {
  process.stderr.write(dim(`fetching @react-native-community/template@${versions.rn}…\n`));
  template = await fetchTemplate(versions.rn);
}
const { written } = await scaffold({ name, bundleId, outDir, choices, versions, row, pm, template, kickstartCmd, androidSdkDir: env.androidSdk?.dir });
console.log(green(`\n✓ wrote ${written.length} files to ${outDir}`));
const toolWarnings = toolchainWarnings(env, row);
const build = { ran: false, skipped: [] };

if (has('build')) {
  const native = flag('build') === 'native';
  await sh(pm, ['install'], outDir);
  await sh(pm, ['run', 'verify'], outDir);
  await sh(pm, ['run', 'bundle:check'], outDir, { CI: '1' });
  if (native && choices.workflow === 'bare') {
    const plan = nativeBuildPlan(env);
    if (plan.ios.can) {
      await sh('bundle', ['install'], outDir).catch(() => {});
      await sh('bundle', ['exec', 'pod', 'install'], join(outDir, 'ios'));
      await sh('xcodebuild', ['-workspace', `${name}.xcworkspace`, '-scheme', name, '-sdk', 'iphonesimulator', '-configuration', 'Debug', '-destination', 'generic/platform=iOS Simulator', 'build', '-quiet'], join(outDir, 'ios'));
    } else { build.skipped.push({ platform: 'ios', why: plan.ios.why }); console.log(yellow('skip ') + `iOS build: ${plan.ios.why}`); }
    if (plan.android.can) await sh(plan.gradlew, ['assembleDevDebug', '--console=plain'], join(outDir, 'android'), { JAVA_HOME: env.jdk.home, ANDROID_HOME: env.androidSdk.dir });
    else { build.skipped.push({ platform: 'android', why: plan.android.why }); console.log(yellow('skip ') + `Android build: ${plan.android.why}`); }
    if (!plan.ios.can && !plan.android.can) die('--build=native: no native toolchain available on this machine');
  }
  build.ran = true;
  console.log(green('✓ build passed'));
}
if (has('open') && env.vscode) spawn('code', [outDir], { detached: true, stdio: 'ignore' }).unref();
console.log(dim(`\nnext: cd ${outDir} && ${pm} install && ${pm} run ios`));
if (JSON_OUT) emit({ ok: true, name, bundleId, outDir, pm, workflow: choices.workflow, choices, versions: { rn: versions.rn, react: versions.react, expo: versions.expo ?? null }, toolchain: row, files: written.length, warnings, toolchainWarnings: toolWarnings, build, kickstartCmd, next: choices.workflow === 'expo' ? `cd ${outDir} && ${pm} install && ${pm} run start` : `cd ${outDir} && ${pm} install${process.platform === 'darwin' ? ` && ${pm} run pods && ${pm} run ios` : ` && ${pm} run android`}` });

// ---------------------------------------------------------------------------

async function prompt(a) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q, d) => { const r = (await rl.question(`${q}${d !== undefined ? dim(` [${d}]`) : ''}: `)).trim(); return r || d; };
  const pick = async (label, key, options) => {
    console.log(`\n${bold(label)}`);
    options.forEach((o, i) => console.log(`  ${i + 1}. ${o.padEnd(16)} ${dim(libraries[o]?.summary ?? '')}`));
    for (;;) {
      const r = await ask(`${key}`, a[key] ?? DEFAULTS[key]);
      const byIndex = options[+r - 1];
      if (byIndex) return byIndex;
      if (options.includes(r)) return r;
      console.log(red(`  pick one of ${options.join(', ')}`));
    }
  };
  a.name = await ask('App name', a.name);
  while (!/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(a.name)) a.name = await ask(red('letters and digits only, start with a letter'), 'MyApp');
  a.package = await ask('Bundle id', a.package ?? `com.example.${slugify(a.name).replace(/-/g, '')}`);
  console.log(`\n${bold('Preset')}  ${Object.keys(PRESETS).map((p, i) => `${i + 1}. ${p}`).join('   ')}   ${dim('or enter for custom')}`);
  const pr = await ask('preset', '');
  if (pr) { a.preset = PRESETS[pr] ? pr : Object.keys(PRESETS)[+pr - 1]; }
  if (!a.preset) {
    for (const [g, opts] of Object.entries(GROUPS)) {
      if (g === 'nav' && (a.workflow ?? DEFAULTS.workflow) !== 'expo') { a.nav = 'react-navigation'; continue; }
      if (g === 'data' && (a.state ?? DEFAULTS.state) === 'rtk') { a.data = 'rtk-query'; continue; }
      a[g] = await pick(g, g, opts);
    }
    console.log(`\n${bold('Modules')}  ${MODULES.map((m) => `${m}: ${dim(libraries[m]?.summary ?? '')}`).join('\n          ')}`);
    a.modules = await ask('modules (comma separated)', DEFAULTS.modules.join(','));
    console.log(`\n${bold('Add-ons')}  ${ADDONS.map((x) => `${x.id}: ${dim(libraries[x.id]?.summary ?? '')}`).join('\n          ')}`);
    a.addons = await ask('add-ons (comma separated, or none)', '');
  }
  a.out = await ask('Folder', a.out ?? `./${slugify(a.name)}`);
  rl.close();
  return a;
}

function pickPm(found) {
  for (const pm of ['pnpm', 'yarn', 'bun', 'npm']) if (found[pm]) return pm;
  return 'npm';
}

function printDeps(pkg) {
  const rows = [...Object.entries(pkg.dependencies), ...Object.entries(pkg.devDependencies).map(([k, v]) => [k, v, true])];
  for (const [k, v, dev] of rows) console.log(`  ${(dev ? dim(k) : k).padEnd(dev ? 52 : 44)} ${v.startsWith('^') || v.startsWith('~') ? dim(v) : cyan(v)}`);
}


function sh(cmd, args, cwd, extraEnv = {}) {
  console.log(dim(`\n$ ${cmd} ${args.join(' ')}   (${cwd})`));
  return new Promise((res, rej) => {
    // CocoaPods raises "Unicode Normalization not appropriate for ASCII-8BIT" without a UTF-8 locale.
    const locale = process.env.LANG || process.env.LC_ALL ? {} : { LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' };
    const p = spawn(cmd, args, { cwd, stdio: 'inherit', env: { ...locale, ...process.env, ...Object.fromEntries(Object.entries(extraEnv).filter(([, v]) => v)) }, shell: process.platform === 'win32' });
    p.on('exit', (code) => (code === 0 ? res() : rej(new Error(`${cmd} exited ${code}`))));
    p.on('error', rej);
  }).catch((e) => die(e.message));
}

function die(msg) { if (JSON_OUT) emit({ ok: false, error: msg }); console.error(red('error ') + msg); process.exit(1); }

function listLibs() {
  for (const [g, opts] of Object.entries(GROUPS)) console.log(`${bold(g.padEnd(10))} ${opts.join(' · ')}`);
  console.log(`${bold('modules'.padEnd(10))} ${MODULES.join(' · ')}`);
  console.log(`${bold('addons'.padEnd(10))} ${ADDON_IDS.join(' · ')}`);
  console.log(dim(`${''.padEnd(10)} on expo: ${ADDONS.map((a) => `${a.id}→${a.expo === 'same' ? 'same' : a.expo ?? 'n/a'}`).join(' · ')}`));
}
function info(key) {
  const l = libraries[key];
  if (!l) die(`no library "${key}"; try --list-libs`);
  console.log(`${bold(l.name)} ${dim(l.vendor)}\n${l.summary}\n${yellow('trade-off')} ${l.tradeoff}\n${dim(l.docs)}`);
}
function help() {
  console.log(`${bold('rn-kickstart')} — pulls the latest compatible React Native dependencies and kickstarts a project.

  rn-kickstart                         interactive
  rn-kickstart --yes --build           flags only, then install + typecheck + lint + jest
  rn-kickstart --yes --dry-run         show the versions you would get, write nothing
  rn-kickstart --answers=app.json --json   answers from a file or inline JSON ('{"name":…}'), one JSON result line on stdout
  rn-kickstart --options               every group, option, module and add-on as JSON

  --name=MyApp   --package=com.example.myapp   --out=./myapp   --preset=standard|expo|minimal
${Object.entries(GROUPS).map(([g, o]) => `  --${g}=${o.join('|')}`).join('\n')}
  --modules=${MODULES.join(',')}
  --addons=${ADDON_IDS.slice(0, 6).join(',')},…   (rn-kickstart --list-libs shows all)
  --pm=pnpm|yarn|bun|npm   --rn=0.88 (cap)   --offline   --force   --build[=native]   --open
  --list-libs   --info=<choice>   --help`);
}
