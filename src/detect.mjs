import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const run = (cmd, args = [], opts = {}) => {
  try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000, ...opts }).trim(); } catch { return null; }
};
const which = (bin) => run(process.platform === 'win32' ? 'where' : 'which', [bin])?.split('\n')[0] ?? null;

export function detectNode() {
  return process.versions.node;
}

export function detectPackageManagers() {
  const found = {};
  for (const pm of ['pnpm', 'yarn', 'bun', 'npm']) {
    const v = run(pm, ['--version']);
    if (v) found[pm] = v;
  }
  return found;
}

export function detectXcode() {
  if (process.platform !== 'darwin') return null;
  const out = run('xcodebuild', ['-version']);
  const m = out && /Xcode (\d+(?:\.\d+)*)/.exec(out);
  const path = run('xcode-select', ['-p']);
  return m ? { version: m[1], path } : null;
}

export function detectCocoaPods() {
  return run('pod', ['--version']);
}

export function detectRuby() {
  const out = run('ruby', ['--version']);
  const m = out && /ruby (\d+\.\d+\.\d+)/.exec(out);
  return m ? m[1] : null;
}

export function detectJdk() {
  const candidates = [];
  if (process.env.JAVA_HOME && existsSync(join(process.env.JAVA_HOME, 'bin'))) candidates.push(process.env.JAVA_HOME);
  const studio = process.platform === 'darwin'
    ? ['/Applications/Android Studio.app/Contents/jbr/Contents/Home', join(homedir(), 'Applications/Android Studio.app/Contents/jbr/Contents/Home')]
    : process.platform === 'win32'
      ? [join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Android', 'Android Studio', 'jbr')]
      : ['/opt/android-studio/jbr', '/usr/local/android-studio/jbr'];
  candidates.push(...studio);
  const roots = process.platform === 'darwin' ? ['/Library/Java/JavaVirtualMachines'] : process.platform === 'win32' ? [join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Java'), join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Eclipse Adoptium')] : ['/usr/lib/jvm'];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const d of readdirSync(root)) {
      const home = process.platform === 'darwin' ? join(root, d, 'Contents/Home') : join(root, d);
      if (existsSync(join(home, 'bin'))) candidates.push(home);
    }
  }
  const found = [];
  for (const home of candidates) {
    const bin = join(home, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
    if (!existsSync(bin)) continue;
    const r = spawnSync(bin, ['-version'], { encoding: 'utf8', timeout: 15000 });
    const m = /version "(\d+)/.exec(`${r.stdout ?? ''}${r.stderr ?? ''}`);
    if (m) found.push({ home, major: +m[1] });
  }
  found.sort((a, b) => b.major - a.major);
  return found[0] ?? null;
}

export function detectAndroidSdk() {
  const candidates = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT,
    process.platform === 'darwin' ? join(homedir(), 'Library/Android/sdk') : null,
    process.platform === 'win32' ? join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk') : null,
    join(homedir(), 'Android/Sdk'), join(homedir(), 'Android/sdk')].filter(Boolean);
  for (const dir of candidates) if (existsSync(join(dir, 'platform-tools'))) {
    const ndks = existsSync(join(dir, 'ndk')) ? readdirSync(join(dir, 'ndk')).sort() : [];
    const platforms = existsSync(join(dir, 'platforms')) ? readdirSync(join(dir, 'platforms')).map((p) => +p.replace('android-', '')).filter(Number.isFinite).sort((a, b) => b - a) : [];
    return { dir, ndks, platforms };
  }
  return null;
}

export function detectWatchman() {
  return run('watchman', ['--version']);
}

export function detectSimulators() {
  if (process.platform !== 'darwin') return [];
  const out = run('xcrun', ['simctl', 'list', 'devices', 'available', '-j']);
  if (!out) return [];
  try {
    const { devices } = JSON.parse(out);
    return Object.entries(devices).flatMap(([runtime, list]) => list.map((d) => ({ name: d.name, udid: d.udid, state: d.state, runtime: runtime.split('.').pop() })));
  } catch { return []; }
}

export function detectAvds() {
  const sdk = detectAndroidSdk();
  if (!sdk) return [];
  const bin = join(sdk.dir, 'emulator', process.platform === 'win32' ? 'emulator.exe' : 'emulator');
  const out = existsSync(bin) ? run(bin, ['-list-avds']) : run('emulator', ['-list-avds']);
  return out ? out.split('\n').filter((l) => l && !l.startsWith('INFO')) : [];
}

export function detectChrome() {
  const env = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (env && existsSync(env)) return env;
  const mac = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'];
  const win = [join(process.env.ProgramFiles ?? '', 'Google/Chrome/Application/chrome.exe'), join(process.env['ProgramFiles(x86)'] ?? '', 'Google/Chrome/Application/chrome.exe'), join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'), join(process.env['ProgramFiles(x86)'] ?? '', 'Microsoft/Edge/Application/msedge.exe')];
  const paths = process.platform === 'darwin' ? mac : process.platform === 'win32' ? win : [];
  for (const p of paths) if (p && existsSync(p)) return p;
  for (const bin of ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge']) { const w = which(bin); if (w) return w; }
  return null;
}

export function detectVsCode() {
  return which('code') ?? (process.platform === 'darwin' && existsSync('/Applications/Visual Studio Code.app') ? '/Applications/Visual Studio Code.app' : null);
}

export function detectAll() {
  return {
    node: detectNode(),
    packageManagers: detectPackageManagers(),
    xcode: detectXcode(),
    cocoapods: detectCocoaPods(),
    ruby: detectRuby(),
    jdk: detectJdk(),
    androidSdk: detectAndroidSdk(),
    watchman: detectWatchman(),
    simulators: detectSimulators().filter((s) => s.state === 'Booted' || /iPhone/.test(s.name)).slice(0, 6),
    avds: detectAvds(),
    chrome: detectChrome(),
    vscode: detectVsCode(),
  };
}

export function defaultOutRoot() {
  const home = homedir();
  for (const d of ['Projects', 'Developer', 'dev', 'code']) if (existsSync(join(home, d))) return join(home, d);
  return home;
}

export function readLocalJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}
