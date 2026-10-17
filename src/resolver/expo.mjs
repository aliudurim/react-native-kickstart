import { fetchJson } from './npm.mjs';

const API = 'https://api.expo.dev/v2';

// Newest non-deprecated SDK, with the RN and React versions Expo pairs it with.
export async function latestSdk() {
  const { data } = await fetchJson(`${API}/versions/latest`);
  const sdks = Object.entries(data.sdkVersions)
    .filter(([, v]) => !v.isDeprecated && !v.beta)
    .sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10));
  const [sdk, info] = sdks.at(-1);
  return {
    sdk,
    expo: info.relatedPackages?.expo ?? null,
    reactNative: info.facebookReactNativeVersion,
    react: info.facebookReactVersion,
    releaseNotes: info.releaseNoteUrl ?? null,
  };
}

// The known-good ranges Expo ships for one SDK: { npmPackage: versionRange }.
export async function bundledNativeModules(sdk) {
  const { data } = await fetchJson(`${API}/sdks/${sdk}/native-modules`);
  return Object.fromEntries(data.map((m) => [m.npmPackage, m.versionRange]));
}
