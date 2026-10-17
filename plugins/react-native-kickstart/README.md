# react-native-kickstart plugin for Claude Code

Create and work on React Native / Expo apps by describing them. Nothing to clone, no flags to learn.

```text
/plugin marketplace add aliudurim/react-native-kickstart
/plugin install react-native-kickstart@rn-kickstart
```

Then, in an empty folder:

```text
/react-native-kickstart:new-app Orders, bare RN, bottom sheet and keychain, company acme
```

What you get:

| piece | what it does |
|---|---|
| `/new-app` skill | maps your words to the kickstart options, writes an answers file, runs the CLI with `--json`, reports warnings with install hints |
| `/store-assets` skill | captures screenshots, writes headlines, renders every store size and icons into `fastlane/` |
| `rn-architect` agent | plans or reviews changes against the generated project's `CLAUDE.md` conventions |
| `RN Kickstart` output style | team mode: reads `CLAUDE.md` first, names the layer it touches, verifies after every change. Turn on with `/output-style RN Kickstart`, or set `"outputStyle": "RN Kickstart"` in the project's `.claude/settings.json` |

The CLI runs through `npx` from this repository, so Node 22+ is the only requirement. Everything else (Xcode, Android Studio, CocoaPods, Chrome) is optional and reported with an install hint when missing.
