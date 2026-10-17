import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render } from '../src/render.mjs';

test('substitutes variables and dotted paths', () => {
  assert.equal(render('hi {{name}} v{{v.rn}}', { name: 'x', v: { rn: '0.88.0' } }), 'hi x v0.88.0');
});

test('if / else / unless are line based', () => {
  const t = ['a', '{{#if hilt}}', 'H', '{{else}}', 'N', '{{/if}}', '{{#unless hilt}}', 'U', '{{/unless}}', 'z'].join('\n');
  assert.equal(render(t, { hilt: true }), 'a\nH\nz');
  assert.equal(render(t, { hilt: false }), 'a\nN\nU\nz');
});

test('nested blocks and blank-line collapse', () => {
  const t = ['{{#if a}}', '{{#if b}}', 'ab', '{{/if}}', '{{/if}}', '', '', '', 'end'].join('\n');
  assert.equal(render(t, { a: true, b: false }), '\n\nend');
});

test('throws on unbalanced tags and undefined vars', () => {
  assert.throws(() => render('{{#if a}}\nx', { a: true }), /unclosed/);
  assert.throws(() => render('x\n{{/if}}', {}), /unbalanced/);
  assert.throws(() => render('{{nope}}', {}), /undefined/);
});
