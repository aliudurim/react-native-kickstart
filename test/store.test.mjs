import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';
import { crc32, decodePng, encodePng, jpegInfo, pngInfo, resizeRgba } from '../src/store/png.mjs';
import { parseMarkup, stripMarkup, wrap, layoutText, blockHeight } from '../src/store/text.mjs';
import { composeDevices, effectiveSettings, sceneSpan } from '../src/store/scene.mjs';
import { DEFAULT_SETTINGS, DEVICES, LAYOUTS, POSITIONS, RHYTHMS, SIZES, TEMPLATES, frameAspect, getLayout, getPosition, getDevice } from '../src/store/presets.mjs';
import { normalizeConfig, readiness, readinessFor, screensFor, settingsFor, sourceCandidates, validateConfig, deviceFor } from '../src/store/config.mjs';
import { metadataFiles, safePath, screenshotPath, slug, writeProjectFile } from '../src/store/fastlane.mjs';
import { iconPlan, renderIconsInNode } from '../src/store/icons.mjs';
import { buildPage, rendererSource } from '../src/store/page.mjs';

const rgba = (w, h, fn) => {
  const b = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, bl, a] = fn(x, y); b.set([r, g, bl, a], (y * w + x) * 4); }
  return b;
};

test('png: crc32 matches the reference value', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('png: encode/decode round trip with adaptive and fixed filters', () => {
  const w = 37, h = 23;
  const src = rgba(w, h, (x, y) => [x * 6 & 255, y * 11 & 255, (x * y) & 255, x % 3 ? 255 : 128]);
  for (const filter of ['adaptive', 'none']) {
    const png = encodePng(src, w, h, { filter });
    assert.equal(pngInfo(png).width, w);
    assert.equal(pngInfo(png).colorType, 6);
    const out = decodePng(png);
    assert.equal(out.width, w);
    assert.equal(out.height, h);
    assert.ok(out.data.equals(src), `round trip (${filter})`);
  }
});

test('png: decodes RGB, gray and palette images written by hand', () => {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const png = (w, h, colorType, raw, extra = []) => {
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = colorType;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), ...extra, chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  };
  const rgb = decodePng(png(2, 1, 2, Buffer.from([1, 10, 20, 30, 40, 50, 60])));
  assert.deepEqual([...rgb.data], [10, 20, 30, 255, 50, 70, 90, 255]);
  const gray = decodePng(png(2, 2, 0, Buffer.from([0, 7, 9, 2, 1, 1])));
  assert.deepEqual([...gray.data.subarray(12)], [10, 10, 10, 255]);
  const pal = decodePng(png(1, 1, 3, Buffer.from([0, 1]), [chunk('PLTE', Buffer.from([0, 0, 0, 200, 100, 50])), chunk('tRNS', Buffer.from([255, 9]))]));
  assert.deepEqual([...pal.data], [200, 100, 50, 9]);
});


test('png: resize averages boxes', () => {
  const src = rgba(4, 4, (x) => [x < 2 ? 0 : 200, 100, 0, 255]);
  const out = resizeRgba(src, 4, 4, 2, 2);
  assert.deepEqual([...out.subarray(0, 8)], [0, 100, 0, 255, 200, 100, 0, 255]);
});

test('jpegInfo reads the SOF marker', () => {
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0x0b, 0x34, 0x05, 0x28, 1, 1, 0x11, 0, 0xff, 0xd9]);
  assert.deepEqual(jpegInfo(jpg), { height: 2868, width: 1320 });
});

test('text: parseMarkup tags starred spans and drops an unmatched star', () => {
  assert.deepEqual(parseMarkup('The list that *feels* like a *notebook.*'), [
    { text: 'The', span: -1 }, { text: 'list', span: -1 }, { text: 'that', span: -1 }, { text: 'feels', span: 0 },
    { text: 'like', span: -1 }, { text: 'a', span: -1 }, { text: 'notebook.', span: 1 },
  ]);
  assert.deepEqual(parseMarkup('a *b c'), [{ text: 'a', span: -1 }, { text: 'b', span: -1 }, { text: 'c', span: -1 }]);
  assert.equal(stripMarkup('Everything in *one place*'), 'Everything in one place');
  assert.deepEqual(parseMarkup(''), []);
});

