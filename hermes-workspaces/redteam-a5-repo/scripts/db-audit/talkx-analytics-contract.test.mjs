import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const analytics = await readFile(
  new URL('../../src/components/talkx/TalkXAnalytics.tsx', import.meta.url),
  'utf8',
);

test('Talk X analytics does not manufacture delivery, read, or conversion metrics', () => {
  assert.doesNotMatch(analytics, /stats\.sent\s*\*\s*0\.964/);
  assert.doesNotMatch(analytics, /0\.128/);
  assert.doesNotMatch(analytics, /0\.046/);
  assert.match(analytics, /name: 'Entregues', value: stats\.delivered, reported: true/);
  assert.match(analytics, /name: 'Lidas', value: null, reported: false/);
  assert.match(analytics, /name: 'Conversões', value: null, reported: false/);
  assert.match(analytics, /'Não rastreado'/);
  assert.match(analytics, /outcomeUnknown = filtered\.reduce/);
});
