import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const scheduler = await readFile(
  new URL('../../supabase/functions/talkx-scheduler/index.ts', import.meta.url),
  'utf8',
);

test('Talk X scheduler counts only explicitly accepted send starts', () => {
  assert.match(scheduler, /const result = await response\.json\(\)\.catch\(\(\) => null\)/);
  assert.match(scheduler, /const accepted = response\.ok[\s\S]*result as \{ success\?: unknown \}\)\.success === true/);
  assert.match(scheduler, /success: accepted/);
  assert.match(scheduler, /Scheduled campaign was not accepted/);
  assert.doesNotMatch(scheduler, /success:\s*response\.ok/);
});