const stub = () => ({ font: '', letterSpacing: '', measureText: (t) => ({ width: t.length * 10 }) });

test('text: wrap is greedy and never splits a word', () => {
  const lines = wrap(stub(), parseMarkup('aa bb cc dd'), 55);
  assert.deepEqual(lines.map((l) => l.words.map((w) => w.text).join(' ')), ['aa bb', 'cc dd']);
  assert.equal(lines[0].width, 50);
  const long = wrap(stub(), parseMarkup('abcdefghijkl x'), 30);
  assert.equal(long.length, 2);
  assert.deepEqual(wrap(stub(), [], 100), []);
});

test('text: layoutText shrinks until the block fits', () => {
  const screen = { headline: 'one two three four five six seven eight nine ten', subhead: 'a long subtitle that also wraps a few times over' };
  const h = 1000;
  const fits = layoutText(stub(), screen, DEFAULT_SETTINGS, 800, 400, h);
  assert.equal(fits.headSize, h * 0.04);
  const tight = layoutText(stub(), screen, DEFAULT_SETTINGS, 300, 120, h);
  assert.ok(tight.headSize < h * 0.04);
  assert.ok(blockHeight(tight) <= 120 || tight.headSize < h * 0.014);
  assert.ok(tight.headLines.length > 0);
});

test('scene: composeDevices fits the slot, honours fixed width and spans', () => {
  const aspect = frameAspect(getDevice('iphone-17-pro'));
  const [one] = composeDevices(getLayout('text-top'), 'center', 1320, 2868, aspect, 1, 0);
  const slotH = 2868 * (0.95 - 0.27);
  assert.ok(Math.abs(one.box.h - slotH) < 0.01 || Math.abs(one.box.w - 1320 * 0.82) < 0.01);
  assert.ok(Math.abs(one.box.w / one.box.h - aspect) < 1e-9);
  assert.ok(Math.abs(one.box.x + one.box.w / 2 - 660) < 1e-6, 'centred');
  assert.equal(one.angle, 0);

  const hero = composeDevices(getLayout('hero'), 'tilted', 1080, 1920, aspect, 1, 3);
  assert.ok(Math.abs(hero[0].box.w - 1080 * 0.95 * 0.98) < 1e-6);
  assert.equal(hero[0].angle, -4);

  const pano = composeDevices(getLayout('panorama'), 'lean', 1320, 2868, aspect, 1, 0);
  assert.ok(Math.abs(pano[0].box.x + pano[0].box.w / 2 - 2640 * 0.6) < 1e-6, 'centre across the seam');
  const trio = composeDevices(getLayout('duo'), 'trio', 1000, 2000, aspect, 1, 0);
  assert.deepEqual(trio.map((b) => b.source), ['prev', 'next', 'self']);
});

test('scene: effectiveSettings and sceneSpan', () => {
  const screen = { headline: '', subhead: '', overrides: { layout: 'panorama' } };
  assert.equal(effectiveSettings(screen, DEFAULT_SETTINGS).layout, 'panorama');
  assert.equal(sceneSpan(screen, DEFAULT_SETTINGS), 2);
  assert.equal(sceneSpan({ overrides: {} }, DEFAULT_SETTINGS), 1);
});

