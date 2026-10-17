import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { getSize } from './presets.mjs';

export const slug = (text, fallback = 'screen') =>
  String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || fallback;

/** Resolve `rel` under `root`, refusing absolute paths and anything that escapes the root. */
export function safePath(root, rel) {
  if (typeof rel !== 'string' || !rel) throw new Error('empty path');
  if (isAbsolute(rel) || /^[a-zA-Z]:[\\/]/.test(rel)) throw new Error(`absolute path not allowed: ${rel}`);
  if (rel.split(/[\\/]/).some((seg) => seg === '..')) throw new Error(`path escapes the project: ${rel}`);
  const base = resolve(root);
  const abs = resolve(base, rel);
  if (abs !== base && !abs.startsWith(base + sep)) throw new Error(`path escapes the project: ${rel}`);
  return abs;
}

/** Overwrites one file in place (parent directories created). Never deletes anything. */
export function writeProjectFile(root, rel, data) {
  const abs = safePath(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, data);
  return abs;
}

/** Project-relative path of screenshot tile `index` (1-based) for a size and locale. */
export function screenshotPath(sizeId, locale, index, name, format) {
  const size = getSize(sizeId);
  const nn = String(index).padStart(2, '0');
  const file = `${nn}-${sizeId}-${slug(name)}`;
  if (size.store === 'App Store') return `fastlane/screenshots/${locale}/${file}.${format === 'jpeg' ? 'jpg' : 'png'}`;
  const folder = sizeId === 'android-tablet' ? 'tenInchScreenshots' : 'phoneScreenshots';
  return `fastlane/metadata/android/${locale}/images/${folder}/${file}.png`;
}

export const featureGraphicPath = (locale) => `fastlane/metadata/android/${locale}/images/featureGraphic.png`;
export const playIconPath = (locale) => `fastlane/metadata/android/${locale}/images/icon.png`;

const APP_STORE_FIELDS = { name: 'name', subtitle: 'subtitle', description: 'description', keywords: 'keywords', promotional_text: 'promotional_text', release_notes: 'release_notes', support_url: 'support_url', marketing_url: 'marketing_url', privacy_url: 'privacy_url' };
const PLAY_FIELDS = { title: 'title', short_description: 'short_description', full_description: 'full_description', video: 'video' };

/** deliver / supply metadata txt files from `listing[locale]`; only present fields are written. */
export function metadataFiles(cfg, locale) {
  const listing = cfg.listing?.[locale] ?? {};
  const files = [];
  const text = (v) => (Array.isArray(v) ? v.join(',') : String(v));
  const appStore = { ...listing, name: listing.name ?? listing.title ?? cfg.app };
  for (const [key, file] of Object.entries(APP_STORE_FIELDS)) if (appStore[key] !== undefined && appStore[key] !== '') files.push([`fastlane/metadata/${locale}/${file}.txt`, text(appStore[key])]);
  const play = { ...listing, title: listing.title ?? listing.name ?? cfg.app, short_description: listing.short_description ?? listing.subtitle, full_description: listing.full_description ?? listing.description };
  for (const [key, file] of Object.entries(PLAY_FIELDS)) if (play[key] !== undefined && play[key] !== '') files.push([`fastlane/metadata/android/${locale}/${file}.txt`, text(play[key])]);
  return files;
}

export function writeMetadata(root, cfg, locales = cfg.locales) {
  const written = [];
  for (const locale of locales) for (const [rel, body] of metadataFiles(cfg, locale)) written.push(writeProjectFile(root, rel, body.endsWith('\n') ? body : body + '\n'));
  return written;
}
