// Bare workflow: ios/ and android/ come from Meta's own @react-native-community/template for the
// chosen RN version, downloaded once per version and renamed in place. The tarball is extracted
// with the system tar (macOS, Linux, Windows 10+ all ship one).
import { execFileSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, cpSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { manifest } from './resolver/npm.mjs';

export const TEMPLATE_PKG = '@react-native-community/template';
const cacheRoot = () => process.env.RN_KICKSTART_CACHE ?? join(homedir(), '.cache', 'rn-kickstart');

export async function fetchTemplate(rnVersion) {
  const dir = join(cacheRoot(), `template-${rnVersion}`);
  const marker = join(dir, 'package', 'template.config.js');
  if (existsSync(marker)) return readTemplate(dir);
  const m = await manifest(TEMPLATE_PKG, rnVersion).catch(() => null);
  if (!m?.dist?.tarball) throw new Error(`${TEMPLATE_PKG}@${rnVersion} is not on npm; cannot build a bare project for that version`);
  mkdirSync(dir, { recursive: true });
  const tgz = join(dir, 'template.tgz');
  const res = await fetch(m.dist.tarball);
  if (!res.ok) throw new Error(`${res.status} downloading ${m.dist.tarball}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tgz));
  // Relative paths only: Windows bsdtar reads a "C:" prefix as a remote host.
  execFileSync('tar', ['-xzf', 'template.tgz'], { cwd: dir, stdio: 'ignore' });
  rmSync(tgz, { force: true });
  return readTemplate(dir);
}

function readTemplate(dir) {
  const cfg = readFileSync(join(dir, 'package', 'template.config.js'), 'utf8');
  const placeholderName = /placeholderName:\s*'([^']+)'/.exec(cfg)?.[1] ?? 'HelloWorld';
  const titlePlaceholder = /titlePlaceholder:\s*'([^']+)'/.exec(cfg)?.[1] ?? 'Hello App Display Name';
  const templateDir = join(dir, 'package', /templateDir:\s*'\.\/([^']+)'/.exec(cfg)?.[1] ?? 'template');
  return { dir, templateDir, placeholderName, titlePlaceholder, packageJson: JSON.parse(readFileSync(join(templateDir, 'package.json'), 'utf8')) };
}

// Copies the native folders (and the files the template owns that we don't template ourselves)
// into outDir with every placeholder replaced.
export function copyNative(tpl, outDir, { name, displayName, bundleId }) {
  const lower = tpl.placeholderName.toLowerCase();
  const androidPkgPath = join(...bundleId.split('.'));
  const copies = ['ios', 'android', 'Gemfile', '_bundle', '_watchmanconfig'];
  for (const entry of copies) {
    const src = join(tpl.templateDir, entry);
    if (!existsSync(src)) continue;
    const dest = join(outDir, entry.startsWith('_') ? '.' + entry.slice(1) : entry);
    if ((entry === 'ios' || entry === 'android') && existsSync(dest)) rmSync(dest, { recursive: true, force: true });
    cpSync(src, dest, { recursive: true, filter: (p) => !p.endsWith('.DS_Store') });
  }
  // Rename paths containing the placeholder, deepest first.
  const all = walk(outDir).sort((a, b) => b.length - a.length);
  for (const p of all) {
    const base = basename(p);
    if (base.includes(tpl.placeholderName)) renameSync(p, join(dirname(p), base.replaceAll(tpl.placeholderName, name)));
  }
  // Move the Android package directory to the bundle id's path.
  const javaRoot = join(outDir, 'android', 'app', 'src', 'main', 'java');
  const oldPkg = join(javaRoot, 'com', lower);
  if (existsSync(oldPkg)) {
    const newPkg = join(javaRoot, androidPkgPath);
    mkdirSync(dirname(newPkg), { recursive: true });
    renameSync(oldPkg, newPkg);
    pruneEmpty(join(javaRoot, 'com'));
  }
  // Replace placeholders inside text files.
  for (const p of walk(outDir)) {
    if (isBinary(p)) continue;
    const before = readFileSync(p, 'utf8');
    let after = before
      .replaceAll(`org.reactjs.native.example.$(PRODUCT_NAME:rfc1034identifier)`, bundleId)
      .replaceAll(`com.${lower}`, bundleId)
      .replaceAll(tpl.titlePlaceholder, displayName)
      .replaceAll(tpl.placeholderName, name)
      .replaceAll(lower, bundleId.split('.').at(-1));
    if (after !== before) writeFileSync(p, after);
  }
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { walk(p, out); out.push(p); } else out.push(p);
  }
  return out;
}
function pruneEmpty(dir) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) pruneEmpty(join(dir, e.name));
  if (readdirSync(dir).length === 0) rmSync(dir, { recursive: true });
}
const BIN = /\.(png|jpg|jpeg|gif|jar|keystore|p12|mobileprovision|ttf|otf|zip|car)$/i;
function isBinary(p) {
  if (BIN.test(p)) return true;
  const st = statSync(p);
  if (!st.isFile()) return true;
  const head = readFileSync(p).subarray(0, 512);
  return head.includes(0);
}

export function tmpDir(prefix) {
  const d = join(tmpdir(), `${prefix}-${process.pid}-${Date.now()}`);
  mkdirSync(d, { recursive: true });
  return d;
}

// react-native-config needs native wiring the npm package does not do for you. Each product
// flavor gets its own env file (dotenv.gradle would stamp one file onto every variant in a
// multi-variant build), and each Xcode configuration maps to one through the ENVFILE setting.
export function wireEnvConfig(outDir) {
  const gradlePath = join(outDir, 'android', 'app', 'build.gradle');
  let gradle = readFileSync(gradlePath, 'utf8');
  if (!gradle.includes('applyEnvFile')) {
    const helpers = `
def readEnvFile(String path) {
    def location = rootProject.layout.projectDirectory.file("../$path")
    if (!location.asFile.exists()) {
        throw new GradleException("Missing env file '$path' (looked in \${location.asFile.absolutePath}).")
    }
    def env = [:]
    providers.fileContents(location).asText.get().split("\\n").each { line ->
        if (line.trim().isEmpty() || line.trim().startsWith('#')) return
        def matcher = (line =~ /^\\s*(?:export\\s+)?([A-Za-z0-9_]+)\\s*=\\s*['"]?(.*?)['"]?\\s*$/)
        if (matcher.getCount() == 1) env.put(matcher[0][1], matcher[0][2].replace('"', '\\\\"'))
    }
    return env
}

def applyEnvFile(flavor, String path) {
    readEnvFile(path).each { key, value ->
        flavor.buildConfigField "String", key, "\\"$value\\""
        flavor.resValue "string", key, "\\"\${value.replaceAll('%', '\\\\\\\\u0025')}\\""
    }
}

android {`;
    gradle = gradle.replace(/\nandroid \{/, helpers);
    gradle = gradle.replace(/\n    \/\/ debuggableVariants = \[[^\]]*\]\n/, '\n    debuggableVariants = ["devDebug", "prodDebug", "devDebugOptimized", "prodDebugOptimized"]\n');
    gradle = gradle.replace(/(\n    namespace "[^"]+"\n)/, `$1    buildFeatures {\n        buildConfig true\n    }\n`);
    gradle = gradle.replace(/(    defaultConfig \{[\s\S]*?\n    \}\n)/, `$1    flavorDimensions "env"
    productFlavors {
        dev {
            dimension "env"
            applicationIdSuffix ".dev"
            applyEnvFile(it, ".env.development")
        }
        prod {
            dimension "env"
            applyEnvFile(it, ".env.production")
        }
    }
`);
    writeFileSync(gradlePath, gradle);
  }

  const podfilePath = join(outDir, 'ios', 'Podfile');
  let podfile = readFileSync(podfilePath, 'utf8');
  if (!podfile.includes('ENVFILE')) {
    podfile = podfile.replace(/  post_install do \|installer\|\n/, `  # One env file per Xcode configuration; react-native-config bakes it in at build time.
  ENVFILES = {
    'Debug' => '$(PODS_ROOT)/../../.env.development',
    'Release' => '$(PODS_ROOT)/../../.env.production',
  }

  post_install do |installer|
    installer.pods_project.targets.each do |target|
      next unless target.name == 'react-native-config'
      target.build_configurations.each do |config|
        config.build_settings['ENVFILE'] = ENVFILES[config.name] || ENVFILES['Debug']
      end
    end
`);
    writeFileSync(podfilePath, podfile);
  }
}
