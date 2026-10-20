import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../src/hooks/integrations/useTalkXTemplates.ts', import.meta.url),
  'utf8',
);
const component = readFileSync(
  new URL('../../src/components/talkx/TalkXTemplateEditor.tsx', import.meta.url),
  'utf8',
);
const e86Trigger = readFileSync(
  new URL('../../supabase/migrations/20260916130000_talkx_e86_rpcs_indexes_trigger.sql', import.meta.url),
  'utf8',
);

const updateMutation = source.slice(
  source.indexOf('const updateTemplate = useMutation'),
  source.indexOf('const deleteTemplate = useMutation'),
);

test('Talk X editor updates only through the atomic snapshot RPC', () => {
  assert.match(updateMutation, /rpc\(\s*'update_talkx_template_with_snapshot'/);
  assert.match(updateMutation, /p_expected_updated_at:\s*expectedUpdatedAt/);
  assert.match(updateMutation, /p_description:\s*next\.description/);
  assert.match(updateMutation, /p_media_url:\s*next\.media_url/);
  assert.match(updateMutation, /p_media_type:\s*next\.media_type/);
  assert.doesNotMatch(updateMutation, /p_(?:description|media_url|media_type):[^\n]*\?\?\s*['"]{2}/);
  assert.match(updateMutation, /updated_at:\s*persisted\.updated_at/);
  assert.match(updateMutation, /templateUpdateErrorMessage\(error\)/);
  assert.doesNotMatch(updateMutation, /fromTable\('talkx_templates'\)\.update/);
  assert.match(component, /useState<string \| null>\(editing\?\.updated_at/);
  assert.match(component, /expectedUpdatedAt,\s*\.\.\.payload/);
  assert.match(component, /setExpectedUpdatedAt\(t\.updated_at\)/);
  assert.doesNotMatch(component, /saveVersionSnapshot/);
  assert.match(component, /!\/\^https:\\\/\\\/\/i\.test\(eMediaUrl\)/);
  assert.doesNotMatch(component, /\^https\?:\\\/\\\//);
});

test('Talk X update errors are localized without exposing database messages', () => {
  assert.match(source, /talkx_template_stale_version[\s\S]*alterado por outra pessoa[\s\S]*Recarregue/);
  assert.match(source, /talkx_template_not_authorized[\s\S]*não tem permissão/);
  assert.match(source, /invalid_talkx_template[\s\S]*dados inválidos/);
  assert.doesNotMatch(updateMutation, /e\.message/);
});

test('Talk X usage counter is incremented atomically by trigger E86 (no front RPC/UPDATE)', () => {
  assert.match(e86Trigger, /trg_talkx_increment_template_use_count/);
  assert.match(e86Trigger, /use_count = COALESCE\(use_count, 0\) \+ 1/);
  assert.doesNotMatch(source, /rpc\('increment_talkx_template_use'/);
  assert.doesNotMatch(source, /fromTable\('talkx_templates'\)\.update/);
});