test('presets: counts and referential integrity', () => {
  assert.equal(DEVICES.length, 12);
  assert.equal(LAYOUTS.length, 9);
  assert.equal(POSITIONS.length, 11);
  assert.equal(RHYTHMS.length, 6);
  assert.equal(TEMPLATES.length, 3);
  for (const r of RHYTHMS) for (const s of r.steps) { assert.ok(getLayout(s.layout).id === s.layout); assert.ok(getPosition(s.positionId).id === s.positionId); }
  for (const s of SIZES) if (s.device) assert.equal(getDevice(s.device).id, s.device);
  assert.deepEqual(SIZES.find((s) => s.id === 'iphone-6-9'), { id: 'iphone-6-9', label: 'iPhone 6.9"', store: 'App Store', platform: 'ios', w: 1320, h: 2868, kind: 'screenshot', device: 'iphone-17-pro' });
  const data = JSON.parse(readFileSync(new URL('../data/devices.json', import.meta.url), 'utf8'));
  assert.deepEqual(data.devices.map((d) => d.id), DEVICES.map((d) => d.id));
  assert.deepEqual(data.sizes, SIZES);
});

const baseConfig = () => ({
  app: 'Demo', bundleId: 'com.x.demo', locales: ['en-US', 'de-DE'], template: 'editorial', sizes: ['iphone-6-9', 'android-phone'], format: 'jpeg',
  listing: { 'en-US': { name: 'Demo', subtitle: 'Sub', description: 'Desc', keywords: ['a', 'b'] } },
  screens: [
    { id: 'login', copy: { 'en-US': { headline: 'Sign in *fast*', subhead: '' } } },
    { id: 'home', source: { ios: 'shots/home-ios.png', android: 'shots/home-android.png' }, copy: { 'en-US': { headline: 'Home' }, 'de-DE': { headline: 'Start' } } },
  ],
});

test('config: validation catches bad shapes and ids', () => {
  assert.deepEqual(validateConfig(baseConfig()), []);
  assert.ok(validateConfig({}).length >= 4);
  const bad = { ...baseConfig(), template: 'nope', sizes: ['iphone-6-9', 'huge'], format: 'gif', screens: [{ id: 'A B' }, { id: 'x' }, { id: 'x' }] };
  const errors = validateConfig(bad);
  for (const re of [/template/, /huge/, /format/, /screens\[0\]\.id/, /duplicated/]) assert.ok(errors.some((e) => re.test(e)), `expected ${re}`);
  assert.ok(validateConfig({ ...baseConfig(), background: { kind: 'gradient', from: '#000' } }).some((e) => /gradient/.test(e)));
  assert.ok(validateConfig({ ...baseConfig(), screens: [{ id: 'a', overrides: { layout: 'bogus' } }] }).some((e) => /overrides\.layout/.test(e)));
});

test('config: settings, device per size, and screens with variants + rhythm + overrides', () => {
  const cfg = normalizeConfig({ ...baseConfig(), background: { kind: 'solid', color: '#123456' }, settings: { textColor: '#fff' } });
  const s = settingsFor(cfg, 'iphone-6-9');
  assert.equal(s.deviceId, 'iphone-17-pro');
  assert.equal(s.background.color, '#123456');
  assert.equal(s.textColor, '#fff');
  assert.equal(s.frameColorId, 'deep-blue');
  assert.equal(settingsFor(cfg, 'android-phone').deviceId, 'pixel-9-pro');
  assert.equal(settingsFor(cfg, 'ipad-13').deviceId, 'ipad-13');
  assert.equal(deviceFor({ ...cfg, devices: { 'android-phone': 'galaxy-s25' } }, SIZES.find((x) => x.id === 'android-phone')), 'galaxy-s25');

  const screens = screensFor(cfg, 'de-DE');
  assert.equal(screens[0].headline, 'Sign in *fast*', 'falls back to the first locale');
  assert.equal(screens[1].headline, 'Start');
  assert.equal(screens[0].overrides.layout, 'panorama');
  assert.equal(screens[1].overrides.layout, 'hero');
  const uniform = screensFor({ ...cfg, rhythm: 'uniform' }, 'en-US');
  assert.equal(uniform[0].overrides.layout, 'panorama', 'uniform keeps the template variants');
  const own = screensFor({ ...cfg, screens: [{ id: 'a', overrides: { layout: 'centered' } }] }, 'en-US');
  assert.equal(own[0].overrides.layout, 'centered');
});

