import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProfile } from '../src/resolver/rnxkit.mjs';

test('parseProfile reads capabilities, quoted keys and const references', () => {
  const ts = `
const reactNative: Package = {
  name: "react-native",
  version: "^0.87.0",
  capabilities: ["react"],
};
export const profile: Profile = {
  ...profile_0_86,
  react: {
    name: "react",
    version: "19.2.3",
  },
  "react-dom": {
    name: "react-dom",
    version: "^19.2.3",
    capabilities: ["react"],
  },
  core: reactNative,
  "core-android": reactNative,
  screens: {
    name: "react-native-screens",
    version: ">=4.19 <4.25",
  },
};`;
  const p = parseProfile(ts);
  assert.deepEqual(p.react, { name: 'react', version: '19.2.3' });
  assert.deepEqual(p['react-dom'], { name: 'react-dom', version: '^19.2.3' });
  assert.deepEqual(p.core, { name: 'react-native', version: '^0.87.0' });
  assert.deepEqual(p['core-android'], { name: 'react-native', version: '^0.87.0' });
  assert.equal(p.screens.version, '>=4.19 <4.25');
});
