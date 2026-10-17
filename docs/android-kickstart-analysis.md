# android-kickstart — analysis

Source: https://github.com/vypong/android-kickstart (MIT, ~111 files, analysed 2026-10-16)

## What it is

A zero-dependency Node 18+ (ESM) scaffolder. It resolves the newest **stable** version of every library live from Maven, caps the Android Gradle Plugin to the Android Studio you have installed, writes a real app (login → home, DI, tests) and optionally runs a Gradle build to prove the versions work together.

Three entry points that share the same JSON data:

| Bin | Purpose |
|---|---|
| `android-kickstart` | CLI: interactive prompts (TTY) or flags (`--yes`) |
| `android-kickstart-gui` | Local web UI: `node:http` server + one vanilla HTML file |
| `android-versions` | Version resolver only (`--pin`, `--print-toml`) |

Plus a **Claude Code plugin** (`.claude-plugin/` + `skills/android-kickstart/SKILL.md`). It tells Claude to drive the CLI and never hand-write build files or invent versions.

## Architecture

```
bin/kickstart.mjs    CLI: hand-rolled flags, readline prompts, validation, dry-run, --build
bin/gui.mjs          GUI server: token + loopback guard, SSE /api/create, native folder picker
bin/resolve.mjs      standalone resolver
src/resolver.mjs     Maven metadata fetch, stable filter, numeric compare, ceilings, compat lookups
src/scaffold.mjs     buildContext (choices → booleans), STATIC_FILES + KT_FILES map, env detection
src/render.mjs       52-line Handlebars subset: {{var}}, {{#if}}/{{else}}/{{#unless}}, line-based
src/toml.mjs         generates libs.versions.toml in code (BOMs, bundles, plugins)
src/guard.mjs        GUI security: Host loopback check, constant-time token compare
src/info.mjs         --info / library descriptions
src/color.mjs        TTY-aware ANSI colours (NO_COLOR / FORCE_COLOR)
templates/           *.tmpl files (kt/, app/, sq/, gradle/)
vendor/              gradlew + wrapper jar copied verbatim
```

### Data files

| File | Holds | Maintained |
|---|---|---|
| `catalog.json` | `artifacts` (repo, group, artifact, pluginId, stablePattern, derivedFrom) + `profiles` (base, ui, di/network/db/prefs/image → artifact keys) | by hand |
| `libraries.json` | option → name, vendor, logo, summary, tradeoff, links (shared by CLI `--info` and GUI popovers) | by hand |
| `compat.json` | `studio[]` (build → agpMax) and `agp[]` (minGradle, minJdk, maxCompileSdk) | by hand, from developer.android.com |
| `pinned.json` | last known-good versions: the offline fallback, also used per artifact when a lookup fails | `npm run pin` |
| `android-api-levels.json` | API levels + EOL dates | `npm run api-levels` (endoflife.date) |

## Version resolution: the core idea

- Reads every `<version>` in `maven-metadata.xml` and **ignores `<release>`/`<latest>`**, which can point at RCs.
- Stable means `^\d+(\.\d+)*$`. Each artifact can override this with its own `stablePattern`.
- Compares versions numerically segment by segment. One comparator handles both SemVer and CalVer (Compose BOM `2026.08.00`).
- **Ceilings:** AGP is capped to the detected Studio's `agpMax`, and compileSdk is capped by the AGP row.
- **Derived versions:** e.g. the compose compiler and serialization plugin track `kotlin`.
- Fetches 8 at a time with a 15s timeout. There is **no cache**.
- Some pairings have no machine-readable source (AGP→Gradle→JDK floors, Kotlin↔KSP). For those it **warns instead of guessing**, and the real build is the final check.

## Template system

- **File selection:** `KT_FILES` entries `[tmpl, dest, conditionFlag, sourceSet]`. Alternate templates can map to the same destination, e.g. Room vs SQLDelight repo, full vs minimal AppRoot.
- **Inline conditionals** cover imports, constructors and DI annotations (`{{#if hilt}} @HiltViewModel …`).
- `buildContext()` turns the choices into flags: `hilt/koin/noDi`, `room/sqldelight/store`, `retrofit/ktor/network`, `coil/glide/image`, `sample/noSample/sampleStore`, `agpBuiltInKotlin`, and so on.

### Generated app (sample = yes)

