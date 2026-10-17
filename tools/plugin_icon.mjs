// Renders the directory listing icon for the Claude Code plugin (1024×1024 PNG) with headless Chrome.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { withPage } from '../src/store/cdp.mjs';

const out = fileURLToPath(new URL('../plugins/react-native-kickstart/icon.png', import.meta.url));
const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:1024px;height:1024px;background:#0E7C6B}</style>
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#139A86"/><stop offset="1" stop-color="#0B5F55"/></linearGradient></defs>
  <rect width="1024" height="1024" fill="url(#g)"/>
  <g fill="none" stroke="#F1F4F4" stroke-width="30" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="512" cy="512" rx="330" ry="128"/>
    <ellipse cx="512" cy="512" rx="330" ry="128" transform="rotate(60 512 512)"/>
    <ellipse cx="512" cy="512" rx="330" ry="128" transform="rotate(120 512 512)"/>
  </g>
  <path d="M452 452 L560 512 L452 572" fill="none" stroke="#F1F4F4" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
<script>window.__ready = true</script>`;
await withPage({ html, width: 1024, height: 1024 }, async (page) => {
  writeFileSync(out, await page.screenshot({ clip: { x: 0, y: 0, width: 1024, height: 1024 } }));
});
console.log('wrote', out);
