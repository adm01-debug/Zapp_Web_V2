import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { assertBlocking, jobOf, onlyStep, runOf, stepsOf } from './workflow-test-support.mjs';

// ── Contrato do workflow ─────────────────────────────────────────────────────
// Este era o unico guard que travava o caminho antigo: o teardown de producao por
// script (removido junto com as RPCs orfas na migration 20261124120000) nao pode
// voltar. O workflow executa um backend descartavel: nao autentica nem apaga
// fixtures na producao.
const WORKFLOW = readFileSync(new URL('../../.github/workflows/e2e-logado.yml', import.meta.url), 'utf8');

test('e2e-logado.yml: backend descartavel substitui chamadas de teardown de producao', () => {
  const job = jobOf(WORKFLOW, 'e2e-logado');
  const controller = onlyStep(stepsOf(job), step => /bash scripts\/e2e-isolated\/run\.sh suite\b/.test(runOf(step)), 'controller com limpeza propria');
  assertBlocking(job, 4);
  assertBlocking(controller);
  assert.doesNotMatch(WORKFLOW, /e2e-teardown\.mjs|e2e_cleanup_conversation_closures|e2e_cleanup\(\)|catalog_send_events|curl\b/);
  assert.doesNotMatch(WORKFLOW, /secrets\.|SUPABASE_SERVICE_ROLE_KEY|E2E_TEST_EMAIL|E2E_TEST_PASSWORD/);
});
