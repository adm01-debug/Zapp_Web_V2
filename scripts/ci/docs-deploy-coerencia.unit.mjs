import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { extrairDocs, extrairNaoEBug } from './render-workflow-docs.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ler = (p) => readFile(join(RAIZ, p), 'utf8');

// GA37 — verificação: teste de documento que proíbe "merge não deploya".
// Desde 07/10/2026 o push na main com edge alterada dispara deploy-functions
// sozinho; a doc que diz o contrário (manual-only) está errada.

const FRASES_MANUAL_ONLY = [
  'NÃO sobem automaticamente',
  'somente via `workflow_dispatch`',
  'não sobe sozinha',
  'NÃO deploya edge function',
];

test('GA37: DEPLOYMENT.md descreve deploy automático de edge (sem manual-only)', async () => {
  const doc = await ler('docs/DEPLOYMENT.md');
  for (const f of FRASES_MANUAL_ONLY) {
    assert.ok(!doc.includes(f), `DEPLOYMENT.md ainda diz: ${f}`);
  }
  assert.ok(doc.includes('07/10/2026'), 'DEPLOYMENT.md sem o marco do deploy automático');
  assert.ok(/dispara.*sozinho|automático no push/i.test(doc), 'DEPLOYMENT.md sem menção ao disparo automático');
});

test('GA37: PULL_REQUEST_TEMPLATE sem manual-only, com automático', async () => {
  const tpl = await ler('.github/PULL_REQUEST_TEMPLATE.md');
  assert.ok(!tpl.includes('não sobe sozinha'), 'template ainda diz que a função não sobe sozinha');
  assert.ok(!tpl.includes('disparar `deploy-functions` após o merge'), 'template ainda manda disparar após o merge');
  assert.ok(tpl.includes('dispara `deploy-functions` sozinho'), 'template sem o comportamento automático');
});

test('GA37: CLAUDE.md marca o período manual como histórico com retificação 07/10', async () => {
  const claude = await ler('CLAUDE.md');
  assert.ok(claude.includes('Retificação 2026-10-07'), 'CLAUDE.md sem retificação do período manual 28/08–07/10');
});

// GA96 — talkx-status-regen.yml leve: paths, timeout, sem duplicata, corpo coerente.
test('GA96: talkx-status-regen filtra push, tem timeout e sem concurrency duplicada', async () => {
  const yml = await ler('.github/workflows/talkx-status-regen.yml');
  assert.ok(yml.includes('docs/talkx/**'), 'sem filtro de paths no push');
  assert.ok(yml.includes('scripts/talkx/**'), 'sem filtro de scripts/talkx no push');
  assert.ok(yml.includes('timeout-minutes:'), 'sem timeout-minutes');
  assert.equal((yml.match(/^concurrency:/gm) || []).length, 1, 'bloco concurrency duplicado');
  assert.ok(!/^\s*fetch-depth: 1\s*$/m.test(yml), 'fetch-depth 1 quebra o git log do regen');
  assert.ok(/^\s*fetch-depth: 0\s*$/m.test(yml), 'regen precisa de historico (git log origin/main)');
  assert.ok(!yml.includes('Revisão humana e checks da PR continuam obrigatórios'), 'corpo incoerente com auto-merge');
  assert.ok(yml.includes('Auto-merge (squash) ligado'), 'corpo sem menção ao auto-merge');
});

// GA97 — CODEOWNERS e template alinhados à seção 0 (review obrigatório: nenhum).
test('GA97: CODEOWNERS não exige aprovação; template sem ritual fora da seção 0', async () => {
  const owners = await ler('.github/CODEOWNERS');
  assert.ok(!owners.includes('requerem aprovação'), 'CODEOWNERS ainda exige aprovação');
  assert.ok(owners.includes('review obrigatório: nenhum'), 'CODEOWNERS sem o alinhamento à seção 0');
  const tpl = await ler('.github/PULL_REQUEST_TEMPLATE.md');
  assert.ok(tpl.includes('arquivo versionado em `supabase/migrations/`'), 'template sem o ritual de migration da seção 1');
});

// GA98 — render-workflow-docs lê itens nao-e-bug de várias linhas.
test('GA98: nao-e-bug com continuação compõe a descrição em vez de truncar', () => {
  const texto = [
    '# docs:',
    '#   gatilho: x',
    '#   prova: y',
    '#   falha: z',
    '#   avisa: w',
    '# nao-e-bug:',
    '#   - item longo: primeira parte',
    '#     segunda parte da mesma descricao',
    '# =================================================',
    'name: X',
  ].join('\n');
  const itens = extrairNaoEBug(texto);
  assert.equal(itens.length, 1);
  assert.equal(itens[0].chave, 'item longo');
  assert.equal(itens[0].descricao, 'primeira parte segunda parte da mesma descricao');
});

test('GA98: bloco docs continua válido após a mudança do extrator', () => {
  const texto = '# docs:\n#   gatilho: x\n#   prova: y\n#   falha: z\n#   avisa: w\nname: X\n';
  assert.deepEqual(extrairDocs(texto), { gatilho: 'x', prova: 'y', falha: 'z', avisa: 'w' });
});
