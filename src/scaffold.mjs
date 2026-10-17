import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { render } from './render.mjs';
import { buildContext, slugify } from './context.mjs';
import { buildPackageJson } from './packagejson.mjs';
import { keysFor } from './resolver/index.mjs';
import { copyNative, wireEnvConfig, wireBootSplash, placeholderLogoPng } from './native.mjs';
import { encodePng } from './store/png.mjs';

const templatesRoot = fileURLToPath(new URL('../templates/', import.meta.url));

const JS_KEYWORDS = new Set(['abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void', 'volatile', 'while']);

export function validateIdentifiers({ name, bundleId }) {
  if (!/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(name)) throw new Error(`app name must be letters and digits, starting with a letter (got "${name}")`);
  if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(bundleId)) throw new Error(`bundle id must look like com.example.app (got "${bundleId}")`);
  for (const seg of bundleId.split('.')) if (JS_KEYWORDS.has(seg)) throw new Error(`bundle id segment "${seg}" is a Java keyword`);
}

// Every template manifest: [templatePath relative to templates/, destPath, conditionFlag|null].
export function loadManifests() {
  const files = [];
  for (const m of ['root/MANIFEST.json', 'src/MANIFEST-store.json', 'src/MANIFEST-ui.json']) {
    const p = join(templatesRoot, m);
    if (!existsSync(p)) continue;
    const base = dirname(m);
    for (const [tmpl, dest, cond] of JSON.parse(readFileSync(p, 'utf8'))) {
      files.push([tmpl.startsWith(base + '/') || tmpl.startsWith('app/') || tmpl.startsWith('store/') ? tmpl : join(base, tmpl), dest, cond ?? null]);
    }
  }
  return files;
}

export function planFiles(ctx) {
  return loadManifests().filter(([, , cond]) => !cond || ctx[cond]);
}

export async function scaffold({ name, bundleId, outDir, choices, versions, row, pm = 'npm', template = null, kickstartCmd = '', skipNative = false, androidSdkDir = null }) {
  validateIdentifiers({ name, bundleId });
  const slug = slugify(name);
  const keys = keysFor(choices);
  const ctx = buildContext({ name, slug, bundleId, choices, versions, row, pm });
  ctx.KICKSTART_CMD = kickstartCmd;
  mkdirSync(outDir, { recursive: true });

  const written = [];
  if (choices.workflow === 'bare' && !skipNative) {
    if (!template) throw new Error('bare workflow needs the RN community template');
    copyNative(template, outDir, { name, displayName: name, bundleId });
    wireEnvConfig(outDir);
    wireBootSplash(outDir, { name });
    written.push('ios/', 'android/');
    if (androidSdkDir) {
      writeFileSync(join(outDir, 'android', 'local.properties'), `sdk.dir=${androidSdkDir.replace(/\\/g, '\\\\').replace(/:/g, '\\:')}\n`);
      written.push('android/local.properties');
    }
  }
  for (const [tmpl, dest, cond] of loadManifests()) {
    if (cond && !ctx[cond]) continue;
    const src = join(templatesRoot, tmpl);
    const out = join(outDir, dest);
    mkdirSync(dirname(out), { recursive: true });
    const text = readFileSync(src, 'utf8');
    let rendered;
    try { rendered = render(text, ctx); } catch (e) { throw new Error(`${tmpl}: ${e.message}`); }
    writeFileSync(out, rendered);
    written.push(dest);
  }
  mkdirSync(join(outDir, 'assets'), { recursive: true });
  if (!existsSync(join(outDir, 'assets', 'logo.png'))) { writeFileSync(join(outDir, 'assets', 'logo.png'), placeholderLogoPng(encodePng)); written.push('assets/logo.png'); }
  const pkg = buildPackageJson({ name, slug, keys, versions, choices, row, pm });
  writeFileSync(join(outDir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  written.push('package.json');
  return { written, ctx, keys, pkg };
}

export function dirIsEmpty(dir) {
  return !existsSync(dir) || readdirSync(dir).filter((f) => f !== '.DS_Store').length === 0;
}
