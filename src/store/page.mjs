import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (f) => fileURLToPath(new URL(f, import.meta.url));

/** The browser-safe renderer modules, concatenated into one module body (imports/exports stripped). */
export function rendererSource() {
  return ['presets.mjs', 'text.mjs', 'frames.mjs', 'scene.mjs']
    .map((f) => readFileSync(here(f), 'utf8')
      .replace(/^import\s[^\n]*?from\s+'\.\/[^']+';\s*$/gm, '')
      .replace(/^export\s+(const|function|let|class)\s/gm, '$1 ')
      .replace(/^export\s*\{[^}]*\};?\s*$/gm, ''))
    .join('\n');
}

const RUNTIME = String.raw`
const images = {};
window.__ready = (async () => {
  await Promise.all(Object.entries(IMAGES).map(([key, src]) => new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => { images[key] = img; ok(); };
    img.onerror = () => fail(new Error('image failed: ' + key));
    img.src = src;
  })));
  if (document.fonts?.ready) await document.fonts.ready;
  return true;
})();

const canvas = document.createElement('canvas');
const tile = document.createElement('canvas');
const encode = (c, format, quality) => c.toDataURL(format === 'jpeg' ? 'image/jpeg' : 'image/png', format === 'jpeg' ? quality : undefined);
const opaque = (c, w, h) => { c.width = w; c.height = h; const x = c.getContext('2d', { alpha: false }); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); return x; };

window.__tile = (i, format = 'png', quality = 0.95) => {
  const job = JOBS[i];
  if (job.type === 'scene') {
    const span = sceneSpan(job.screen, job.settings);
    const ctx = opaque(canvas, job.w * span, job.h);
    renderScene(ctx, job.w, job.h, job.screen, job.settings, { self: images[job.sources.self] ?? null, next: images[job.sources.next] ?? null, prev: images[job.sources.prev] ?? null });
    const parts = [];
    for (let part = 0; part < span; part++) {
      const t = opaque(tile, job.w, job.h);
      t.drawImage(canvas, -part * job.w, 0);
      parts.push(encode(tile, format, quality));
    }
    return parts;
  }
  if (job.type === 'feature') {
    const ctx = opaque(canvas, job.w, job.h);
    renderFeature(ctx, job.w, job.h, job.screen, job.settings, images[job.source] ?? null);
    return [encode(canvas, 'png')];
  }
  if (job.type === 'icon') {
    const s = job.size;
    canvas.width = s; canvas.height = s;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, s, s);
    if (job.bg) { ctx.fillStyle = job.bg; ctx.fillRect(0, 0, s, s); }
    if (job.round) { ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2); ctx.clip(); }
    const inset = (job.inset ?? 0) * s;
    ctx.imageSmoothingQuality = 'high';
    const img = images[job.source];
    if (img) ctx.drawImage(img, inset, inset, s - inset * 2, s - inset * 2);
    return [encode(canvas, 'png')];
  }
  throw new Error('unknown job ' + job.type);
};
`;

/**
 * A self-contained page: the renderer inlined as a module, the sources embedded as data URIs,
 * and `window.__tile(i, format, quality)` returning one data URL per store tile of job i.
 */
export function buildPage({ jobs, images, fontCss = '' }) {
  const imageMap = Object.fromEntries(Object.entries(images).map(([k, v]) => [k, Buffer.isBuffer(v) ? `data:${mime(v)};base64,${v.toString('base64')}` : v]));
  const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>store render</title>
<style>html,body{margin:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}${fontCss}</style>
</head><body>
<script type="module">
${rendererSource()}
const JOBS = ${json(jobs)};
const IMAGES = ${json(imageMap)};
${RUNTIME}
</script>
</body></html>`;
}

function mime(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf[0] === 0x52 && buf[1] === 0x49) return 'image/webp';
  return 'application/octet-stream';
}
