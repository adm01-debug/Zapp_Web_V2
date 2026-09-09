import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../src/hooks/integrations/useTalkXTemplates.ts', import.meta.url),
  'utf8',
);

const updateMutation = source.slice(
  source.indexOf('const updateTemplate = useMutation'),
  source.indexOf('const deleteTemplate = useMutation'),
);

test('Talk X editor updates only through the atomic snapshot RPC', () => {
  assert.match(updateMutation, /rpc\('update_talkx_template_with_snapshot'/);
  assert.match(updateMutation, /p_expected_updated_at:\s*current\.updated_at/);
  assert.match(updateMutation, /updated_at:\s*persisted\.updated_at/);
  assert.doesNotMatch(updateMutation, /fromTable\('talkx_templates'\)\.update/);
});
