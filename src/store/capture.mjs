import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000, ...opts });
const tryRun = (cmd, args) => { try { return run(cmd, args); } catch { return null; } };

const CLEAN_STATUS_BAR = ['--time', '9:41', '--batteryState', 'charged', '--batteryLevel', '100', '--cellularMode', 'active', '--cellularBars', '4', '--wifiBars', '3', '--operatorName', ''];

/** Screenshot a booted iOS simulator with a clean status bar into `out` (PNG). */
export function captureIos({ udid = 'booted', out }) {
  mkdirSync(dirname(out), { recursive: true });
  tryRun('xcrun', ['simctl', 'status_bar', udid, 'override', ...CLEAN_STATUS_BAR]);
  try {
    run('xcrun', ['simctl', 'io', udid, 'screenshot', '--type=png', out]);
  } finally {
    tryRun('xcrun', ['simctl', 'status_bar', udid, 'clear']);
  }
  return out;
}

const DEMO = [
  ['enter'],
  ['clock', '-e', 'hhmm', '1200'],
  ['battery', '-e', 'level', '100', '-e', 'plugged', 'false'],
  ['network', '-e', 'wifi', 'show', '-e', 'level', '4'],
  ['network', '-e', 'mobile', 'show', '-e', 'datatype', 'none', '-e', 'level', '4'],
  ['notifications', '-e', 'visible', 'false'],
  ['status', '-e', 'bluetooth', 'hidden'],
];

/** Screenshot an Android device/emulator in SystemUI demo mode into `out` (PNG). */
export function captureAndroid({ serial, out }) {
  mkdirSync(dirname(out), { recursive: true });
  const adb = (args, opts) => run('adb', [...(serial ? ['-s', serial] : []), ...args], opts);
  const demo = (cmd) => { try { adb(['shell', 'am', 'broadcast', '-a', 'com.android.systemui.demo', '-e', 'command', ...cmd]); } catch {} };
  try { adb(['shell', 'settings', 'put', 'global', 'sysui_demo_allowed', '1']); } catch {}
  for (const cmd of DEMO) demo(cmd);
  try {
    const png = adb(['exec-out', 'screencap', '-p'], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
    writeFileSync(out, png);
  } finally {
    demo(['exit']);
  }
  return out;
}

/** Booted iOS simulators and connected Android devices. */
export function listBooted() {
  const ios = [];
  if (process.platform === 'darwin') {
    const out = tryRun('xcrun', ['simctl', 'list', 'devices', 'booted', '-j']);
    if (out) {
      try {
        for (const [runtime, list] of Object.entries(JSON.parse(out).devices)) for (const d of list) if (d.state === 'Booted') ios.push({ platform: 'ios', udid: d.udid, name: d.name, runtime: runtime.split('.').pop() });
      } catch {}
    }
  }
  const android = [];
  const adb = tryRun('adb', ['devices', '-l']);
  if (adb) for (const line of adb.split('\n').slice(1)) {
    const m = /^(\S+)\s+device\b(.*)$/.exec(line.trim());
    if (m) android.push({ platform: 'android', serial: m[1], name: /model:(\S+)/.exec(m[2])?.[1] ?? m[1] });
  }
  return { ios, android };
}

export const hasMaestro = () => spawnSync(process.platform === 'win32' ? 'where' : 'which', ['maestro'], { stdio: 'ignore' }).status === 0;

/**
 * Run a Maestro flow; every `takeScreenshot: <name>` lands in `outDir` as `<name>.png`.
 * Maestro writes screenshots relative to its working directory, so it runs inside `outDir`.
 */
export function runMaestroFlow({ flow, outDir, platform, udid, serial }) {
  mkdirSync(outDir, { recursive: true });
  const args = [];
  if (platform === 'ios' && udid && udid !== 'booted') args.push('--udid', udid);
  if (platform === 'android' && serial) args.push('--device', serial);
  args.push('test', flow);
  const r = spawnSync('maestro', args, { cwd: outDir, stdio: 'inherit', timeout: 10 * 60 * 1000 });
  if (r.status !== 0) throw new Error(`maestro exited with ${r.status}`);
}
