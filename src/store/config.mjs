import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { DEFAULT_SETTINGS, DEVICES, LAYOUTS, POSITIONS, RHYTHMS, SIZES, STORE_LIMITS, TEMPLATES, FRAME_COLORS, getLayout, getRhythm, getSize, getTemplate, rhythmStep, variantFor } from './presets.mjs';
import { sceneSpan, effectiveSettings } from './scene.mjs';

export const CONFIG_REL = 'store/kickstart.store.json';
export const SHOTS_DIR = 'store/shots';

const ids = (list) => list.map((x) => x.id);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const LOCALE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** Returns a list of problems; empty means the config is usable. */
export function validateConfig(cfg) {
  const errors = [];
  if (!isObj(cfg)) return ['config must be a JSON object'];
  if (typeof cfg.app !== 'string' || !cfg.app.trim()) errors.push('"app" must be a non-empty string');
  if (cfg.bundleId !== undefined && typeof cfg.bundleId !== 'string') errors.push('"bundleId" must be a string');
  if (!Array.isArray(cfg.locales) || !cfg.locales.length) errors.push('"locales" must be a non-empty array');
  else for (const l of cfg.locales) if (typeof l !== 'string' || !LOCALE.test(l)) errors.push(`locale "${l}" must look like en-US or de-DE`);
  if (cfg.template !== undefined && !ids(TEMPLATES).includes(cfg.template)) errors.push(`"template" must be one of ${ids(TEMPLATES).join(', ')}`);
  if (cfg.rhythm !== undefined && cfg.rhythm !== 'template' && !ids(RHYTHMS).includes(cfg.rhythm)) errors.push(`"rhythm" must be one of ${ids(RHYTHMS).join(', ')}, template`);
  for (const key of ['device', 'androidDevice']) if (cfg[key] !== undefined && !ids(DEVICES).includes(cfg[key])) errors.push(`"${key}" must be one of ${ids(DEVICES).join(', ')}`);
  if (cfg.devices !== undefined) {
    if (!isObj(cfg.devices)) errors.push('"devices" must map size ids to device ids');
    else for (const [s, d] of Object.entries(cfg.devices)) {
      if (!getSize(s)) errors.push(`"devices": unknown size "${s}"`);
      if (!ids(DEVICES).includes(d)) errors.push(`"devices": unknown device "${d}"`);
    }
  }
  if (!Array.isArray(cfg.sizes) || !cfg.sizes.length) errors.push('"sizes" must be a non-empty array');
  else for (const s of cfg.sizes) if (!getSize(s)) errors.push(`size "${s}" must be one of ${ids(SIZES).join(', ')}`);
  if (cfg.format !== undefined && !['jpeg', 'png'].includes(cfg.format)) errors.push('"format" must be "jpeg" or "png"');
  if (cfg.background !== undefined) errors.push(...validateBackground(cfg.background, '"background"'));
  if (cfg.settings !== undefined) errors.push(...validateOverrides(cfg.settings, '"settings"'));
  if (cfg.icon !== undefined && typeof cfg.icon !== 'string') errors.push('"icon" must be a path');
  if (cfg.iconBackground !== undefined && !/^#[0-9a-fA-F]{6}$/.test(cfg.iconBackground)) errors.push('"iconBackground" must be a #rrggbb colour');
  if (cfg.listing !== undefined) {
    if (!isObj(cfg.listing)) errors.push('"listing" must map locales to listing fields');
    else for (const [l, v] of Object.entries(cfg.listing)) if (!isObj(v)) errors.push(`"listing.${l}" must be an object`);
  }
  if (cfg.feature !== undefined && !isObj(cfg.feature)) errors.push('"feature" must map locales to { headline, subhead }');
  if (!Array.isArray(cfg.screens)) errors.push('"screens" must be an array');
  else {
    const seen = new Set();
    cfg.screens.forEach((s, i) => {
      const at = `screens[${i}]`;
      if (!isObj(s)) { errors.push(`${at} must be an object`); return; }
      if (typeof s.id !== 'string' || !ID.test(s.id)) errors.push(`${at}.id must be lowercase letters, digits and dashes`);
      else if (seen.has(s.id)) errors.push(`${at}.id "${s.id}" is duplicated`);
      seen.add(s.id);
      if (s.source !== undefined && typeof s.source !== 'string' && !isObj(s.source)) errors.push(`${at}.source must be a path or an object`);
      if (s.copy !== undefined) {
        if (!isObj(s.copy)) errors.push(`${at}.copy must map locales to { headline, subhead }`);
        else for (const [l, c] of Object.entries(s.copy)) {
          if (!isObj(c)) errors.push(`${at}.copy.${l} must be an object`);
          else for (const k of ['headline', 'subhead']) if (c[k] !== undefined && typeof c[k] !== 'string') errors.push(`${at}.copy.${l}.${k} must be a string`);
        }
      }
      if (s.overrides !== undefined) errors.push(...validateOverrides(s.overrides, `${at}.overrides`));
    });
  }
  return errors;
}

function validateBackground(bg, at) {
  if (!isObj(bg)) return [`${at} must be an object`];
  if (bg.kind === 'solid') return typeof bg.color === 'string' ? [] : [`${at}.color must be a colour`];
  if (bg.kind === 'gradient') return typeof bg.from === 'string' && typeof bg.to === 'string' && Number.isFinite(bg.angle) ? [] : [`${at} gradient needs from, to and angle`];
  return [`${at}.kind must be "solid" or "gradient"`];
}

function validateOverrides(o, at) {
  if (!isObj(o)) return [`${at} must be an object`];
  const errors = [];
  const check = (key, ok, msg) => { if (o[key] !== undefined && !ok(o[key])) errors.push(`${at}.${key} ${msg}`); };
  check('layout', (v) => ids(LAYOUTS).includes(v), `must be one of ${ids(LAYOUTS).join(', ')}`);
  check('positionId', (v) => ids(POSITIONS).includes(v), `must be one of ${ids(POSITIONS).join(', ')}`);
  check('deviceId', (v) => ids(DEVICES).includes(v), 'is not a known device');
  check('frameColorId', (v) => ids(FRAME_COLORS).includes(v), `must be one of ${ids(FRAME_COLORS).join(', ')}`);
  check('textAlign', (v) => v === 'left' || v === 'center', 'must be "left" or "center"');
  for (const k of ['tilt', 'deviceScale', 'headlineScale', 'subheadScale', 'headlineTracking']) check(k, Number.isFinite, 'must be a number');
  for (const k of ['textColor', 'backdropColor', 'fontId']) check(k, (v) => v === null || typeof v === 'string', 'must be a string');
  check('highlights', (v) => Array.isArray(v) && v.every((c) => typeof c === 'string'), 'must be an array of colours');
  if (o.background !== undefined) errors.push(...validateBackground(o.background, `${at}.background`));
  return errors;
}

export function loadConfig(projectDir, rel = CONFIG_REL) {
  const path = resolve(projectDir, rel);
  if (!existsSync(path)) throw new Error(`no ${rel} in ${projectDir} (run "store init" first)`);
  let cfg;
  try { cfg = JSON.parse(readFileSync(path, 'utf8')); } catch (e) { throw new Error(`${rel}: ${e.message}`); }
  const errors = validateConfig(cfg);
  if (errors.length) throw new Error(`${rel}:\n  ${errors.join('\n  ')}`);
  return normalizeConfig(cfg);
}

export function normalizeConfig(cfg) {
  return {
    template: 'classic',
    rhythm: undefined,
    device: 'iphone-17-pro',
    androidDevice: 'pixel-9-pro',
    devices: {},
    format: 'jpeg',
    icon: 'store/icon.png',
    listing: {},
    feature: {},
    settings: {},
    ...cfg,
  };
}

/** The device a size renders with: explicit map, then the family default, then the config default. */
export function deviceFor(cfg, size) {
  if (cfg.devices?.[size.id]) return cfg.devices[size.id];
  if (size.id === 'ipad-13' || size.id === 'android-tablet') return size.device;
  return size.platform === 'android' ? cfg.androidDevice : cfg.device;
}

/** Global settings for one export size: defaults ← template ← config.settings ← config.background. */
export function settingsFor(cfg, sizeId) {
  const size = getSize(sizeId);
  const template = getTemplate(cfg.template);
  return {
    ...DEFAULT_SETTINGS,
    ...template.settings,
    ...(cfg.settings ?? {}),
    ...(cfg.background ? { background: cfg.background } : {}),
    deviceId: deviceFor(cfg, size),
    sizeId,
  };
}

export const rhythmIdFor = (cfg) => cfg.rhythm ?? getTemplate(cfg.template).rhythm ?? 'template';

/** Renderer screens for one locale: template variant ← rhythm step ← the screen's own overrides. */
export function screensFor(cfg, locale) {
  const template = getTemplate(cfg.template);
  const rhythmId = rhythmIdFor(cfg);
  const rhythm = rhythmId === 'template' ? null : getRhythm(rhythmId);
  return cfg.screens.map((s, i) => {
    const copy = s.copy?.[locale] ?? s.copy?.[cfg.locales[0]] ?? {};
    return {
      id: s.id,
      headline: copy.headline ?? '',
      subhead: copy.subhead ?? '',
      overrides: { ...variantFor(template, i), ...(rhythm ? rhythmStep(rhythm, i) ?? {} : {}), ...(s.overrides ?? {}) },
    };
  });
}

const other = (platform) => (platform === 'ios' ? 'android' : 'ios');

/** Candidate paths (relative to the project) for a screen's raw shot, most specific first. */
export function sourceCandidates(cfg, screen, locale, platform) {
  const out = [];
  const push = (p) => { if (typeof p === 'string' && p && !out.includes(p)) out.push(p); };
  const unwrap = (v, plat) => {
    if (typeof v === 'string') return v;
    if (!isObj(v)) return null;
    return v[plat] ?? null;
  };
  const src = screen.source;
  if (src !== undefined) {
    const perLocale = isObj(src) && (src[locale] !== undefined || cfg.locales.some((l) => src[l] !== undefined));
    const forLocale = perLocale ? (src[locale] ?? src[cfg.locales[0]]) : src;
    push(unwrap(forLocale, platform));
    push(unwrap(forLocale, other(platform)));
  }
  for (const l of [locale, cfg.locales[0]]) {
    push(`${SHOTS_DIR}/${l}/${screen.id}.${platform}.png`);
    push(`${SHOTS_DIR}/${l}/${screen.id}.${other(platform)}.png`);
    push(`${SHOTS_DIR}/${l}/${screen.id}.png`);
  }
  return out;
}

export function resolveSource(cfg, screen, locale, platform, projectDir, exists = (p) => existsSync(p)) {
  for (const rel of sourceCandidates(cfg, screen, locale, platform)) {
    const abs = isAbsolute(rel) ? rel : join(projectDir, rel);
    if (exists(abs)) return abs;
  }
  return null;
}

/** Where `capture` writes a screen's shot. */
export const capturePath = (locale, id, platform) => `${SHOTS_DIR}/${locale}/${id}.${platform}.png`;

/** One reading of "how far along is this set". Only empty slots block export. */
export function readinessFor(screens, settings, filled) {
  const total = screens.length;
  const filledCount = screens.filter((_, i) => filled[i]).length;
  const missingCopy = screens.filter((s) => getLayout(effectiveSettings(s, settings).layout).text !== null && !s.headline.trim()).length;
  const tiles = screens.reduce((n, s) => n + sceneSpan(s, settings), 0);
  const store = getSize(settings.sizeId).store;
  const limit = STORE_LIMITS[store];
  return {
    total, filled: filledCount, missingShots: total - filledCount, missingCopy, tiles, store, limit,
    overLimit: tiles > limit.max,
    underMin: total > 0 && tiles < limit.min,
    canExport: total > 0 && filledCount === total,
  };
}

/** Readiness per locale × screenshot size, plus the missing files, for the CLI report. */
export function readiness(cfg, projectDir, { locales = cfg.locales, sizes = cfg.sizes, exists } = {}) {
  const rows = [];
  for (const locale of locales) for (const sizeId of sizes) {
    const size = getSize(sizeId);
    if (size.kind !== 'screenshot') continue;
    const settings = settingsFor(cfg, sizeId);
    const screens = screensFor(cfg, locale);
    const sources = cfg.screens.map((s) => resolveSource(cfg, s, locale, size.platform, projectDir, exists));
    const r = readinessFor(screens, settings, sources.map(Boolean));
    rows.push({ locale, sizeId, ...r, missing: cfg.screens.filter((_, i) => !sources[i]).map((s) => capturePath(locale, s.id, size.platform)) });
  }
  const warnings = [];
  const playPhone = sizes.filter((s) => ['android-phone', 'android-phone-tall'].includes(s));
  if (playPhone.length > 1) warnings.push('android-phone and android-phone-tall both upload to phoneScreenshots; pick one');
  if (cfg.format === 'png' && sizes.some((s) => getSize(s)?.store === 'App Store')) warnings.push('App Store rejects PNGs with an alpha channel; "format": "jpeg" is safer');
  return { rows, warnings, canExport: rows.length > 0 && rows.every((r) => r.canExport) };
}
