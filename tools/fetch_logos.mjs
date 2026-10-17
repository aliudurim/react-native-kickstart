#!/usr/bin/env node
// Vendors library logos into gui/logos/ so the GUI makes no external requests at runtime
// (works offline, and nothing phones home while you are picking options).
//
// Only marks that are actually official are downloaded. Libraries with no standalone mark
// of their own get hand-drawn glyphs written by this script, and the UI says so rather than
// passing them off as official.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const toolRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(toolRoot, 'gui', 'logos');
mkdirSync(outDir, { recursive: true });

// cdn.simpleicons.org serves the official brand glyph as a single-path SVG; the suffix is a
// brand-appropriate colour so the marks stay distinguishable side by side.
const REMOTE = {
  'react.svg':       'https://cdn.simpleicons.org/react/61DAFB',
  'expo.svg':        'https://cdn.simpleicons.org/expo/000020',
  'redux.svg':       'https://cdn.simpleicons.org/redux/764ABC',
  'tailwindcss.svg': 'https://cdn.simpleicons.org/tailwindcss/06B6D4',
  'zod.svg':         'https://cdn.simpleicons.org/zod/3E67B1',
  'jest.svg':        'https://cdn.simpleicons.org/jest/C21325',
  'i18next.svg':     'https://cdn.simpleicons.org/i18next/26A69A',
  'typescript.svg':  'https://cdn.simpleicons.org/typescript/3178C6',
};

const glyph = (color, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

// Drawn here, deliberately generic, for libraries with no mark of their own.
const LOCAL = {
  // bear paw: zustand's mascot is a bear
  'zustand.svg':    glyph('#6B4F2A', '<circle cx="12" cy="15" r="4.2"/><circle cx="6.5" cy="9" r="1.8"/><circle cx="10" cy="5.8" r="1.8"/><circle cx="14" cy="5.8" r="1.8"/><circle cx="17.5" cy="9" r="1.8"/>'),
  // key/value drum
  'mmkv.svg':       glyph('#F97316', '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 4v16"/><path d="M12 14h5M12 17h3"/>'),
  // wind lines over a device
  'nativewind.svg': glyph('#06B6D4', '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M2 8h3M2 12h3M2 16h3"/><path d="M11 18h2"/>'),
  // stacked style layers
  'unistyles.svg':  glyph('#8B5CF6', '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/><path d="M3 17l9 5 9-5"/>'),
  // rows with a lightning bolt
  'flashlist.svg':  glyph('#F59E0B', '<path d="M3 6h9M3 12h7M3 18h9"/><path d="M18 3l-4 8h4l-3 10 7-12h-4l2-6z"/>'),
  // shield with crack
  'sentry.svg':     glyph('#362D59', '<path d="M12 2.5l8 3.5v6c0 4.5-3.4 8.3-8 9.5-4.6-1.2-8-5-8-9.5V6z"/><path d="M12 7l-1.5 4h3l-1.5 4"/>'),
  // flame
  'firebase.svg':   glyph('#FFA000', '<path d="M12 21c-4 0-6.5-2.6-6.5-6 0-2.6 1.5-4.4 2.8-6.2L9.6 5l1.6 3.3L14 3.5l1.2 5 1.8-2c1 1.8 1.5 3.4 1.5 5 0 3.8-2.6 6.5-6.5 6.5z"/>'),
  'none.svg':       `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>`,
};

async function download(name, url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'react-native-kickstart' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  if (!/image\/svg\+xml/.test(type)) throw new Error(`unexpected content-type ${type}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) throw new Error(`suspiciously small (${buf.length} bytes)`);
  if (buf.length > 64 * 1024) throw new Error(`suspiciously large (${buf.length} bytes)`);
  if (!buf.subarray(0, 300).toString('utf8').includes('<svg')) throw new Error('body is not an <svg>');
  writeFileSync(join(outDir, name), buf);
  return `${buf.length} bytes, ${type}`;
}

let failed = 0;
for (const [name, body] of Object.entries(LOCAL)) {
  writeFileSync(join(outDir, name), body, 'utf8');
  console.log(`drawn     ${name.padEnd(18)} (no official mark exists)`);
}
for (const [name, url] of Object.entries(REMOTE)) {
  try {
    console.log(`fetched   ${name.padEnd(18)} ${await download(name, url)}`);
  } catch (e) {
    failed++;
    console.log(`FAILED    ${name.padEnd(18)} ${e.message}  <- ${url}`);
  }
}
process.exit(failed ? 1 : 0);
