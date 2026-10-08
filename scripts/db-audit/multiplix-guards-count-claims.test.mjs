import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/**
 * Contrato das contagens declaradas no comentario do #1267 (arquivo
 * 20260930300000_multiplix_guards_fail_closed.sql).
 *
 * O comentario afirma duas contagens do modulo Multiplix ("N funcoes citam
 * auth.role()" e "as outras M usam <> 'service_role' THEN RAISE"). Essas
 * contagens sao uma medicao do catalogo canonico em 30/09/2026, registrada no
 * veredicto da auditoria da Onda 3 (achado A6) — nao um numero do arquivo. O
 * corpo do PR #1314 publicou 17/15; a medicao do catalogo (reproduzida tambem
 * sobre as migrations de 160f34052, o merge do #1314) da 15 funcoes distintas
 * = 13 RPCs fail-close + estes 2 triggers.
 *
 * Por que o teste NAO remede o repositorio de hoje: o modulo cresceu depois de
 * 30/09 (as migrations da fila de itens, f31..f62, somam dezenas de funcoes
 * Multiplix com auth.role()). Fixar a contagem viva seria um pino que quebra a
 * cada RPC nova legitimamente. O que se fixa aqui e a coerencia entre a
 * declaracao do arquivo e a medicao congelada que a justifica, mais a aritmetica
 * contra o proprio arquivo (13 RPCs + 2 triggers definidos aqui = 15).
 *
 * Todos os casos negativos saem do CONTEUDO REAL: o texto com 17/15 e o proprio
 * comentario com os numeros reescritos, e a "guarda a mais" e um guard irma real
 * do Talk X, lido da migration que o define.
 */

const MIGRACAO = new URL('../../supabase/migrations/20260930300000_multiplix_guards_fail_closed.sql', import.meta.url);
const GUARDA_IRMA = new URL('../../supabase/migrations/20260930420000_talkx_guards_fail_closed.sql', import.meta.url);
const VEREDICTO = new URL('../../docs/audits/onda3-260930/VEREDICTO-CONSOLIDADO.md', import.meta.url);
const RE_GUARDA_MULTIPLIX = /CREATE OR REPLACE FUNCTION public\.(enforce_multiplix_[a-z_]+)\(\)/gu;
const RE_GUARDA_TALKX = /CREATE OR REPLACE FUNCTION public\.(enforce_talkx_[a-z_]+)\(\)/gu;

const ler = (url) => fs.readFileSync(url, 'utf8');
const guardasDe = (conteudo, re) => [...conteudo.matchAll(re)].map((m) => m[1]).sort();

function contagensDeclaradas(comentario) {
  const total = comentario.match(/das (\d+) funções Multiplix que citam/u);
  const outras = comentario.match(/as outras (\d+) usam/u);
  if (!total || !outras) return null;
  return { total: Number(total[1]), outras: Number(outras[1]) };
}

function medicaoDoVeredicto(texto) {
  const m = texto.match(/o catálogo mede \*\*(\d+)\*\* \((\d+) RPCs \+ (\d+) triggers\)/u);
  if (!m) return null;
  return { total: Number(m[1]), rpcs: Number(m[2]), triggers: Number(m[3]) };
}

/** Devolve a lista de divergencias (vazia = contrato cumprido). */
export function divergencias(comentario, medicao, guardas) {
  const erros = [];
  const declarado = contagensDeclaradas(comentario);
  if (!declarado) return ['comentario sem as duas contagens declaradas'];
  if (!medicao) return ['veredicto sem a medicao do catalogo (A6)'];
  if (declarado.total !== medicao.total) {
    erros.push(`total declarado (${declarado.total}) diverge da medicao (${medicao.total})`);
  }
  if (declarado.outras !== medicao.rpcs) {
    erros.push(`"as outras" declarado (${declarado.outras}) diverge das RPCs medidas (${medicao.rpcs})`);
  }
  if (guardas.length !== medicao.triggers) {
    erros.push(`o arquivo define ${guardas.length} guarda(s); a medicao conta ${medicao.triggers} trigger(s)`);
  }
  if (declarado.total !== declarado.outras + guardas.length) {
    erros.push(`aritmetica do comentario nao fecha: ${declarado.total} != ${declarado.outras} + ${guardas.length}`);
  }
  return erros;
}

const CONTEUDO = ler(MIGRACAO);
const GUARDAS = guardasDe(CONTEUDO, RE_GUARDA_MULTIPLIX);
const MEDICAO = medicaoDoVeredicto(ler(VEREDICTO));

test('as contagens do comentario do #1267 batem com a medicao do catalogo e com o proprio arquivo', () => {
  assert.deepEqual(MEDICAO, { total: 15, rpcs: 13, triggers: 2 }, 'medicao A6 do veredicto mudou');
  assert.deepEqual(GUARDAS, ['enforce_multiplix_dispatch_mutability', 'enforce_multiplix_recipient_mutability'],
    'o arquivo do #1267 precisa definir exatamente os dois guards de mutabilidade');
  assert.deepEqual(divergencias(CONTEUDO, MEDICAO, GUARDAS), []);
});

test('rejeita as contagens que o #1314 publicou, reescritas sobre o proprio comentario', () => {
  const comoPublicado = CONTEUDO
    .replace('das 15 funções Multiplix', 'das 17 funções Multiplix')
    .replace('as outras 13 usam', 'as outras 15 usam');
  assert.notEqual(comoPublicado, CONTEUDO, 'a derivacao do texto do #1314 precisa mudar o arquivo real');
  assert.deepEqual(divergencias(comoPublicado, MEDICAO, GUARDAS), [
    'total declarado (17) diverge da medicao (15)',
    '"as outras" declarado (15) diverge das RPCs medidas (13)',
  ]);
});

test('rejeita "as outras" fora de sincronia e a medicao ausente', () => {
  const foraDeSincronia = CONTEUDO.replace('as outras 13 usam', 'as outras 14 usam');
  assert.notEqual(foraDeSincronia, CONTEUDO);
  assert.deepEqual(divergencias(foraDeSincronia, MEDICAO, GUARDAS), [
    '"as outras" declarado (14) diverge das RPCs medidas (13)',
    'aritmetica do comentario nao fecha: 15 != 14 + 2',
  ]);
  assert.deepEqual(divergencias(CONTEUDO, null, GUARDAS), ['veredicto sem a medicao do catalogo (A6)']);
  assert.deepEqual(divergencias('-- arquivo sem contagem nenhuma\n', MEDICAO, GUARDAS),
    ['comentario sem as duas contagens declaradas']);
});

test('rejeita um terceiro guard vindo de outra migration real (Talk X)', () => {
  const irmas = guardasDe(ler(GUARDA_IRMA), RE_GUARDA_TALKX);
  assert.equal(irmas.length, 2, 'a migration irma do Talk X define dois guards');
  assert.ok(!GUARDAS.includes(irmas[0]), 'a guarda irma nao pode ser uma guarda deste arquivo');
  const comIrma = [...GUARDAS, irmas[0]].sort();
  assert.deepEqual(divergencias(CONTEUDO, MEDICAO, comIrma), [
    'o arquivo define 3 guarda(s); a medicao conta 2 trigger(s)',
    'aritmetica do comentario nao fecha: 15 != 13 + 3',
  ]);
});
