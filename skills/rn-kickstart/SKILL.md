---
name: rn-kickstart
description: Scaffold a new React Native or Expo app wired to the latest compatible library versions (React Native, Expo, Redux Toolkit or Zustand, NativeWind or Unistyles, MMKV, react-hook-form + zod, i18next, FlashList), resolved live from npm and verified with install + typecheck + lint + jest. Use when the user asks for a new React Native app, a new RN project, an Expo app, a project skeleton or boilerplate, or "the latest React Native versions".
---

# rn-kickstart

A standalone Node 22 CLI does all the work. It needs no AI: it resolves versions over HTTP
(npm, Expo's bundledNativeModules, rnx-kit profiles, peerDependencies), renders templates, and
verifies the result with a real install + `tsc` + `eslint` + `jest`. Your job is to collect the
choices and run it. Do **not** hand-write `package.json`, do **not** invent or "remember"
version numbers, and do **not** pick libraries the user did not ask for.

## Run it

Three ways, in order of preference:

1. Installed (`git clone`, then `npm link` inside the clone), the command is on PATH:

   ```bash
   rn-kickstart --yes --build \
     --name=MyApp --package=com.example.myapp \
     --workflow=bare --state=rtk --styling=nativewind \
     --out=./MyApp
   ```

2. A checkout exists but the command is not linked. The tool has zero npm dependencies, so a
   clone runs as-is:

   ```bash
   node /path/to/react-native-kickstart/bin/kickstart.mjs --yes --build ...
   ```

3. Neither is available. Have the user install it first:

   ```bash
   git clone <react-native-kickstart repo> && cd react-native-kickstart && npm link
   ```

## Flags

Ask the user for anything not already stated (at minimum: app name, bundle id, workflow,
state), then pass it as flags. `--help` prints the same list.

| Flag | Options | Default |
|---|---|---|
| `--name` | app name, letters and digits, starts with a letter | `MyApp` |
| `--package` | bundle id / applicationId | `com.example.<name>` |
| `--out` | destination directory | `./<name-slug>` |
| `--preset` | `standard` · `expo` · `minimal` (a bundle of the flags below) | none |
| `--workflow` | `bare` · `expo` | `bare` |
| `--state` | `rtk` · `zustand` · `none` | `rtk` |
| `--data` | `rtk-query` · `tanstack-query` · `fetch` | follows `--state` |
| `--nav` | `react-navigation` · `expo-router` (`expo-router` needs `--workflow=expo`) | `react-navigation` |
| `--styling` | `nativewind` · `unistyles` · `stylesheet` | `nativewind` |
| `--storage` | `mmkv` · `async-storage` · `none` | `mmkv` |
| `--forms` | `rhf-zod` · `none` | `rhf-zod` |
| `--i18n` | `i18next` · `none` | `i18next` |
| `--lists` | `flash-list` · `flatlist` | `flash-list` |
| `--sample` | `yes` · `no` — login → home sample screens and tests | `yes` |
| `--store` | `yes` · `no` — store-assets config + fastlane tree | `yes` |
| `--addons=bottom-sheet,lottie,…` optional libraries (20 ids, see `rn-kickstart --list-libs`); `--modules` | comma list of `crash`, `analytics`, `roles`, `media`, `push` | `crash,analytics` |
| `--pm` | `pnpm` · `yarn` · `bun` · `npm` | first one found |
| `--rn` | cap React Native to a minor, e.g. `0.87` | from the installed Xcode |

Other flags: `--build` (install + `tsc --noEmit` + `eslint` + `jest`; `--build=native` adds
`pod install` + `xcodebuild` + `gradlew assembleDebug`), `--dry-run` (print the resolved
versions, write nothing), `--offline` (use the pinned known-good set in `data/pinned.json`
instead of the network), `--force` (write into a non-empty directory), `--open` (open in
VS Code), `--list-libs`, `--info=<choice>` (summary + trade-off of one option), `--version`.

Omit `--yes` for interactive prompts. Presets: `standard` = all defaults; `expo` = expo +
expo-router + zustand + tanstack-query; `minimal` = no state, plain fetch, StyleSheet, no
storage/forms/i18n/sample/store.

## Rules

- **Always pass `--yes --build`** unless the user says otherwise. A resolved set of "latest"
  versions is a hypothesis; only the install + typecheck + lint + jest run proves it composes.
- To only show which versions the user would get, without writing anything:
  `rn-kickstart --dry-run --yes` (add the same flags they would use).
- If version resolution fails because the network is down or npm is unreachable, re-run with
  `--offline` to use the last known-good pinned set, and tell the user the set is pinned, not live.
- If the build fails, read the **first** error line of the output (`error TS…`, an eslint rule
  id, a jest `FAIL`, or `npm ERR!`). Report which package broke and why; do not patch the
  generated `package.json` by hand to make it pass.
- **Never edit `data/pinned.json` by hand.** Refresh it with `npm run pin` inside the tool's
  checkout while online.
- There is also a browser GUI, `rn-kickstart-gui`. Suggest it only when the user would rather
  click through options than answer questions.
- After a successful run, tell the user the next step exactly as:
  `cd <out dir> && <pm> run ios` (or `<pm> run android`). The CLI prints the resolved `<pm>`.

## What it generates

A TypeScript app, not an empty folder: login → home vertical slice through the chosen state
layer, three environments, MMKV (or AsyncStorage) persistence, i18n, jest stubs for every
native module, Maestro smoke flows, a GitHub Actions CI gate (`tsc` + `eslint` + `jest`), a
`CLAUDE.md` describing the stack, and, with `--store=yes`, a `store/` folder for the
store-assets pipeline (see the `store-shots` skill). It compiles and runs as-is; replace the
sample slice with real features.
