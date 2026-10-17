# Claude Code plugin

This repository doubles as a Claude Code plugin. `.claude-plugin/plugin.json` is the plugin
manifest and `.claude-plugin/marketplace.json` lets the checkout act as a one-plugin
marketplace, so Claude can install it straight from a local clone.

## Install

```
/plugin marketplace add /path/to/react-native-kickstart
/plugin install react-native-kickstart@react-native-kickstart
```

Then `git clone` + `npm link` once so `rn-kickstart`, `rn-kickstart-gui` and
`rn-kickstart-store` are on PATH. The skills also know how to run `bin/*.mjs` directly from
a checkout if linking was skipped.

## Skills

| Skill | Triggers on | Runs |
|---|---|---|
| `skills/rn-kickstart/SKILL.md` | "new React Native app", "new RN project", "Expo app", "latest React Native versions" | `rn-kickstart --yes --build …` |
| `skills/store-shots/SKILL.md` | store screenshots, App Store / Play images, app icons, fastlane metadata | `rn-kickstart-store init\|capture\|render\|icons\|check` |

Both skills describe the CLI's flags from `bin/kickstart.mjs --help` and the option groups in
`src/context.mjs`. When a flag or group changes, update the table in the skill in the same
commit; the audit does not check the skill against the code.

## Maintenance

- `npm test` — unit tests + template audit (CI runs it on Linux, macOS and Windows).
- `npm run matrix` — all-pairs real builds (~13 projects, ~2 min each); `npm run matrix:quick`
  reuses `node_modules` already in the target dirs. Report at `<out>/matrix-report.json`.
- `npm run logos` / `npm run fonts` — re-vendor `gui/logos` and `gui/fonts` (see `NOTICE.md`).
- `npm run pin` — refresh `data/pinned.json`; never edit it by hand.
