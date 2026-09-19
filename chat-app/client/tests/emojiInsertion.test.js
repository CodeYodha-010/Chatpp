import { test } from 'node:test';
import assert from 'node:assert/strict';
import { insertEmoji, MESSAGE_LIMIT } from '../src/chat/emojiInsertion.mjs';

// Pure logic tests for the composer's emoji insertion — no DOM, no browser,
// no server. Uses Node's built-in runner to match server/tests/.
// Mirrors the server's 5,000 UTF-16 code-unit message limit (server/index.js).
//
// Emoji are written as \u{...} escapes on purpose: these assertions are about
// code units, and escapes make the counts visible (and survive any editor that
// would otherwise mangle an invisible zero-width joiner).

const PARTY = '\u{1F389}';                    // 🎉  2 code units
const GRIN = '\u{1F600}';                     // 😀  2
const GLOBE = '\u{1F30D}';                    // 🌍  2
const SUN = '\u{1F31E}';                      // 🌞  2
const CLAP = '\u{1F44F}';                     // 👏  2
const FIRE = '\u{1F525}';                     // 🔥  2
const SPARKLES = '\u2728';                    // ✨  1 (BMP)
const ASTRO = '\u{1F9D1}\u200D\u{1F680}';     // 🧑‍ 2 + ZWJ + 2 = 5

test('emoji insertion', async (t) => {
  await t.test('limit matches the server message limit', () => {
    assert.equal(MESSAGE_LIMIT, 5000);
  });

  await t.test('appends at the end and returns the caret after the emoji', () => {
    const r = insertEmoji('hello', PARTY, 5, 5);
    assert.equal(r.value, `hello${PARTY}`);
    assert.equal(r.cursor, 7);
  });

  await t.test('inserts at the caret instead of appending', () => {
    const r = insertEmoji('helloworld', GRIN, 5, 5);
    assert.equal(r.value, `hello${GRIN}world`);
    assert.equal(r.cursor, 7);
  });

  await t.test('inserts at position 0', () => {
    const r = insertEmoji('world', GLOBE, 0, 0);
    assert.equal(r.value, `${GLOBE}world`);
    assert.equal(r.cursor, 2);
  });

  await t.test('replaces the selected range', () => {
    const r = insertEmoji('good morning', SUN, 0, 4);
    assert.equal(r.value, `${SUN} morning`);
    assert.equal(r.cursor, 2);
  });

  await t.test('handles an empty draft', () => {
    const r = insertEmoji('', PARTY, null, null);
    assert.equal(r.value, PARTY);
    assert.equal(r.cursor, 2);
  });

  await t.test('keeps a neighbouring surrogate pair intact when the caret sits inside it', () => {
    const r = insertEmoji(`a${PARTY}b`, CLAP, 2, 2);
    assert.equal(r.value, `a${CLAP}${PARTY}b`);
    assert.equal(r.cursor, 3);
  });

  await t.test('lands the caret after a ZWJ emoji that spans several code units', () => {
    const r = insertEmoji('crew', ASTRO, 4, 4);
    assert.equal(r.value, `crew${ASTRO}`);
    assert.equal(r.cursor, 9);
  });

  await t.test('uses the value length when no caret was recorded', () => {
    const r = insertEmoji('hi', SPARKLES, null, null);
    assert.equal(r.value, `hi${SPARKLES}`);
    assert.equal(r.cursor, 3);
  });

  await t.test('clamps a caret that is past the end of the draft', () => {
    const r = insertEmoji('abc', FIRE, 99, 99);
    assert.equal(r.value, `abc${FIRE}`);
    assert.equal(r.cursor, 5);
  });

  await t.test('ignores a backwards selection instead of throwing', () => {
    const r = insertEmoji('abc', FIRE, 3, 1);
    assert.equal(r.value, `abc${FIRE}`);
    assert.equal(r.cursor, 5);
  });

  await t.test('allows an insert that lands exactly on the limit', () => {
    const r = insertEmoji('x'.repeat(MESSAGE_LIMIT - 2), PARTY, null, null);
    assert.notEqual(r, null);
    assert.equal(r.value.length, MESSAGE_LIMIT);
    assert.equal(r.cursor, MESSAGE_LIMIT);
  });

  await t.test('refuses an insert that would exceed the server limit', () => {
    const r = insertEmoji('x'.repeat(MESSAGE_LIMIT), PARTY, MESSAGE_LIMIT, MESSAGE_LIMIT);
    assert.equal(r, null);
  });
});