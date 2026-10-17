# react-native-kickstart — design

Written 2026-10-17 from three inputs: the android-kickstart analysis, the appstore-forge analysis, and
`MOBILE-ARCHITECTURE-TEMPLATE.md` (the bare-RN architecture template), plus a landscape research pass.

## 1. What exists today, and the gap

| Tool | Choices | Versions | GUI | Tests in output | Live-resolved |
|---|---|---|---|---|---|
| Ignite (Infinite Red) | fixed stack, `--removeDemo` | hardcoded per release | no | Jest + Maestro | no |
| create-expo-app | template name only | per-SDK template packages | no | none | no |
| @react-native-community/cli init | template, pm | mirrors RN tag | no | smoke test | no |
| thecodingmachine boilerplate | JS/TS | hardcoded (RN 0.84) | no | some | no |
| obytes template | none, opinionated | hardcoded | no | Jest + Maestro | no |
| create-expo-stack / rn-new | router, styling, auth | hardcoded, shared | no | snapshot tests of generator | no |

Every generator hardcodes versions and re-releases on each RN/SDK bump. None resolves live, none caps
to the installed toolchain, none has a GUI, none runs a verification build, none makes store assets.
That is exactly what android-kickstart does for Android. The gap is real.

## 2. Principles (carried over)

1. **Zero npm dependencies.** Node ≥ 22 built-ins (`http`, `zlib`, `fetch`, `WebSocket`, `node:test`),
   plus first-party CLIs the user already has: Xcode (`xcrun simctl`), Android SDK (`adb`), Chrome/Edge
   headless. See `feedback-no-third-party-deps`.
2. **Live versions, never copied from blog posts.** Resolve from the npm registry, filter pre-releases,
   cap by compatibility, fall back to `pinned.json`.
3. **Warn, don't guess.** When no machine-readable source exists, print a warning; the verification
   build settles it.
4. **A real app, not an empty folder.** Login → Home with validation, 3 envs, CI gate, tests, CLAUDE.md.
5. **Design the walls, not the furniture** (template §0). Scaffold contracts and boundaries; never
   speculative subsystems.
6. **One data set drives CLI, GUI and the Claude skill**, so they cannot drift.

## 3. Choices

Two workflows, then one option group per concern. Defaults match the architecture template.

| Group | Flag | Choices | Default | Notes |
|---|---|---|---|---|
| Workflow | `--workflow` | `bare` · `expo` | `bare` | expo = Expo SDK, CNG, expo-router allowed |
| State | `--state` | `rtk` · `zustand` · `none` | `rtk` | rtk = Redux Toolkit + RTK Query, 3 slices, listener middleware |
| Server data | `--data` | `rtk-query` · `tanstack-query` · `fetch` | follows state | `baseQueryWithAuth` with 401 single-flight |
| Navigation | `--nav` | `react-navigation` · `expo-router` | `react-navigation` | expo-router only with `--workflow=expo` |
| Styling | `--styling` | `nativewind` · `unistyles` · `stylesheet` | `nativewind` | NativeWind 4 ⇒ Tailwind 3.x, enforced |
| Storage | `--storage` | `mmkv` · `async-storage` · `none` | `mmkv` | hand-rolled persist, no redux-persist |
| Forms | `--forms` | `rhf-zod` · `none` | `rhf-zod` | trio pinned together |
| i18n | `--i18n` | `i18next` · `none` | `i18next` | `en.json` from day 1 |
| Lists | `--lists` | `flash-list` · `flatlist` | `flash-list` | |
| Sample | `--sample` | `yes` · `no` | `yes` | login + home + fakes + tests |
| Modules | `--modules` | `roles,media,push,crash,analytics` | `crash,analytics` | template §2, §9, §10, §16 |
| Store assets | `--store` | `yes` · `no` | `yes` | screenshots config + icon pipeline + fastlane tree |

Presets (GUI): **Standard app** (all defaults), **Expo app** (expo + expo-router + zustand +
tanstack-query), **Minimal shell** (stylesheet, none everywhere, no sample).

## 4. Version resolution

```
pick RN  ──►  known-good core set  ──►  per-library ceilings  ──►  health check  ──►  pinned fallback
npm latest     Expo bundledNativeModules   peerDependencies            rn.directory      pinned.json
(or Expo SDK)  or rnx-kit align-deps       reanimated compat.json      /api/libraries/check
               profile (bare)              compat.json pairings
```

Sources, all machine-readable, all first-party:

