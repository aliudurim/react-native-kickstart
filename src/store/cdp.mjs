import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { detectChrome } from '../detect.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launchChrome({ chromePath = detectChrome(), timeout = 20000 } = {}) {
  if (!chromePath) throw new Error('no Chrome, Chromium or Edge found; set CHROME_PATH or install one');
  const profile = mkdtempSync(join(tmpdir(), 'rnk-store-'));
  const args = ['--headless=new', '--remote-debugging-port=0', '--remote-allow-origins=*', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', '--disable-extensions',
    '--disable-background-networking', '--allow-file-access-from-files', 'about:blank'];
  const child = spawn(chromePath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  let exited = false;
  child.on('exit', () => { exited = true; });

  const portFile = join(profile, 'DevToolsActivePort');
  const deadline = Date.now() + timeout;
  let port = null;
  while (Date.now() < deadline && port === null) {
    const m = /DevTools listening on ws:\/\/[^:]+:(\d+)/.exec(stderr);
    if (m) port = +m[1];
    else if (existsSync(portFile)) {
      const first = readFileSync(portFile, 'utf8').split('\n')[0];
      if (/^\d+$/.test(first) && +first > 0) port = +first;
    }
    if (exited) break;
    if (port === null) await sleep(50);
  }
  const kill = () => {
    if (!exited) { try { child.kill('SIGKILL'); } catch {} }
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  };
  if (port === null) { kill(); throw new Error(`Chrome did not expose a DevTools port\n${stderr.slice(-800)}`); }
  return { port, profile, kill, child };
}

export async function newPageTarget(port) {
  const url = `http://127.0.0.1:${port}/json/new?about:blank`;
  for (const method of ['PUT', 'GET']) {
    const res = await fetch(url, { method }).catch(() => null);
    if (res?.ok) return res.json();
  }
  throw new Error('could not create a DevTools page target');
}

/** A minimal DevTools protocol client over Node's built-in WebSocket. */
export class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(`${msg.error.message}${msg.error.data ? `: ${msg.error.data}` : ''}`)) : resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.listeners.get(msg.method) ?? []) fn(msg.params);
      }
    });
  }

  static connect(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.addEventListener('open', () => resolve(new Cdp(ws)), { once: true });
      ws.addEventListener('error', () => reject(new Error(`WebSocket connect failed: ${url}`)), { once: true });
    });
  }

  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }

  once(method) {
    return new Promise((resolve) => this.on(method, resolve));
  }

  /** Evaluate an expression; promises are awaited, the value comes back by value. */
  async evaluate(expression) {
    const { result, exceptionDetails } = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text ?? 'evaluate failed');
    return result.value;
  }

  close() { try { this.ws.close(); } catch {} }
}

/**
 * Launch Chrome, load `html` in a page sized `width`×`height`, wait for `window.__ready`, then
 * hand the page to `fn`. Chrome and the temp profile are always cleaned up.
 */
export async function withPage({ html, width = 1280, height = 800, chromePath, timeout = 60000 }, fn) {
  const chrome = await launchChrome({ chromePath });
  let cdp = null;
  try {
    const target = await newPageTarget(chrome.port);
    cdp = await Cdp.connect(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    const file = join(chrome.profile, 'page.html');
    writeFileSync(file, html);
    const loaded = cdp.once('Page.loadEventFired');
    await cdp.send('Page.navigate', { url: pathToFileURL(file).href });
    await Promise.race([loaded, sleep(timeout).then(() => { throw new Error('page load timed out'); })]);
    await cdp.evaluate('window.__ready');
    return await fn({
      cdp,
      evaluate: (expr) => cdp.evaluate(expr),
      tile: async (i, format = 'png', quality = 0.95) => (await cdp.evaluate(`window.__tile(${i}, ${JSON.stringify(format)}, ${quality})`)).map(dataUrlToBuffer),
      screenshot: async ({ clip, format = 'png', quality } = {}) => {
        const r = await cdp.send('Page.captureScreenshot', { format, ...(quality !== undefined ? { quality } : {}), ...(clip ? { clip: { ...clip, scale: 1 } } : {}), captureBeyondViewport: true });
        return Buffer.from(r.data, 'base64');
      },
    });
  } finally {
    cdp?.close();
    chrome.kill();
  }
}

export const dataUrlToBuffer = (url) => {
  const i = url.indexOf('base64,');
  if (i < 0) throw new Error('canvas returned no base64 data URL');
  return Buffer.from(url.slice(i + 7), 'base64');
};
