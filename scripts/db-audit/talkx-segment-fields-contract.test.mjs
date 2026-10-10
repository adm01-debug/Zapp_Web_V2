import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const segmentFieldCatalog = await readFile(
  new URL('../../src/segments/segmentFieldCatalog.ts', import.meta.url),
  'utf8',
);
const segmentRules = await readFile(
  new URL('../../src/segments/segmentRules.ts', import.meta.url),
  'utf8',
);
const useSegmentAudience = await readFile(
  new URL('../../src/hooks/integrations/useSegmentAudience.ts', import.meta.url),
  'utf8',
);
const talkxSegments = await readFile(
  new URL('../../src/components/talkx/TalkXSegments.tsx', import.meta.url),
  'utf8',
);
const talkxBuilder = await readFile(
  new URL('../../src/components/talkx/segments/TalkXSegmentBuilder.tsx', import.meta.url),
  'utf8',
);
const useTalkXSegments = await readFile(
  new URL('../../src/hooks/integrations/useTalkXSegments.ts', import.meta.url),
  'utf8',
);

test('SEGMENT_FIELD_CATALOG exports field definitions', () => {
  assert.match(segmentFieldCatalog, /export const SEGMENT_FIELD_CATALOG/);
  assert.match(segmentFieldCatalog, /SegmentFieldCatalogEntry/);
  assert.match(segmentFieldCatalog, /empresa|contato|tags|ticket_medio|frequencia/);
});

test('segmentRules exports normalizeRules, describeRule, describeRules', () => {
  assert.match(segmentRules, /export function normalizeRules/);
  assert.match(segmentRules, /export function describeRule/);
  assert.match(segmentRules, /export function describeRules/);
  assert.match(segmentRules, /SegmentRulesV2/);
  assert.match(segmentRules, /SegmentRuleV2/);
});

test('useSegmentAudience calls talkx_resolve_audience RPC', () => {
  assert.match(useSegmentAudience, /talkx_resolve_audience/);
  assert.match(useSegmentAudience, /p_mode.*count/);
  assert.match(useSegmentAudience, /p_mode.*sample/);
});

test('TalkXSegments uses describeRule for rule display', () => {
  assert.match(talkxSegments, /describeRule/);
  assert.match(talkxSegments, /useSegmentAudience/);
  assert.ok(!talkxSegments.includes('useAudienceEstimate'), 'useAudienceEstimate should be replaced');
});

test('TalkXSegmentBuilder uses SEGMENT_FIELD_CATALOG instead of RULE_FIELDS', () => {
  assert.match(talkxBuilder, /SEGMENT_FIELD_CATALOG/);
  assert.ok(!talkxBuilder.includes('RULE_FIELDS'), 'RULE_FIELDS should be replaced');
});

test('useTalkXSegments re-exports X104 symbols', () => {
  assert.match(useTalkXSegments, /export.*normalizeRules/);
  assert.match(useTalkXSegments, /export.*describeRule/);
  assert.match(useTalkXSegments, /export.*describeRules/);
  assert.match(useTalkXSegments, /export.*SEGMENT_FIELD_CATALOG/);
  assert.match(useTalkXSegments, /export.*useSegmentAudience/);
});