| Need | Source |
|---|---|
| Latest stable of any package | `GET registry.npmjs.org/<pkg>` with `Accept: application/vnd.npm.install-v1+json`; filter semver pre-release, skip `deprecated`; never trust `next` |
| Expo SDK → RN/React | `api.expo.dev/v2/versions/latest` → `facebookReactNativeVersion` |
| Expo known-good set | `unpkg.com/expo@<v>/bundledNativeModules.json` / `api.expo.dev/v2/sdks/<sdk>/native-modules` |
| Bare known-good set | `@rnx-kit/align-deps` profile per RN minor (Microsoft) |
| Reanimated ↔ worklets ↔ RN | `react-native-reanimated/compatibility.json` + peerDependencies |
| New Architecture support | `reactnative.directory/api/libraries/check?packages=…` |
| Bare template files per RN | `rn-diff-purge` `release/<v>/RnDiffApp` |

`compat.json` (hand-maintained, like android-kickstart's) holds what has no source: RN → Node / Xcode /
CocoaPods / JDK / NDK / minSdk / iOS target floors; the paired-package rule; floors and bans from the
template (reanimated ≥ 4.5.0, RTK ≥ 2.8.2, Tailwind ~3.4 with NW 4, no redux-persist, no notifee,
no track-player). Each catalog artifact can carry `floor`, `ceiling`, `stablePattern`, `pairedWith`,
`pinExact: true` (native modules get exact pins, JS-only get carets — template §4.3).

Toolchain cap (the Studio → AGP equivalent): detect Xcode version → cap RN to the newest the compat
row says builds with it; detect JDK/NDK likewise for Android.

## 5. Generated app (sample = yes, defaults)

Exactly the template's §17 layout with Sprint 0 done:

- `src/store/` store.ts, `slices/{auth,prefs,ui}`, `api/{baseQuery,helpers(pickData),userApi}`,
  `listeners/{session,logout,persist}`, `selectors.ts`
- `src/lib/storage/` two MMKV instances `<slug>.auth` and `<slug>.default`, `persist.ts`
- `src/navigation/` conditional `RootNavigator` (Auth / Onboarding / AppTabs), `linking.ts`, `navigationRef`
- `src/screens/{login,home}` stateful Screen + stateless Content, previews via Storybook-free `__fixtures__`
- `src/components/` primitives: Text, Button, Input, Screen, NavBar, RemoteImage, Toast, Skeleton, EmptyState
- `src/lib/analytics.ts` no-op driver; `src/app/ErrorBoundary` + crash SDK stub
- `src/config/env.ts` typed, 3 envs (`<id>`, `<id>.staging`, `<id>.dev`) wired into flavors/schemes
- `src/i18n/locales/en.json`; `src/validations/` zod; `src/types/api.ts`
- `jest.config.js` + `jest/mock*.js` stub registry for every native dep chosen
- `.maestro/` smoke flows (login, home); `.github/workflows/ci.yml` = `tsc` + `eslint` + `jest`
- `CLAUDE.md` with stack, pairing rules, native-rebuild-vs-reload, gotchas ledger
- `store/` (if `--store`): `kickstart.store.json`, `icon.png` placeholder, fastlane metadata tree

## 6. Store assets module

Ported from appstore-forge, zero-dep:

- **Frames** drawn from geometry (`{screenAspect, bezel, radius, notch}`), no bitmaps, no fastlane
  frameit PNGs (unlicensed).
- **Renderer** `renderScene()` is one JS file shared by the GUI canvas and the headless path.
- **Headless**: detect Chrome/Edge → `--headless=new --remote-debugging-port=0` → CDP over Node's
  built-in `WebSocket` → `Emulation.setDeviceMetricsOverride` → `Page.captureScreenshot`. Fallback:
  in-browser canvas → `toBlob` → POST to the local server.
- **Capture**: `xcrun simctl status_bar booted override --time 9:41 …` + `simctl io booted screenshot`;
  Android demo mode + `adb exec-out screencap -p`. Optional Maestro flow to walk the screens.
- **Sizes** (verified 2026-10): App Store 1320×2868, 1206×2622, 2064×2752; Play 1080×1920, 1600×2560,
  feature graphic 1024×500; icon 512 (Play) and 1024 master (iOS). JPEG or alpha-stripped PNG.
- **Output** written verbatim to `fastlane/screenshots/<locale>/` and
  `fastlane/metadata/android/<locale>/images/…`, so `deliver`/`supply` upload with no mapping.
- **Icons**: one 1024 PNG → iOS single-size asset catalog, Android adaptive layers + mipmaps, Play 512.
  Resizing is done in the browser canvas or headless Chrome, PNG encoded by our own `node:zlib` encoder.
- **Localized copy**: `screens[].copy.<locale>.{headline,subhead}`.

## 7. Repository tree

```
react-native-kickstart/
├── bin/
│   ├── kickstart.mjs            CLI: prompts, flags, --dry-run, --offline, --build, --open
│   ├── gui.mjs                  node:http server, loopback+token guard, SSE /api/create
│   ├── versions.mjs             resolver only: --pin, --print-package-json
│   └── store.mjs                shots capture | render | icons | metadata
├── src/
│   ├── resolver/
│   │   ├── npm.mjs              abbreviated metadata, stable filter, semver compare
│   │   ├── expo.mjs             versions/latest, bundledNativeModules
│   │   ├── rnxkit.mjs           align-deps profile loader
│   │   ├── directory.mjs        new-arch check
│   │   └── constraints.mjs      pairs, floors, bans, toolchain caps, warnings
│   ├── scaffold.mjs             buildContext, STATIC_FILES, TS_FILES map, detect*()
│   ├── render.mjs               {{var}} / {{#if}} / {{#unless}} engine
│   ├── packagejson.mjs          package.json from catalog (carets vs exact pins)
│   ├── detect.mjs               node, pm, xcode, cocoapods, jdk, sdk, ndk, watchman, chrome
│   ├── store/
│   │   ├── scene.mjs            renderScene (shared GUI + headless)
│   │   ├── frames.mjs           geometric device frames
│   │   ├── text.mjs             markup, wrap, auto-shrink
│   │   ├── presets.mjs          devices, layouts, positions, rhythms, templates, sizes
│   │   ├── png.mjs              PNG encode/decode on node:zlib
│   │   ├── cdp.mjs              Chrome launch + DevTools protocol over WebSocket
│   │   ├── capture.mjs          simctl / adb capture + clean status bar
│   │   └── fastlane.mjs         deliver/supply tree writer
│   ├── guard.mjs  info.mjs  color.mjs
├── templates/
│   ├── root/                    package.json, tsconfig, babel, metro, jest, eslint, .nvmrc, CLAUDE.md
│   ├── src/                     one .tmpl per generated TS file (see §5)
│   ├── native/                  ios/ + android/ patches per RN line (from rn-diff-purge)
│   ├── expo/                    app.config.ts, eas.json
│   ├── ci/                      github workflow
│   └── store/                   kickstart.store.json, fastlane metadata skeleton
├── gui/
│   ├── index.html               vanilla, one file, Material-ish tokens, light/dark
│   ├── store.js                 Screenshots tab (uses src/store/*.mjs as ES modules)
│   ├── logos/  fonts/
├── data/
│   ├── catalog.json             artifacts + profiles
│   ├── libraries.json           name, vendor, summary, tradeoff, links
│   ├── compat.json              RN rows, pairs, floors, bans, toolchain
│   ├── pinned.json              last known-good
│   └── devices.json             frame geometry + store sizes
├── skills/
│   ├── rn-kickstart/SKILL.md
│   └── store-shots/SKILL.md
├── .claude-plugin/{plugin,marketplace}.json
├── test/                        node:test + audit + matrix (all-pairs real builds)
├── tools/                       pin_versions, fetch_api_levels, fetch_logos, fetch_fonts
└── vendor/                      nothing (no gradle wrapper needed; RN template brings its own)
```

## 8. Verification

- `npm test`: resolver tests, render tests, every state × nav × styling combination leaves no `{{`,
  forbidden-identifier audit (no `redux` in a zustand build, no `expo-router` in bare), GUI token tests.
- `--build`: `npm install` → `tsc --noEmit` → `eslint` → `jest`. `--build=native` adds
  `pod install` + `xcodebuild -sdk iphonesimulator` and `gradlew assembleDebug`.
- `npm run matrix`: all-pairs over the option groups (~15 projects), real builds, retry once.
- CI: unit on ubuntu/macos/windows; one real JS build; one native build on macos.

## 9. Decisions

- **2026-10-17 — Default workflow is `bare`**, matching the architecture template. `expo` stays a
  first-class option (`--workflow=expo`, "Expo app" preset).

Open:
1. Does `--open` launch VS Code, Xcode, or `npx react-native run-ios`?
2. Include a Maestro flow runner in capture, or keep capture manual per screen?
