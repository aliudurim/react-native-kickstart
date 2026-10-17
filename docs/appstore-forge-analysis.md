# appstore-forge — analysis

Source: https://github.com/hebertporto/appstore-forge (MIT, v1.1.0, about 5k lines, analysed 2026-10-16)

## What it is

A local app that turns raw app screenshots into App Store and Google Play marketing screenshots. Each one gets a background, a device frame drawn in code, and a headline with highlighted words. It is built with Vite, React 19, Tailwind 4, zustand and Electron (macOS arm64, unsigned). `pnpm dev` runs it in a plain browser; there, export falls back to a zip download. It makes no network calls.

## Core design: one renderer

`src/render/scene.ts` exposes `renderScene(ctx, w, h, screen, settings, sources)`. The preview calls it at about 230px wide (with a DPR transform) and the export calls it at full store pixels. There is no second CSS-based path.

Pipeline:
1. Merge the global settings with the screen's own overrides (`{...settings, ...overrides}`).
2. Draw the background: solid, or a CSS-style angled gradient.
3. Draw the optional rounded backdrop card.
4. Draw the text block, which auto-shrinks so it never overlaps the device.
5. Draw the devices. Their geometry is pure (`composeDevices`), and each one can be rotated and pull in the next or previous screen.

**Coordinates** are fractions of the tile height and the composition width, so output does not depend on resolution.

**Panoramas** (`span: 2`) are rendered at double width and sliced into two consecutive tiles. Neighbouring screens wrap around the set.

### Device frames: no bitmaps

```ts
{ id:'iphone-17-pro', label:'iPhone 17 Pro', group:'iPhone',
  screenAspect:1320/2868, bezel:0.030, radius:0.150, notch:'island' }   // 'island' | 'punch' | 'none'
```

- Each frame is a rounded body with a shadow, an edge stroke, and a clipped screen. The notch (Dynamic Island pill or punch-hole camera) is drawn on top.
- Screenshots are **cover-fitted and anchored to the top**, so the status bar is never cropped.
- There are 12 devices. Adding one takes about five lines.

### Text

- **Markup:** `Everything in *one place*` gives "one place" a coloured marker band. Successive starred spans cycle through the highlight colours.
- **Wrapping:** greedy word wrap against a narrow `TextMeasurer` interface. It is pure and unit-tested with a stub.
- **Auto-shrink:** text is scaled ×0.94 up to 30 times until it fits the band.
- **Fonts:** come from @fontsource and must be preloaded with `document.fonts.load`, or canvas silently falls back to a system font.

### Presets (all plain data)

| Preset | Shape | Count |
|---|---|---|
| Layouts | `{span, text:{top,height,left?,width?}\|null, device:{top,bottom,width?,cx?,cy?}, padX}` | 9 (text-top, hero, duo, panorama, centered…) |
| Positions | `placements:[{source:'self'\|'next'\|'prev', dx, dy, scale, rotate}]` | 11 (single, trio…) |
| Rhythms | `steps:[{layout, positionId, textAlign?}]`, cycled by screen index | 6 |
| Templates | partial settings + per-screen variants + rhythm + sample copy | 3 (classic, notebook, editorial) |
| Backgrounds | solid colours or `{from,to,angle}` gradients | 16 solid + gradients |
| Sizes | App Store 1320×2868, 1242×2688, iPad 2064×2752 · Play 1080×1920, 1080×2400, 1600×2560 | 6 |

## Guided flow

Six steps: **Target → Look → Shots → Copy → Tune → Review**. It works as a checklist rather than a wizard: you can click any step at any time.

- **Readiness:** one function, `readiness()` in `lib/progress.ts`, decides whether the set is ready to export. The rail, the footer and the review screen all read it.
  - **Only empty slots block export.** Everything else is advisory: missing copy, store limits (App Store 1–10, Play 2–8), and the warning that a PNG carries an alpha channel (it suggests JPEG for the App Store).
- **State:** a single zustand store. Images are kept in memory as decoded `HTMLImageElement`s. **Nothing is saved between launches.**
- **Export:**
  - Files are named `NN-<slug>[-part].png|jpg` and written to `store-screenshots-<sizeId>/`.
  - In Electron, the app opens a native folder picker, writes the files, then reveals them in Finder.
  - In the browser, it downloads a zip built with `fflate`.

## Weaknesses (fix if reused)

- **Data loss:** the Electron `write-files` handler runs `rm -rf` on the target subfolder before writing. Any of your own files in that folder are deleted.
- **Unchecked paths:** neither the folder nor the file names are checked for path traversal. `reveal-path` opens whatever path the page sends.
- **Electron hardening:** there is no CSP, and `sandbox` is not set explicitly.
- **Memory:** object URLs are never revoked.
- **Store tooling:** no persistence or project file, no localization, no batch export of several sizes, no Android feature graphic (1024×500), no app icon, no simulator capture. The listing metadata is display-only.
- **No CI**, only templates. Tests cover pure logic only.