test('config: source candidates, most specific first', () => {
  const cfg = normalizeConfig(baseConfig());
  assert.deepEqual(sourceCandidates(cfg, cfg.screens[1], 'de-DE', 'ios').slice(0, 3), ['shots/home-ios.png', 'shots/home-android.png', 'store/shots/de-DE/home.ios.png']);
  assert.equal(sourceCandidates(cfg, cfg.screens[0], 'en-US', 'android')[0], 'store/shots/en-US/login.android.png');
  const perLocale = { id: 'x', source: { 'en-US': 'en.png', 'de-DE': { ios: 'de-ios.png' } } };
  assert.equal(sourceCandidates(cfg, perLocale, 'de-DE', 'ios')[0], 'de-ios.png');
  assert.equal(sourceCandidates(cfg, perLocale, 'fr-FR', 'android')[0], 'en.png');
});

test('config: readiness blocks only on missing shots', () => {
  const cfg = normalizeConfig(baseConfig());
  const settings = settingsFor(cfg, 'iphone-6-9');
  const screens = screensFor(cfg, 'en-US');
  const r = readinessFor(screens, settings, [true, false]);
  assert.equal(r.missingShots, 1);
  assert.equal(r.canExport, false);
  assert.equal(r.tiles, 3, 'panorama counts twice');
  const ok = readinessFor(screens, settings, [true, true]);
  assert.equal(ok.canExport, true);
  assert.equal(ok.underMin, false);
  const many = readinessFor(Array.from({ length: 9 }, (_, i) => ({ id: `s${i}`, headline: '', subhead: '', overrides: {} })), { ...settings, sizeId: 'android-phone' }, Array(9).fill(true));
  assert.equal(many.overLimit, true);
  assert.equal(many.missingCopy, 9);

  const exists = (p) => p.endsWith('home-ios.png') || p.endsWith('login.android.png') || p.endsWith('home-android.png');
  const full = readiness(cfg, '/proj', { exists });
  assert.equal(full.rows.length, 4);
  assert.ok(full.rows.every((x) => x.canExport), 'an iOS slot falls back to the Android shot and de-DE to en-US');
  const partial = readiness(cfg, '/proj', { exists: (p) => /home-/.test(p) });
  assert.equal(partial.rows.find((x) => x.locale === 'en-US' && x.sizeId === 'android-phone').canExport, false);
  assert.deepEqual(partial.rows.find((x) => x.locale === 'en-US' && x.sizeId === 'iphone-6-9').missing, ['store/shots/en-US/login.ios.png']);
  assert.equal(partial.canExport, false);
  assert.ok(readiness({ ...cfg, format: 'png' }, '/proj', { exists }).warnings.some((w) => /alpha/.test(w)));
});

test('fastlane: paths stay inside the project', () => {
  const root = '/proj/app';
  assert.equal(safePath(root, 'fastlane/screenshots/en-US/01-a.jpg'), '/proj/app/fastlane/screenshots/en-US/01-a.jpg');
  for (const bad of ['../x.png', 'a/../../x', '/etc/passwd', 'a/b/../../../x', '']) assert.throws(() => safePath(root, bad), `${bad} should be rejected`);
  assert.equal(screenshotPath('iphone-6-9', 'en-US', 1, 'Sign in fast', 'jpeg'), 'fastlane/screenshots/en-US/01-iphone-6-9-sign-in-fast.jpg');
  assert.equal(screenshotPath('android-tablet', 'de-DE', 12, '', 'png'), 'fastlane/metadata/android/de-DE/images/tenInchScreenshots/12-android-tablet-screen.png');
  assert.equal(screenshotPath('android-phone', 'en-US', 2, 'Home', 'jpeg'), 'fastlane/metadata/android/en-US/images/phoneScreenshots/02-android-phone-home.png');
  assert.equal(slug('Héllo, Wörld!!'), 'h-llo-w-rld');
});

