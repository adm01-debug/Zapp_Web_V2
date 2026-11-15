// C121 — contrato da retomada automática de dispatch Multiplix pausado por
// `instance_paused`.
//
// POR QUE ESTE ARQUIVO EXISTE: a revisão automática da PR #3132 apontou que o
// worker passou a pausar o dispatch com o motivo `instance_paused`, mas
// `trigger_pending_multiplix_dispatches()` — a função que o cron chama para
// reabrir o que foi auto-pausado — filtrava só `('outside_window','daily_limit')`.
// Acabada a pausa da instância, o dispatch ficava `paused` para sempre.
//
// A migration 20261115020000 corrige isso. O comportamento foi provado em Postgres
// descartável (16.15) com stubs das dependências, nos quatro casos:
//
//   dispatch com instância AINDA pausada   -> 0 retomadas (fail-closed)
//   dispatch com instância LIBERADA        -> 1 retomada
//   dispatch sem conexão fixa              -> 0 retomadas (não dá para medir)
//   dispatch 'outside_window' (controle)   -> 1 retomada (não regrediu)
//
// E a prova inversa, com o filtro ANTIGO no lugar: o dispatch de instância
// liberada ficava com 0 retomadas e o 'outside_window' seguia com 1 — ou seja, o
// defeito existia e era exclusivo do motivo novo.
//
// Aquele teste exige Postgres e o lugar dele seria `db-guard.yml`, que lista os
// passos um a um; registrar lá mexe em workflow, o que é decisão do dono. Então
// aqui fica a guarda ESTÁTICA, que `ci.yml` já executa pelo glob
// `node --test scripts/ci/*.unit.mjs`: ela não repete a prova de comportamento,
// ela impede que a correção seja desfeita sem ninguém ver.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(fileURLToPath(import.meta.url), '../../..');
const MIGRATION = join(RAIZ, 'supabase/migrations/20261115020000_multiplix_retoma_instance_paused.sql');

function bruto() {
  assert.ok(existsSync(MIGRATION), `migration ausente: ${MIGRATION}`);
  return readFileSync(MIGRATION, 'utf8');
}

/**
 * Só o SQL executável, sem as linhas de comentário.
 *
 * O cabeçalho da migration cita de propósito o filtro ANTIGO
 * (`pause_reason IN ('outside_window', 'daily_limit')`) para explicar o defeito.
 * Casar sobre o texto cru pegaria esse comentário em vez do código e o teste
 * reprovaria a migration correta — foi o que aconteceu na primeira versão daqui.
 */
function sql() {
  return bruto()
    .split('\n')
    .filter((linha) => !/^\s*--/.test(linha))
    .join('\n');
}

test('C121: a migration existe e redefine a função do tick do Multiplix', () => {
  const texto = sql();
  assert.match(
    texto,
    /CREATE OR REPLACE FUNCTION public\.trigger_pending_multiplix_dispatches\(\)/,
    'a migration tem de redefinir trigger_pending_multiplix_dispatches',
  );
  // SECURITY DEFINER e search_path fixo são do contrato da função original;
  // perder qualquer um dos dois mudaria o perímetro de quem pode executar.
  assert.match(texto, /SECURITY DEFINER/, 'a função é SECURITY DEFINER na produção');
  assert.match(texto, /SET search_path TO 'public', 'pg_temp'/, 'search_path fixo é parte do contrato');
});

test('C121: instance_paused entra na retomada automática sem derrubar os motivos antigos', () => {
  const texto = sql();
  const filtro = texto.match(/pause_reason IN \(([^)]*)\)/);
  assert.ok(filtro, 'não achei o filtro de pause_reason na migration');
  const motivos = filtro[1].split(',').map((m) => m.trim().replace(/'/g, ''));
  // O novo entra...
  assert.ok(motivos.includes('instance_paused'), `instance_paused faltando em [${motivos}]`);
  // ...e os dois que já retomavam continuam, senão isto vira regressão:
  // dispatch pausado fora da janela ou por cota deixaria de voltar sozinho.
  assert.ok(motivos.includes('outside_window'), `outside_window saiu do filtro: [${motivos}]`);
  assert.ok(motivos.includes('daily_limit'), `daily_limit saiu do filtro: [${motivos}]`);
});

test('C121: a retomada por instância é fail-closed — só reabre com a pausa acabada', () => {
  const texto = sql();
  // Sem esta guarda o cron reabriria a cada tick e o worker re-pausaria: churn de
  // pausa/retomada queimando um cold start de edge por tick, sem enviar nada. É o
  // mesmo cuidado que `daily_limit` já tinha.
  assert.match(
    texto,
    /IF v_candidate\.pause_reason = 'instance_paused' THEN/,
    'falta o ramo específico de instance_paused',
  );
  // O ramo vai do seu IF ate a transicao que ele protege. Cortar no primeiro
  // `END IF;` pegaria so o `IS NULL` de dentro e perderia o resto — foi o erro da
  // primeira versao deste teste.
  const inicio = texto.indexOf("IF v_candidate.pause_reason = 'instance_paused' THEN");
  assert.ok(inicio > 0, 'nao achei o inicio do ramo de instance_paused');
  const depois = texto.slice(inicio);
  const fim = depois.indexOf('PERFORM public.transition_multiplix_dispatch');
  assert.ok(fim > 0, 'nao achei o fim do bloco de guardas (a transicao protegida)');
  const corpo = depois.slice(0, fim);
  assert.match(
    corpo,
    /public\.is_instance_paused\(/,
    'o ramo tem de consultar is_instance_paused antes de reabrir',
  );
  assert.match(
    corpo,
    /IF v_candidate\.connection_id IS NULL THEN\s+CONTINUE;/,
    'sem conexão fixa não há instância para medir: tem de seguir pausado',
  );
  assert.match(
    corpo,
    /IF v_instance IS NULL OR public\.is_instance_paused\(v_instance\) THEN\s+CONTINUE;/,
    'instância nula ou ainda pausada tem de seguir pausado (fail-closed)',
  );
});

test('C121: a migration não mexe em nada além da retomada', () => {
  const texto = sql();
  // Os outros laços e o fan-out HTTP são os de produção, copiados sem alteração.
  // Se algum desaparecer, a migration passou a fazer mais do que diz.
  for (const marca of [
    'sweep_multiplix_stuck_recipients',
    'sweep_multiplix_stuck_items',
    "dispatch.status = 'scheduled'",
    'multiplix_connection_daily_usage',
    'net.http_post',
    'multiplix_cron_secret',
  ]) {
    assert.ok(texto.includes(marca), `a migration perdeu um trecho da função original: ${marca}`);
  }
  // E não pode conter nada destrutivo: é só CREATE OR REPLACE.
  assert.doesNotMatch(texto, /\b(DROP|TRUNCATE|DELETE\s+FROM|REVOKE)\b/i,
    'a migration só redefine a função; nada destrutivo deve aparecer fora de comentário');
});
