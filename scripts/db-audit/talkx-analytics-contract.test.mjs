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
const sharedDialogs = await readFile(
  new URL('../../src/components/talkx/kit/dialogs.tsx', import.meta.url),
  'utf8',
);
const sharedPrimitives = await readFile(
  new URL('../../src/components/talkx/kit/primitives.tsx', import.meta.url),
  'utf8',
);
const funnel = await readFile(
  new URL('../../src/components/talkx/analytics/AnalyticsFunnel.tsx', import.meta.url),
  'utf8',
);
const performance = await readFile(
  new URL('../../src/components/talkx/analytics/AnalyticsPerformanceChart.tsx', import.meta.url),
  'utf8',
);

test('Talk X analytics reports read from read_count, keeps delivery/read honest', () => {
  assert.doesNotMatch(analytics, /stats\.sent\s*\*\s*0\.964/);
  assert.doesNotMatch(analytics, /0\.128/);
  assert.doesNotMatch(analytics, /0\.046/);
  // X186: os degraus do funil saem dos mesmos medidores, e a métrica que a plataforma
  // ainda não mede (conversão por mensagem) entra NULA — nunca zero.
  assert.match(analytics, /label: 'Entregues', value: stats\.delivered/);
  assert.match(analytics, /label: 'Lidas', value: stats\.read/);
  assert.match(analytics, /label: 'Conversões', value: null/);
  assert.match(analytics, /outcomeUnknown = filtered\.reduce/);
});

test('Talk X funil é proporcional ao valor medido e não inventa zero (X186)', () => {
  // Larguras fixas (100/80/55/35 %) não mediam a perda real entre os degraus: saem do código.
  assert.doesNotMatch(analytics, /const widths = \[100, 80, 55, 35\]/);
  assert.doesNotMatch(analytics, /'Não rastreado'/);
  assert.match(analytics, /<AnalyticsFunnel steps=\{funnelSteps\} \/>/);
  assert.match(funnel, /const TRACK_W = VIEW_W - 46/);
  assert.match(funnel, /share \* TRACK_W/);
  assert.match(funnel, /sem dados ainda/);
});

test('Talk X série diária desenha só a série com fonte e troca o gráfico de barras (X186)', () => {
  // O título do card antigo sai do JSX (a menção em comentário é a nota da remoção).
  assert.doesNotMatch(analytics, />Performance por Campanha</);
  assert.match(analytics, /<AnalyticsPerformanceChart/);
  assert.match(analytics, /talkx_overview_stats/);
  assert.match(performance, /sem dados ainda/);
  assert.match(performance, /const MONTHS_PT = \['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'\]/);
});

test('Talk X série diária não engole o erro da RPC (recusa 1 do TL-171)', () => {
  // Leitura falha NÃO pode virar "sem resultados": a queryFn lança o `error` do envelope do
  // supabase para o React Query marcar isError, e o gráfico mostra o estado de erro próprio.
  assert.match(analytics, /const \{ data, error \} = await supabase\.rpc\('talkx_overview_stats'/);
  assert.match(analytics, /if \(error\) throw error;/);
  assert.match(performance, /Não foi possível carregar a série do período/);
});

test('Talk X não fabrica variação percentual no KPI "Em andamento" (delta ↑N%)', () => {
  assert.doesNotMatch(overview, /delta=\{totals\.active>0/);
  assert.doesNotMatch(overview, /suffix:\s*'%',\s*tone:\s*'up'/);
});

test('Talk X não afirma multiplicador de conversão sem baseline (3× / 2,3×)', () => {
  assert.doesNotMatch(overview, /3× mais chances de conversão/);
  assert.doesNotMatch(segments, /2,3× mais conversões/);
});

test('Talk X separa "Desempenho (última campanha)" do tamanho da audiência', () => {
  // X115 — a coluna do mock é lida da última campanha do segmento (RPC da
  // biblioteca, X103); sem campanha ela mostra "Sem dados ainda", nunca a barra
  // derivada de `estimated_count` da antiga coluna "Público relativo".
  assert.doesNotMatch(segments, /<Th>Desempenho<\/Th>/);
  assert.doesNotMatch(segments, /<Th>Público relativo<\/Th>/);
  assert.doesNotMatch(segments, /estimated_count\s*\/\s*Math\.max/);
  assert.match(segments, /<Th>Desempenho \(última campanha\)<\/Th>/);
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
  assert.match(sharedDialogs, /disabled=\{!allChecked \|\| loading\}/);
  assert.match(sharedPrimitives, /disabled=\{disabled \|\| loading\}/);
});
