import { catalog } from './resolver/index.mjs';

// Native modules get exact pins; JS-only get carets (or the artifact's own range prefix).
export function specFor(key, version) {
  const art = catalog.artifacts[key];
  if (art.native) return version;
  return `${art.range ?? '^'}${version}`;
}

export function buildPackageJson({ name, slug, keys, versions, choices, row, pm }) {
  const deps = {};
  const dev = {};
  for (const key of keys) {
    const art = catalog.artifacts[key];
    const v = versions[key];
    if (!art || !v) continue;
    (art.dev ? dev : deps)[art.pkg] = specFor(key, v);
  }
  const expo = choices.workflow === 'expo';
  const scripts = expo
    ? { start: 'expo start', android: 'expo run:android', ios: 'expo run:ios', prebuild: 'expo prebuild', 'bundle:check': 'expo export --platform android --output-dir build/bundle-check --clear' }
    : { start: 'react-native start', android: 'react-native run-android --mode devDebug', 'android:prod': 'react-native run-android --mode prodRelease', ios: 'react-native run-ios', 'ios:prod': 'react-native run-ios --mode Release', pods: 'cd ios && bundle exec pod install', 'bundle:check': 'react-native bundle --platform android --dev false --entry-file index.js --bundle-output build/bundle-check.js --assets-dest build/bundle-check-assets --reset-cache', splash: 'react-native-bootsplash generate assets/logo.png --platforms=android,ios --background=0E7C6B --logo-width=100', postinstall: 'npm run splash' };
  Object.assign(scripts, {
    typecheck: 'tsc --noEmit',
    lint: 'eslint .',
    test: 'jest',
    verify: `${pm === 'npm' ? 'npm run' : pm + ' run'} typecheck && ${pm === 'npm' ? 'npm run' : pm + ' run'} lint && ${pm === 'npm' ? 'npm run' : pm + ' run'} test`,
    'store:shots': 'rn-kickstart-store render',
  });
  const out = {
    name: slug,
    version: '0.0.1',
    private: true,
    scripts,
    dependencies: sortKeys(deps),
    devDependencies: sortKeys(dev),
    engines: { node: `>=${row?.node ?? '22'}` },
  };
  if (expo) out.main = choices.nav === 'expo-router' ? 'expo-router/entry' : 'index.js';
  return out;
}

const sortKeys = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
