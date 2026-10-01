import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const analytics = await readFile(
  new URL('../../src/components/talkx/TalkXAnalytics.tsx', import.meta.url),
  'utf8',
);
const overview = await readFile(
  new URL('../../src/components/talkx/TalkXOverview.tsx', import.meta.url),
  'utf8',
);
const segments = await readFile(
  new URL('../../src/components/talkx/TalkXSegments.tsx', import.meta.url),
  'utf8',
);
const templates = await readFile(
  new URL('../../src/components/talkx/TalkXTemplates.tsx', import.meta.url),
  'utf8',
);
const monitor = await readFile(
  new URL('../../src/components/talkx/TalkXLiveMonitor.tsx', import.meta.url),
  'utf8',
);
const shared = await readFile(
  new URL('../../src/components/talkx/talkxShared.tsx', import.meta.url),
  'utf8',
);

test('Talk X analytics reports read from read_count, keeps delivery/read honest', () => {
  assert.doesNotMatch(analytics, /stats\.sent\s*\*\s*0\.964/);
  assert.doesNotMatch(analytics, /0\.128/);
  assert.doesNotMatch(analytics, /0\.046/);
  assert.match(analytics, /name: 'Entregues', value: stats\.delivered, reported: true/);
  assert.match(analytics, /name: 'Lidas', value: stats\.read, reported: true/);
  assert.match(analytics, /name: 'Conversões', value: null, reported: false/);
  assert.match(analytics, /'Não rastreado'/);
  assert.match(analytics, /outcomeUnknown = filtered\.reduce/);
});

test('Talk X não fabrica variação percentual no KPI "Em andamento" (delta ↑N%)', () => {
  assert.doesNotMatch(overview, /delta=\{totals\.active>0/);
  assert.doesNotMatch(overview, /suffix:\s*'%',\s*tone:\s*'up'/);
});

test('Talk X não afirma multiplicador de conversão sem baseline (3× / 2,3×)', () => {
  assert.doesNotMatch(overview, /3× mais chances de conversão/);
  assert.doesNotMatch(segments, /2,3× mais conversões/);
});

test('Talk X não rotula tamanho de audiência como "Desempenho"', () => {
  assert.doesNotMatch(segments, /<Th>Desempenho<\/Th>/);
  assert.match(segments, /<Th>Público relativo<\/Th>/);
});

test('Talk X não rotula uso de template como "Mais convertidos"', () => {
  assert.doesNotMatch(templates, /Mais convertidos/);
  assert.match(templates, /Mais usados/);
});

test('Talk X não rotula taxa de envio como "Conversão por segmento"', () => {
  assert.doesNotMatch(analytics, /Conversão por segmento/);
  assert.match(analytics, /label="Envio por segmento"/);
});

test('Talk X lê o status real da conexão WA em vez de "Conectada" fixo', () => {
  assert.doesNotMatch(monitor, /label="Conexão WA"\s+value="Conectada"/);
  assert.match(monitor, /useTalkXConnectionStatus/);
});

test('TalkXConfirmDialog desabilita de verdade o botão de confirmar', () => {
  assert.match(shared, /disabled=\{!allChecked \|\| loading\}/);
  assert.match(shared, /disabled=\{disabled \|\| loading\}/);
});
