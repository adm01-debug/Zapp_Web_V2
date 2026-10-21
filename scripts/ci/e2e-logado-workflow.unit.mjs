// GA08/GA09/GA12: contrato do e2e-logado.yml — fork com branch `main` nao
// executa (Scorecard #40), uma run por vez, orcamento proprio por grupo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const yml = await readFile(new URL('../../.github/workflows/e2e-logado.yml', import.meta.url), 'utf8');

test('GA08: E2E so roda por dispatch ou CI de push verde no MESMO repo', () => {
  assert.ok(yml.includes('workflows: [CI/CD Pipeline]'), 'dispara no fim do CI');
  assert.ok(yml.includes("github.event.workflow_run.conclusion == 'success'"), 'exige CI verde');
  assert.ok(yml.includes("github.event.workflow_run.event == 'push'"), 'exige evento push');
  assert.ok(
    yml.includes('github.event.workflow_run.head_repository.full_name == github.repository'),
    'exige mesmo repo (fecha fork com branch main)'
  );
  assert.ok(!yml.includes('branches: [main]\n  workflow_dispatch'), 'push direto nao dispara mais');
});

test('GA09: grupo de concorrencia fixo, sem ref (uma run por vez)', () => {
  assert.match(yml, /group: e2e-logado\n/, 'grupo fixo');
  assert.ok(!yml.includes('group: e2e-logado-${{'), 'sem interpolacao de ref');
});

test('GA12: cada grupo tem global-timeout proprio e o orcamento reprova', () => {
  assert.equal((yml.match(/global_timeout_ms: \d+/g) ?? []).length, 3, 'um timeout por grupo da matriz');
  assert.ok(yml.includes('--global-timeout=${{ matrix.global_timeout_ms }}'), 'timeout chega ao Playwright');
  assert.ok(yml.includes('did not run'), 'portao de orcamento existe');
});
