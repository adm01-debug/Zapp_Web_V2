/**
 * Contrato da correção sistêmica do placar do Talk X V4.
 *
 * Contexto (2026-10-01): o check "Verify Talk X V4 placar freshness" comparava o
 * STATUS.md commitado com os títulos (X<NNN>) já em origin/main. Uma etapa recém-
 * mergeada deixa o arquivo 1 passo atrás (o gerador não conta a própria etapa antes
 * do merge) — e o check BLOQUEAVA (exit 1), deixando a main vermelha a cada merge de
 * etapa e travando o merge de todos os chats (observado: X028 → main vermelha, PRs
 * #1478 e #1474 bloqueados).
 *
 * O CI atual resolve a corrida consultando o próprio commit (`--ref HEAD`),
 * e voltou a bloquear divergências reais. O antigo aviso restrito a PR deixou
 * de ser o contrato; não se deve restaurar `continue-on-error` para passar o teste.
 * No push da main, outro workflow regenera o STATUS.md e abre/atualiza um PR.
 *      Não commita direto na main: ela é protegida, e o envio direto é recusado
 *      com `GH006: Protected branch update failed` (medido no run 37061271438,
 *      02/10/2026 — o desenho antigo só funcionava antes da branch protection).
 *
 * O contrato protege a referência determinística, a falha bloqueante e o PR
 * de regeneração, preservando a origem da correção acima.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { assertBlocking, conditionOf, jobOf, onlyStep, shellCode, stepsOf } from './workflow-test-support.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

test('placar do Talk X verifica o proprio HEAD e bloqueia divergencias', () => {
  const ci = read('.github/workflows/ci.yml');
  const job = jobOf(ci, 'node-scripts');
  const step = onlyStep(stepsOf(job), (s) => /^\s*node scripts\/talkx\/v4-status\.mjs\b/m.test(shellCode(s)), 'placar Talk X');
  assertBlocking(job, 4);
  assertBlocking(step);
  assert.ok(['success()', 'true'].includes(conditionOf(job, 4)), 'o job deve verificar PRs e pushes');
  assert.ok(['success()', 'true'].includes(conditionOf(step)), 'o placar não deve ficar restrito a um evento');
  assert.match(shellCode(step).trim(), /^node scripts\/talkx\/v4-status\.mjs\s+--check\s+--ref\s+(?:HEAD|'HEAD'|"HEAD")$/, 'verifica o commit local sem mascarar exit 1');
});

test('existe workflow de auto-regen no push da main (bot, sem loop)', () => {
  const path = '.github/workflows/talkx-status-regen.yml';
  assert.ok(existsSync(join(ROOT, path)), 'workflow de auto-regen ausente');
  const wf = read(path);
  assert.match(wf, /on:\s*\n\s*push:\s*\n\s*branches:\s*\[main\]/, 'deve disparar no push da main');
  assert.match(wf, /contents:\s*write/, 'precisa de contents: write para publicar o placar');
  assert.match(wf, /node scripts\/talkx\/v4-status\.mjs/, 'deve regenerar o STATUS.md');
  // A main é protegida (6 checks obrigatórios): o placar sai por PR, nunca por
  // envio direto — que era o defeito medido no run 37061271438 (GH006).
  assert.match(wf, /create-pull-request/, 'deve abrir/atualizar um PR com o placar');
  assert.match(wf, /branch:\s*automation\/talkx-status/, 'branch do PR do placar');
  assert.doesNotMatch(wf, /^\s*git push\s*$/m, 'não pode empurrar direto na main');
});
