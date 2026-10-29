import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const ler = (caminho) => readFile(new URL(caminho, import.meta.url), 'utf8');

const [workflow, deployment, claude, template, ci, readmeCi] = await Promise.all([
  ler('../../.github/workflows/deploy-functions.yml'),
  ler('../../docs/DEPLOYMENT.md'),
  ler('../../CLAUDE.md'),
  ler('../../.github/PULL_REQUEST_TEMPLATE.md'),
  ler('../../.github/workflows/ci.yml'),
  ler('../../docs/ci/README.md'),
]);

test('GA37: DEPLOYMENT.md acompanha o gatilho automático de Edge Functions', () => {
  const push = workflow.split(/^  push:\s*$/m)[1]?.split(/^  workflow_dispatch:/m)[0] ?? '';
  assert.match(push, /branches:\s*\[main\]/, 'deploy de Edge precisa estar limitado à main');
  assert.match(push, /supabase\/functions\/\*\*/, 'gatilho deve cobrir as Edge Functions');
  assert.match(push, /supabase\/config\.toml/, 'gatilho deve cobrir config.toml');
  assert.match(push, /!supabase\/functions\/\*\*\/\*\.test\.ts/, 'testes não devem disparar deploy');
  assert.match(push, /!supabase\/functions\/\*\*\/\*\.md/, 'documentação não deve disparar deploy');
  assert.match(push, /!supabase\/functions\/\*\*\/fixtures\/\*\*/, 'fixtures não devem disparar deploy');
  assert.match(deployment, /publicadas automaticamente/i);
  assert.match(deployment, /workflow_dispatch.*rollback/is);
  assert.match(deployment, /`\*\.test\.ts`.*`\.md`.*`fixtures\//s);
  assert.doesNotMatch(deployment, /Edge Functions NÃO sobem automaticamente/i);
  assert.doesNotMatch(deployment, /deployadas \*\*somente\*\* via `workflow_dispatch`/i);
});

test('GA37: CLAUDE.md distingue a regra atual do registro histórico', () => {
  assert.match(claude, /Retificação de 2026-10-07 — Edge Functions/);
  const inicio = claude.indexOf('### Deploy e edge functions');
  assert.notEqual(inicio, -1, 'seção atual de deploy sumiu do CLAUDE.md');
  const secao = claude.slice(inicio, claude.indexOf('\n### ', inicio + 1));
  assert.match(secao, /deploy automático/i);
  assert.doesNotMatch(secao, /NÃO sobem com o front|aprovação de Joaquim/);
});

test('GA37: template de PR orienta a confirmar o deploy automático', () => {
  assert.match(template, /confirmar `deploy-functions`/);
  assert.doesNotMatch(template, /disparar `deploy-functions` após o merge/);
});

test('docs/ci/README continua gerado e validado pelo CI', () => {
  assert.match(readmeCi, /Gerado por `scripts\/ci\/render-workflow-docs\.mjs`/);
  assert.match(readmeCi, /CI roda\s*> `--check`/);
  assert.match(ci, /node scripts\/ci\/render-workflow-docs\.mjs --check/);
});