## Portability — with zero npm dependencies

Rule for the kickstart: **no third-party npm packages.** Node built-ins, the browser, and first-party tools from Apple, Google or Microsoft only. So `@napi-rs/canvas`, `skia-canvas`, `puppeteer`, `playwright` and `fflate` are all out.

| Target | How, without dependencies |
|---|---|
| Browser GUI (our local `node:http` server) | The renderer runs in the user's browser exactly as it does today. The page encodes with `canvas.toBlob('image/png')` and POSTs the bytes to the local server, which writes them with `node:fs`. No zip library: the server writes the folder directly. |
| Headless CLI / Claude skill | Drive the user's **installed Chrome, Chromium or Edge** (all open source Chromium, by Google/Microsoft) in `--headless=new` mode. **Verified on this Mac with no npm packages:** `Google Chrome --headless=new --window-size=1320,2868 --screenshot=out.png file://tile.html` produced a correct 1320×2868 PNG (gradient, shadows, `roundRect`, text). The same renderer file is loaded into the page, so preview and export still share one code path. |
| Finer control | Node 22 ships a built-in `WebSocket` and `fetch`. Launch Chrome with `--remote-debugging-port=0`, read the port from `DevToolsActivePort`, and speak the DevTools Protocol directly (`Page.navigate`, `Page.captureScreenshot`, `Runtime.evaluate`). A thin CDP client is ~80 lines and removes the need for one Chrome process per tile. |
| Finding the browser | Same pattern as android-kickstart's `detectStudios()`: probe `/Applications/Google Chrome.app`, `Chromium.app`, `Microsoft Edge.app`; `%ProgramFiles%\Google\Chrome\Application\chrome.exe`; `google-chrome`, `chromium`, `microsoft-edge` on PATH. Warn, don't guess, if none is found. |
| Pure-Node fallback for non-text assets | PNG **encoding and decoding need only `node:zlib`** (deflate + the five scanline filters, ~150 lines). Solid/gradient backgrounds, rounded rectangles and the Play **feature graphic without text** can be rasterised in plain JS. Text rasterisation (a TrueType parser + scanline fill) is the one piece not worth writing from scratch, so headline tiles always go through the browser. |
| Reuse caveat | Tests import `DEFAULT_SETTINGS` from `store.ts`, which pulls in zustand. Move the defaults into their own module and drop zustand, React and Tailwind: the kickstart GUI is one vanilla HTML file like android-kickstart's. |

Capture stays first-party too: `xcrun simctl io booted screenshot` (Apple) and `adb exec-out screencap -p` (Google) write PNGs straight to disk.

## How it fits react-native-kickstart

A **`store-screenshots` feature**, scaffolded optionally into the generated app and driven by one config file:

1. **Config:** a `store-screenshots.config.json` in the generated project. It holds settings, template, rhythm, and screens (headline, subhead and overrides per screen, plus a path to each source image). Add a **locale** level so every screen can have copy in each language.
2. **Capture:** a `kickstart shots capture` command.
   - iOS: `xcrun simctl status_bar booted override --time 9:41 --batteryLevel 100 …`, then `xcrun simctl io booted screenshot`.
   - Android: `adb shell` demo mode, then `adb exec-out screencap -p`.
   - Optionally use Maestro or Detox flows to reach each screen in order.
3. **Render:**
   - Headless: `kickstart shots render` runs the ported `renderScene` under `@napi-rs/canvas`, for CI and for Claude.
   - Visual: a "Screenshots" tab in the kickstart GUI uses the same renderer in the browser.
4. **Output** in store-tool layouts:
   - fastlane deliver: `fastlane/screenshots/<locale>/NN-name.jpg`.
   - fastlane supply: `fastlane/metadata/android/<locale>/images/phoneScreenshots/`, `tenInchScreenshots/` and `featureGraphic.png`.
   - The listing fields go to deliver/supply metadata txt files or to the EAS Metadata `store.config.json`.
   - App Store output defaults to JPEG, or PNG with the alpha channel removed.
5. **Additions it lacks:** export every size at once, the Play feature graphic, app icon generation for all densities (fits with Expo's `icon`/`adaptiveIcon`), saved projects, and safe writes (no `rm -rf`, validated paths).
6. **Claude skill:** "generate store screenshots for Home, Profile, Settings with these headlines". The skill captures from the simulator, writes the config, and renders headless.

What to reuse directly:
- the single shared renderer,
- device frames drawn from geometry,
- the fraction-based coordinates,
- `*star*` markup with auto-shrink,
- the preset data shapes (layouts, positions, rhythms, templates),
- `readiness()` as the single place that decides export blockers versus warnings.
