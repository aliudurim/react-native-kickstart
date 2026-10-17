---
name: store-assets
description: Generate App Store and Play Store screenshots, icons and the fastlane metadata tree for a kickstarted app. Use when the user asks for store screenshots, app icons, listing assets or "prepare the store".
argument-hint: "[app folder]"
---

The app was created with react-native-kickstart and has a `store/` folder: `store/config.json` (screens, headlines, sizes, locales) and `store/screenshots/` (raw captures per locale).

1. Read `store/config.json`. Each screen needs a headline and a raw capture per locale. For missing captures, run `rn-kickstart-store capture --platform=ios` or `--platform=android` against a booted simulator or emulator (it captures every screen listed in the config), or ask the user to place their own captures in the locale folder.
2. Headlines are copy, not labels: one benefit per screen, under 40 characters, in the user's language. Draft them, show the list once, then save them into `store/config.json`.
3. `rn-kickstart-store render` writes `fastlane/screenshots/` and `fastlane/metadata/` for every size the config ticks. `rn-kickstart-store icons` builds the iOS and Android icon sets from the master icon the config names.
4. Report what is now in `fastlane/` and anything still empty. Rendering needs headless Chrome; if the command reports it missing, relay the install hint it prints.

Nothing here needs an extra dependency; do not suggest installing image libraries.
