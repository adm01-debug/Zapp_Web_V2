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
 * Correção em duas frentes:
 *   1. No PR, o check só AVISA (`continue-on-error: true`) — não derruba o job.
 *   2. No push da main, um workflow regenera o STATUS.md e abre/atualiza um PR.
 *      Não commita direto na main: ela é protegida, e o envio direto é recusado
 *      com `GH006: Protected branch update failed` (medido no run 37061271438,
 *      02/10/2026 — o desenho antigo só funcionava antes da branch protection).
 *
 * Vermelho-antes: este teste falha (sem `continue-on-error` e sem o workflow).
 * Verde-depois: passa com os dois artefatos no lugar.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

/** Bloco YAML do step cujo `name` contém `marcador`. */
function blocoStep(texto, marcador) {
  const ini = texto.indexOf(marcador);
  assert.ok(ini >= 0, `step "${marcador}" não encontrado`);
  const resto = texto.slice(ini);
  const fim = resto.indexOf('\n      - name:');
  return fim >= 0 ? resto.slice(0, fim) : resto;
}

test('placar do Talk X avisa no PR, não bloqueia (continue-on-error)', () => {
  const ci = read('.github/workflows/ci.yml');
  const bloco = blocoStep(ci, 'placar freshness');
  assert.match(bloco, /continue-on-error:\s*true/, 'o step do placar deve ter continue-on-error: true (aviso, não bloqueia)');
  assert.match(bloco, /if:\s*github\.event_name\s*==\s*['"]pull_request['"]/, 'o check deve rodar só em PR');
  assert.match(bloco, /node scripts\/talkx\/v4-status\.mjs\s+--check/, 'o check continua rodando o v4-status.mjs --check');
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
