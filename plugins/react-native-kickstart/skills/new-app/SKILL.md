---
name: new-app
description: Create a new React Native or Expo app with the kickstart CLI. Use when the user wants to start, scaffold, bootstrap or set up a new mobile app, or says "new RN app", "create an Expo app", "kickstart".
argument-hint: "[app name and what it needs, in plain words]"
---

Turn the user's description into a finished, verified app. Never make the user type flags.

## 1. Collect the answers

Read the available options once:

```bash
npx -y -p github:aliudurim/react-native-kickstart rn-kickstart --options
```

(If `rn-kickstart` is on PATH or this repo is checked out, use `rn-kickstart --options` / `node bin/kickstart.mjs --options` instead. Use the same command prefix for every step below.)

Map the request onto the catalog. Defaults when the user does not say otherwise:

- `workflow: bare` (matches most client projects). Pick `expo` only when the user asks for Expo, wants expo-router, or has no Mac for iOS.
- `preset: standard` for bare, `expo` for Expo, `minimal` when they say empty/minimal/shell.
- Add-ons: only what they named or clearly need (payments ⇒ nothing here; "camera" ⇒ `vision-camera`; "login with biometrics" ⇒ `keychain` + `permissions`). On Expo some add-ons map to Expo packages or are unavailable; the `addons[].expo` field says which.
- Bundle id: ask only if they have a company domain in mind; otherwise `com.<company-or-user>.<app>` and say what you chose.
- Folder: `./<app-slug>` under the current directory unless they name one.

Ask at most one short question, and only when the answer changes the stack (bare vs Expo, or which company domain). Everything else: choose and state the choice.

## 2. Run

Pass the answers inline as JSON (no file to create or clean up):

```bash
npx -y -p github:aliudurim/react-native-kickstart rn-kickstart --yes --json --answers='{"name":"Orders","package":"com.acme.orders","preset":"standard","addons":["bottom-sheet","keychain"],"out":"./orders","pm":"npm","build":true}'
```

`out` may be absolute when the user named a folder. `build: true` installs and runs typecheck + lint + jest + a Metro bundle check; `build: "native"` also runs CocoaPods/Xcode and Gradle (slow, use when they ask to "make sure it builds"). Run it in the foreground; it takes one to four minutes.

stdout is one JSON line; the human log is on stderr. Read `ok`, `warnings`, `toolchainWarnings`, `build.skipped` and `next`.

## 3. Report

In five lines or fewer: the folder, the stack in words (not package names), each `toolchainWarnings` entry as a to-do with its install hint, and the `next` command verbatim (on bare it already includes `pods`, which both platforms' native add-ons need). If `build.skipped` has entries, say which platform was skipped and why. If `ok` is false, show `error` and fix the answers rather than asking the user to.

Then open the generated `CLAUDE.md` in the new folder and keep following it for any further work in that project: folder layout, env files (`.env.development` / `.env.production`), the splash logo at `assets/logo.png`, and `npm run verify` before claiming anything works.