- **domain/**: `User`, `Item`, `AuthRepository`, `ItemRepository`. Pure interfaces.
- **data/**: `DefaultAuthRepository` (a stub sign-in, clearly marked), DataStore `SessionDataSource`, Room or SQLDelight, plus Retrofit or Ktor `ApiClient`.
- **ui/**:
  - Login screen with validation and error states, and a Home screen.
  - Each screen is split into a stateful `XScreen` and a stateless `XContent` with previews.
  - `@Immutable` UiState, and `StateFlow` with `stateIn(WhileSubscribed(5000))`.
  - Type-safe routes; `AppRoot` picks the start destination from the session.
- **di/**: Hilt modules, a Koin module or a `ServiceLocator`.
- **test/**: hand-written fakes (no mocking library), a `MainDispatcherRule` and ViewModel tests.

## Quality gates

- **`npm test`** (node:test, zero deps):
  - Resolver unit tests.
  - Render-engine tests.
  - Every di×network×db combination leaves no `{{`.
  - Hostile names are rejected.
  - GUI checks: token enforcement and preset validity.
- **`audit_templates.mjs`:** scaffolds 7 configurations and fails if a forbidden identifier leaks in, e.g. `ItemDao` in a build with no database.
- **`npm run matrix`:** all-pairs reduction of 324 combinations down to 13 real Gradle builds. It also fails on Kotlin warnings and retries flaky builds once.
- **CI:** unit tests and an offline generate on ubuntu, macOS and Windows, plus one real build on ubuntu. There is **no cron**: pinning and the matrix are run by hand.

## Issues found (don't copy these)

1. `templates/build.gradle.kts.tmpl:17` uses `{{#if serialization}}`, but `buildContext` never sets `serialization`. The root `apply false` line is never emitted.
2. `--open` is documented for the CLI, but `bin/kickstart.mjs` never calls `openInStudio`. Only the GUI does.
3. `tools/write_templates*.py` are stale: 12 of 36 templates were hand-edited after generation, so re-running them would overwrite the current templates.
4. In `test/templates.test.mjs`, the DB array is `['room','datastore','none']`. `datastore` is a prefs option, so SQLDelight never gets tested.
5. `npm run matrix:quick` passes `--quick`, but `matrix.mjs` never reads it.
6. `bin/resolve.mjs --pin` drops `compileSdk`/`buildTools` and ignores the prefs and image profiles.
7. Several context flags are never used: `prefsHilt`, `prefsKoin`, `prefsNoDi`, `notSqldelight`, `noStore`. `versionStyle: "calver"` is never read either.

## Mapping to a React Native kickstart

| Android concept | RN equivalent |
|---|---|
| Maven metadata + stable filter | npm registry `dist-tags` + full `versions` list (beware `next`/`canary`/`rc`) |
| Studio → AGP cap | **Expo SDK → compatible versions** (`expo install` / `bundledNativeModules.json`), or the RN version → React / Hermes / Xcode / NDK / JDK floors |
| compat.json | RN ↔ React ↔ Expo SDK ↔ Node ↔ Xcode ↔ CocoaPods ↔ JDK ↔ minSdk/iOS deployment target |
| `--build` (Gradle) | `tsc --noEmit` + `jest` + `expo prebuild` / `expo export`, optional `gradlew assembleDebug` / `xcodebuild` |
| DI choice (hilt/koin/none) | State: Zustand / Redux Toolkit / Jotai / none |
| network (retrofit/ktor) | TanStack Query + fetch / axios / RTK Query |
| db (room/sqldelight) | expo-sqlite + Drizzle / WatermelonDB / op-sqlite / MMKV |
| prefs (DataStore) | MMKV / AsyncStorage / expo-secure-store (tokens) |
| image (coil/glide) | expo-image / FastImage |
| navigation (Compose Nav) | Expo Router / React Navigation |
| UI (Compose + M3) | NativeWind / Tamagui / Unistyles / StyleSheet |
| Studio / SDK / JDK detection | Node, package manager, Xcode, CocoaPods, Android SDK, JDK, Watchman, simulators |
| `openInStudio` | `npx expo start`, open the iOS Simulator / Android emulator, open in VS Code |
| version catalog TOML | `package.json` with exact pins + lockfile |

What carries over directly:
- Zero-dependency Node design.
- The shared JSON data driving CLI, GUI and Claude skill.
- The line-based template engine and the file map with conditions.
- The forbidden-identifier audit.
- The all-pairs build matrix.
- `pinned.json` as the offline fallback.
- The GUI security model (loopback Host check + per-run token).
- The "warn, don't guess" rule.
