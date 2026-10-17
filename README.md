# react-native-kickstart

**Pulls the latest compatible React Native dependencies and kickstarts a project in seconds.**

- Looks up the current stable version of every library live from npm. No copying numbers out of blog posts.
- Caps React Native to what your installed Xcode can build, and checks Node, JDK, NDK and CocoaPods floors.
- Pairs packages that must move together (reanimated ↔ worklets, zod ↔ resolvers ↔ react-hook-form, NativeWind 4 ↔ Tailwind 3, mmkv ↔ nitro) from their own compatibility data.
- Writes a real app, not an empty folder: login → home, three environments, Redux Toolkit or Zustand, MMKV persistence, i18n, jest stubs for every native module, Maestro flows, CI, CLAUDE.md.
- Verifies it: `--build` runs install → `tsc --noEmit` → `eslint` → `jest`.
- Zero npm dependencies. Node 22+ built-ins only.

## Install

```bash
git clone <this repo>
cd react-native-kickstart
npm link
```

## Use it

```bash
rn-kickstart                       # one question at a time
rn-kickstart --yes --build         # defaults, then verify
rn-kickstart --yes --dry-run       # show the versions you would get, write nothing
rn-kickstart --yes --offline       # last known-good versions, no network
```

| Flag | Choices | Default |
|---|---|---|
| `--name` / `--package` | app name / bundle id | `MyApp` / `com.example.<name>` |
| `--preset` | `standard` · `expo` · `minimal` | — |
| `--workflow` | `bare` · `expo` | `bare` |
| `--state` | `rtk` · `zustand` · `none` | `rtk` |
| `--data` | `rtk-query` · `tanstack-query` · `fetch` | follows state |
| `--nav` | `react-navigation` · `expo-router` | `react-navigation` |
| `--styling` | `nativewind` · `unistyles` · `stylesheet` | `nativewind` |
| `--storage` | `mmkv` · `async-storage` · `none` | `mmkv` |
| `--forms` | `rhf-zod` · `none` | `rhf-zod` |
| `--i18n` | `i18next` · `none` | `i18next` |
| `--lists` | `flash-list` · `flatlist` | `flash-list` |
| `--modules` | `crash,analytics,roles,media,push` | `crash,analytics` |
| `--addons` | `bottom-sheet,lottie,webview,share,keychain,netinfo,…` (`--list-libs` shows all 20) | none |
| `--sample` / `--store` | `yes` · `no` | `yes` |
| `--pm` | `pnpm` · `yarn` · `bun` · `npm` | first one found |
| `--rn` | cap, e.g. `0.87` | from your Xcode |

Add `--build` (or `--build=native` for `pod install` + `xcodebuild` + `gradlew`), `--open` for VS Code, `--force` to write into a non-empty folder.

## How versions are chosen

```
npm latest stable  →  Expo bundledNativeModules / rnx-kit profile  →  peerDependencies + compatibility.json  →  reactnative.directory  →  pinned.json
```

Pre-releases are filtered by semver, `deprecated` versions are skipped, ceilings and floors come from `data/catalog.json`, hand-verified toolchain rows from `data/compat.json`. Where no machine-readable source exists the tool warns instead of guessing; the build settles it.

## Tests

```bash
npm test        # unit tests + template audit, instant
npm run pin     # refresh data/pinned.json from the network
```

Design notes live in `docs/`.
