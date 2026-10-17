import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodePng, encodePng, pngInfo, resizeRgba } from './png.mjs';
import { buildPage } from './page.mjs';
import { withPage } from './cdp.mjs';
import { playIconPath, writeProjectFile } from './fastlane.mjs';

const DENSITIES = [['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]];
const ANDROID_RES = 'android/app/src/main/res';
const ADAPTIVE_INSET = 0.18;

export function iosAppIconDir(root, app) {
  const ios = join(root, 'ios');
  if (existsSync(ios)) {
    const dirs = readdirSync(ios).filter((d) => existsSync(join(ios, d, 'Images.xcassets')));
    const pick = dirs.find((d) => existsSync(join(ios, d, 'Images.xcassets', 'AppIcon.appiconset'))) ?? dirs[0];
    if (pick) return `ios/${pick}/Images.xcassets/AppIcon.appiconset`;
  }
  return `ios/${app}/Images.xcassets/AppIcon.appiconset`;
}

const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

/** Background colour for the adaptive icon: configured, or the master's top-left pixel. */
export function iconBackgroundColor(cfg, master) {
  if (cfg.iconBackground) return cfg.iconBackground;
  try {
    const { data } = decodePng(master);
    return data[3] === 255 ? hex(data[0], data[1], data[2]) : '#ffffff';
  } catch { return '#ffffff'; }
}

/** Every icon file to write: project-relative path plus how to render it from the master. */
export function iconPlan(cfg, root, bg) {
  const files = [{ rel: `${iosAppIconDir(root, cfg.app)}/icon-1024.png`, size: 1024 }];
  for (const [name, scale] of DENSITIES) {
    const legacy = Math.round(48 * scale), adaptive = Math.round(108 * scale);
    files.push({ rel: `${ANDROID_RES}/mipmap-${name}/ic_launcher.png`, size: legacy });
    files.push({ rel: `${ANDROID_RES}/mipmap-${name}/ic_launcher_round.png`, size: legacy, round: true });
    files.push({ rel: `${ANDROID_RES}/mipmap-${name}/ic_launcher_foreground.png`, size: adaptive, inset: ADAPTIVE_INSET });
    files.push({ rel: `${ANDROID_RES}/mipmap-${name}/ic_launcher_background.png`, size: adaptive, bg, blank: true });
  }
  for (const locale of cfg.locales) files.push({ rel: playIconPath(locale), size: 512 });
  return files;
}

const jobKey = (f) => `${f.size}|${f.round ? 1 : 0}|${f.inset ?? 0}|${f.bg ?? ''}|${f.blank ? 1 : 0}`;

function uniqueJobs(plan) {
  const map = new Map();
  for (const f of plan) if (!map.has(jobKey(f))) map.set(jobKey(f), { type: 'icon', source: f.blank ? null : 'master', size: f.size, round: !!f.round, inset: f.inset ?? 0, bg: f.bg ?? null });
  return map;
}

export async function renderIconsInChrome(master, plan, { chromePath } = {}) {
  const jobs = uniqueJobs(plan);
  const keys = [...jobs.keys()];
  const html = buildPage({ jobs: [...jobs.values()], images: { master } });
  const out = new Map();
  await withPage({ html, width: 1024, height: 1024, chromePath }, async (page) => {
    for (let i = 0; i < keys.length; i++) out.set(keys[i], (await page.tile(i, 'png'))[0]);
  });
  return plan.map((f) => ({ ...f, data: out.get(jobKey(f)) }));
}

/** Pure-JS fallback: box-filter resize, circle clip and inset on the decoded master. */
export function renderIconsInNode(master, plan) {
  const src = decodePng(master);
  const cache = new Map();
  const render = (f) => {
    const s = f.size;
    const out = Buffer.alloc(s * s * 4);
    if (f.bg) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(f.bg.slice(i, i + 2), 16));
      for (let i = 0; i < s * s; i++) { out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = 255; }
    }
    if (!f.blank) {
      const inset = Math.round((f.inset ?? 0) * s);
      const inner = s - inset * 2;
      const scaled = resizeRgba(src.data, src.width, src.height, inner, inner);
      for (let y = 0; y < inner; y++) for (let x = 0; x < inner; x++) {
        const si = (y * inner + x) * 4, di = ((y + inset) * s + x + inset) * 4;
        const a = scaled[si + 3] / 255;
        for (let c = 0; c < 3; c++) out[di + c] = scaled[si + c] * a + out[di + c] * (1 - a);
        out[di + 3] = Math.max(out[di + 3], scaled[si + 3]);
      }
    }
    if (f.round) {
      const r = s / 2;
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        const d = Math.hypot(x + 0.5 - r, y + 0.5 - r);
        if (d > r) out[(y * s + x) * 4 + 3] = 0;
        else if (d > r - 1) out[(y * s + x) * 4 + 3] *= r - d;
      }
    }
    return encodePng(out, s, s);
  };
  return plan.map((f) => {
    const k = jobKey(f);
    if (!cache.has(k)) cache.set(k, render(f));
    return { ...f, data: cache.get(k) };
  });
}

const CONTENTS_JSON = JSON.stringify({ images: [{ filename: 'icon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }], info: { author: 'xcode', version: 1 } }, null, 2) + '\n';
const ADAPTIVE_XML = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
const bgXml = (color) => `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${color}</color>
</resources>
`;

/** Generate every icon from `cfg.icon` (a ≥1024 PNG). Uses Chrome when available, pure JS otherwise. */
export async function generateIcons(root, cfg, { chromePath, useChrome = true, log = () => {} } = {}) {
  const masterPath = join(root, cfg.icon);
  if (!existsSync(masterPath)) throw new Error(`icon not found: ${cfg.icon}`);
  const master = readFileSync(masterPath);
  const info = pngInfo(master);
  if (info.width < 1024 || info.height < 1024) throw new Error(`${cfg.icon} is ${info.width}x${info.height}; the master must be at least 1024x1024`);
  if (info.width !== info.height) throw new Error(`${cfg.icon} must be square`);
  const bg = iconBackgroundColor(cfg, master);
  const plan = iconPlan(cfg, root, bg);
  let rendered;
  if (useChrome && chromePath) {
    rendered = await renderIconsInChrome(master, plan, { chromePath });
  } else {
    log('no Chrome found; resizing icons in pure JS');
    rendered = renderIconsInNode(master, plan);
  }
  const written = [];
  for (const f of rendered) written.push(writeProjectFile(root, f.rel, f.data));
  written.push(writeProjectFile(root, `${iosAppIconDir(root, cfg.app)}/Contents.json`, CONTENTS_JSON));
  for (const name of ['ic_launcher', 'ic_launcher_round']) written.push(writeProjectFile(root, `${ANDROID_RES}/mipmap-anydpi-v26/${name}.xml`, ADAPTIVE_XML));
  written.push(writeProjectFile(root, `${ANDROID_RES}/values/ic_launcher_background.xml`, bgXml(bg)));
  return { written, background: bg };
}
