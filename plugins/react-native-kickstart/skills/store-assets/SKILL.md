---
name: store-assets
description: Generate App Store and Play Store screenshots, icons and the fastlane metadata tree for a kickstarted app. Use when the user asks for store screenshots, app icons, listing assets or "prepare the store".
argument-hint: "[app folder]"
allowed-tools: Bash(npx *) Bash(node *) Bash(npm *) Bash(rn-kickstart-store *) Read Write Glob
---

The app was created with react-native-kickstart and has a `store/` folder (`store/config.json`, `store/screens/`, `store/screenshots/`).

1. Read `store/config.json`. Each screen needs a headline and a raw screenshot per locale. Missing screenshots: capture them from a booted iOS Simulator or Android emulator with `rn-kickstart-store capture --platform=ios|android --screen=<id>`, or ask the user to drop PNGs into `store/screenshots/<locale>/`.
2. Headlines are copy, not labels: one benefit per screen, under 40 characters, in the user's language. Draft them, show the list once, then write them into `store/config.json`.
3. Render: `rn-kickstart-store render` writes `fastlane/screenshots/` and `fastlane/metadata/` with every required size for the stores ticked in the config. Icons: `rn-kickstart-store icons --from=store/icon.png` (1024×1024 PNG; fall back to `assets/logo.png` if there is no store icon yet).
4. Report what is in `fastlane/` and anything still empty. Headless Chrome is required for rendering; if the command says it is missing, give the install hint it prints.

Zero extra dependencies are involved; do not suggest installing image libraries.