test('fastlane: metadata files per store from the listing', () => {
  const files = metadataFiles(normalizeConfig(baseConfig()), 'en-US');
  const map = Object.fromEntries(files);
  assert.equal(map['fastlane/metadata/en-US/name.txt'], 'Demo');
  assert.equal(map['fastlane/metadata/en-US/keywords.txt'], 'a,b');
  assert.equal(map['fastlane/metadata/android/en-US/title.txt'], 'Demo');
  assert.equal(map['fastlane/metadata/android/en-US/short_description.txt'], 'Sub');
  assert.equal(map['fastlane/metadata/android/en-US/full_description.txt'], 'Desc');
  const none = metadataFiles(normalizeConfig({ ...baseConfig(), listing: {} }), 'de-DE');
  assert.deepEqual(none.map(([p]) => p), ['fastlane/metadata/de-DE/name.txt', 'fastlane/metadata/android/de-DE/title.txt']);
});

test('fastlane: writeProjectFile overwrites in place and refuses escapes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rnk-store-test-'));
  try {
    writeProjectFile(dir, 'a/b.txt', 'one');
    writeProjectFile(dir, 'a/b.txt', 'two');
    assert.equal(readFileSync(join(dir, 'a/b.txt'), 'utf8'), 'two');
    assert.throws(() => writeProjectFile(dir, '../escape.txt', 'x'));
    assert.ok(!existsSync(join(dir, '..', 'escape.txt')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('icons: plan covers iOS, Android densities and Play; node fallback renders correct sizes', () => {
  const cfg = normalizeConfig({ ...baseConfig(), locales: ['en-US'] });
  const plan = iconPlan(cfg, '/nonexistent', '#112233');
  assert.ok(plan.some((f) => f.rel === 'ios/Demo/Images.xcassets/AppIcon.appiconset/icon-1024.png'));
  assert.deepEqual(plan.filter((f) => /ic_launcher\.png$/.test(f.rel)).map((f) => f.size), [48, 72, 96, 144, 192]);
  assert.deepEqual(plan.filter((f) => /foreground/.test(f.rel)).map((f) => f.size), [108, 162, 216, 324, 432]);
  assert.ok(plan.some((f) => f.rel === 'fastlane/metadata/android/en-US/images/icon.png' && f.size === 512));

  const master = encodePng(rgba(64, 64, () => [200, 40, 40, 255]), 64, 64);
  const small = [{ rel: 'a.png', size: 16 }, { rel: 'b.png', size: 16, round: true }, { rel: 'c.png', size: 16, bg: '#112233', blank: true }, { rel: 'd.png', size: 16, inset: 0.25 }];
  const out = renderIconsInNode(master, small);
  for (const f of out) assert.equal(pngInfo(f.data).width, f.size);
  const round = decodePng(out[1].data).data;
  assert.equal(round[3], 0, 'corner is transparent');
  assert.equal(round[(8 * 16 + 8) * 4 + 3], 255, 'centre is opaque');
  const bg = decodePng(out[2].data).data;
  assert.deepEqual([...bg.subarray(0, 4)], [0x11, 0x22, 0x33, 255]);
  const inset = decodePng(out[3].data).data;
  assert.equal(inset[3], 0);
  assert.equal(inset[(8 * 16 + 8) * 4], 200);
});

test('page: inlined renderer has no imports left and the page carries jobs and images', () => {
  const src = rendererSource();
  assert.ok(!/^import\s/m.test(src));
  assert.ok(!/^export\s/m.test(src));
  for (const fn of ['function renderScene', 'function composeDevices', 'function drawDevice', 'function parseMarkup', 'const DEFAULT_SETTINGS']) assert.ok(src.includes(fn), fn);
  const html = buildPage({ jobs: [{ type: 'scene', w: 10, h: 20, screen: { headline: '<script>', subhead: '', overrides: {} }, settings: DEFAULT_SETTINGS, sources: { self: 'a' } }], images: { a: encodePng(rgba(1, 1, () => [0, 0, 0, 255]), 1, 1) } });
  assert.ok(html.includes('data:image/png;base64,'));
  assert.ok(html.includes('window.__tile'));
  assert.ok(!html.includes('<script>"'), 'job JSON is escaped');
});
