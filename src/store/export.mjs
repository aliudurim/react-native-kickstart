import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSize } from './presets.mjs';
import { stripMarkup } from './text.mjs';
import { readiness, resolveSource, screensFor, settingsFor } from './config.mjs';
import { buildPage } from './page.mjs';
import { withPage } from './cdp.mjs';
import { featureGraphicPath, playIconPath, screenshotPath, writeMetadata, writeProjectFile } from './fastlane.mjs';
import { pngInfo } from './png.mjs';

/** Everything one Chrome session has to draw for a config, plus where each result goes. */
export function planRender(root, cfg, { locales = cfg.locales, sizes = cfg.sizes } = {}) {
  const images = {};
  const jobs = [];
  const warnings = [];
  const key = (abs) => {
    if (!abs) return null;
    if (!images[abs]) images[abs] = readFileSync(abs);
    return abs;
  };
  let maxW = 1, maxH = 1;
  for (const locale of locales) {
    for (const sizeId of sizes) {
      const size = getSize(sizeId);
      if (size.kind !== 'screenshot') continue;
      const screens = screensFor(cfg, locale);
      const settings = settingsFor(cfg, sizeId);
      const sources = cfg.screens.map((s) => key(resolveSource(cfg, s, locale, size.platform, root)));
      if (sources.some((s) => !s)) { warnings.push(`${locale}/${sizeId}: missing shots, skipped`); continue; }
      const at = (i) => sources[(i + sources.length) % sources.length];
      let tile = 0;
      screens.forEach((screen, i) => {
        jobs.push({ type: 'scene', w: size.w, h: size.h, screen, settings, sources: { self: at(i), next: at(i + 1), prev: at(i - 1) }, outputs: (n) => Array.from({ length: n }, (_, part) => screenshotPath(sizeId, locale, ++tile, stripMarkup(screen.headline) || screen.id, size.store === 'App Store' ? cfg.format : 'png')), format: size.store === 'App Store' ? cfg.format : 'png' });
      });
      maxW = Math.max(maxW, size.w * 2); maxH = Math.max(maxH, size.h);
    }
    if (sizes.includes('feature-graphic')) {
      const size = getSize('feature-graphic');
      const listing = cfg.listing?.[locale] ?? {};
      const copy = cfg.feature?.[locale] ?? cfg.feature?.[cfg.locales[0]] ?? { headline: cfg.app, subhead: listing.short_description ?? listing.subtitle ?? '' };
      const source = cfg.screens.length ? key(resolveSource(cfg, cfg.screens[0], locale, 'android', root)) : null;
      jobs.push({ type: 'feature', w: size.w, h: size.h, screen: { headline: copy.headline ?? '', subhead: copy.subhead ?? '' }, settings: settingsFor(cfg, 'feature-graphic'), source, outputs: () => [featureGraphicPath(locale)], format: 'png' });
    }
    if (sizes.includes('play-icon')) {
      const master = join(root, cfg.icon);
      if (existsSync(master)) jobs.push({ type: 'icon', size: 512, source: key(master), round: false, inset: 0, bg: null, outputs: () => [playIconPath(locale)], format: 'png' });
      else warnings.push(`${cfg.icon} not found; Play icon skipped`);
    }
  }
  return { jobs, images, warnings, viewport: { width: Math.min(maxW, 8192), height: Math.min(maxH, 8192) } };
}

/** Render every job through one headless Chrome page and write the fastlane tree. */
export async function renderAll(root, cfg, { locales, sizes, chromePath, outDir = root, log = () => {}, metadata = true } = {}) {
  const ready = readiness(cfg, root, { locales, sizes });
  const plan = planRender(root, cfg, { locales, sizes });
  for (const w of plan.warnings) log(`warning: ${w}`);
  if (!plan.jobs.length) throw new Error('nothing to render: no screenshots found (run "store capture" first)');
  const pageJobs = plan.jobs.map(({ outputs, format, ...job }) => job);
  const html = buildPage({ jobs: pageJobs, images: plan.images });
  const written = [];
  await withPage({ html, width: plan.viewport.width, height: plan.viewport.height, chromePath }, async (page) => {
    for (let i = 0; i < plan.jobs.length; i++) {
      const job = plan.jobs[i];
      const parts = await page.tile(i, job.format, 0.95);
      const rels = job.outputs(parts.length);
      parts.forEach((buf, p) => {
        written.push(writeProjectFile(outDir, rels[p], buf));
        log(`${rels[p]}  ${dims(buf, job.format)}`);
      });
    }
  });
  if (metadata) for (const f of writeMetadata(outDir, cfg, locales)) { written.push(f); log(f.slice(outDir.length + 1)); }
  return { written, readiness: ready, warnings: plan.warnings };
}

function dims(buf, format) {
  try {
    if (format === 'jpeg') return `${Math.round(buf.length / 1024)} KB jpeg`;
    const { width, height } = pngInfo(buf);
    return `${width}x${height}`;
  } catch { return ''; }
}
