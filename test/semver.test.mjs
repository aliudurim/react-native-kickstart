import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare, isStable, satisfies, underCeiling, newestSatisfying, minorOf } from '../src/semver.mjs';

test('compare is numeric, not textual', () => {
  assert.ok(compare('2.8.10', '2.8.4') > 0);
  assert.ok(compare('0.88.0', '0.9.0') > 0);
  assert.equal(compare('1.0.0', '1.0.0'), 0);
});

test('prereleases sort below the release', () => {
  assert.ok(compare('0.88.0-rc.6', '0.88.0') < 0);
  assert.ok(compare('0.88.0-rc.6', '0.88.0-rc.4') > 0);
  assert.ok(compare('0.89.0-nightly-20261016-abc', '0.88.0') > 0);
});

test('isStable rejects rc, beta, canary, nightly', () => {
  for (const v of ['0.88.0-rc.6', '5.0.0-rc.0', '1.0.0-beta10', '0.89.0-nightly-20261016-x', '58.0.0-canary-20260101'])
    assert.equal(isStable(v), false, v);
  assert.equal(isStable('0.88.0'), true);
  assert.equal(isStable('1.0.0-beta10', '^\\d+\\.\\d+\\.\\d+(-beta\\d+)?$'), true);
});

test('ceiling is a prefix', () => {
  assert.equal(underCeiling('3.4.19', '3'), true);
  assert.equal(underCeiling('4.0.0', '3'), false);
  assert.equal(underCeiling('0.88.3', '0.88'), true);
  assert.equal(underCeiling('0.89.0', '0.88'), false);
});

test('satisfies handles the ranges compatibility data uses', () => {
  assert.equal(satisfies('0.87.1', '0.86 - 0.88'), true);
  assert.equal(satisfies('0.89.0', '0.86 - 0.88'), false);
  assert.equal(satisfies('4.7.3', '4.7.x'), true);
  assert.equal(satisfies('4.8.0', '4.7.x'), false);
  assert.equal(satisfies('3.7.2', '3.6.x - 3.8.x'), true);
  assert.equal(satisfies('4.22.0', '>=4.19 <4.25'), true);
  assert.equal(satisfies('4.25.0', '>=4.19 <4.25'), false);
  assert.equal(satisfies('3.3.5', '~3.3.0'), true);
  assert.equal(satisfies('3.4.0', '~3.3.0'), false);
  assert.equal(satisfies('2.12.0', '^2.8.2'), true);
  assert.equal(satisfies('3.0.0', '^2.8.2'), false);
  assert.equal(satisfies('0.13.2', '0.13.x'), true);
  assert.equal(satisfies('9.9.9', '*'), true);
  assert.equal(satisfies('19.3.0', '>=18.2.0'), true);
  assert.equal(satisfies('1.5.0', '1.5.0 || 1.6.0'), true);
  assert.equal(satisfies('26.4.7', '>= 26.2.0'), true);
  assert.equal(satisfies('19.3.0', '>= 18.2.0'), true);
});

test('newestSatisfying picks the top stable in range', () => {
  const vs = ['4.6.0', '4.7.0', '4.7.1', '4.7.2-rc.0', '4.8.0'];
  assert.equal(newestSatisfying(vs, '4.7.x'), '4.7.1');
  assert.equal(minorOf('0.88.0'), '0.88');
});
