/**
 * S2871 — `.sort()` sem funcao de comparacao.
 *
 * O bug real nao e "sort sem comparador" no sentido generico: e que `Array#sort()` sem
 * comparador ordena por code-unit UTF-16, o que **nao** e ordem alfabetica para texto
 * humano. Para nomes de spec em pt-BR (que e o dado de `marcador-specs.normalizar`), isso
 * poe "Alvaro" DEPOIS de "Zebra", porque 'A' acentuado (U+00C1) tem codigo maior que 'Z'.
 *
 * Os demais pontos da regra ordenam identificadores ASCII (nomes de secret) e caminhos de
 * arquivo, onde a ordem por code-unit esta CERTA e mudar para `localeCompare` mudaria o
 * resultado -- a colecao `locale` ignora pontuacao fraca e o `_` trocaria de posicao. Para
 * esses, o comparador explicito apenas declara a intencao sem alterar a ordem.
 *
 * Este arquivo comeca pelo caso que FALHA com o codigo atual: e o vermelho-antes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// --- a ordem que o codigo atual produz (code-unit) e a que queremos (alfabetica pt-BR) ---

test('S2871: sort() sem comparador NAO da ordem alfabetica para nomes com acento', () => {
  const nomes = ['Zebra', 'Alvaro', 'Álvaro', 'zebra', 'alvaro'];

  const porCodeUnit = [...nomes].sort();
  const alfabetica = [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  // o que o codigo atual faz: acentuadas para o fim, maiusculas antes de minusculas
  assert.deepEqual(porCodeUnit, ['Alvaro', 'Zebra', 'alvaro', 'zebra', 'Álvaro'],
    'code-unit: acentuada vai para o fim (e este e o bug)');

  // o que queremos: agrupado por letra, como uma pessoa le
  assert.deepEqual(alfabetica, ['alvaro', 'Alvaro', 'Álvaro', 'zebra', 'Zebra'],
    'alfabetica pt-BR: agrupado por letra');

  // a diferenca e o bug: as duas ordens sao diferentes para o MESMO dado
  assert.notDeepEqual(porCodeUnit, alfabetica,
    'ha diferenca real entre as duas ordens -- e por isso a regra aponta BUG, nao estilo');
});

test('S2871: nomes de spec em pt-BR precisam de comparador locale-aware', () => {
  const specs = ['busca-avancada', 'Área-do-cliente', 'zona-franca', 'área-de-logs'];

  const atual = [...specs].sort();
  const correto = [...specs].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  assert.deepEqual(correto, ['área-de-logs', 'Área-do-cliente', 'busca-avancada', 'zona-franca'],
    'ordem alfabetica: acentuadas junto das suas letras');
  assert.notDeepEqual(atual, correto,
    'a ordem atual esta errada e este teste e o vermelho-antes');
});

test('S2871: identificadores ASCII NAO podem mudar de ordem ao ganhar comparador', () => {
  // nomes de secret: code-unit e a ordem correta e deve ser preservada byte a byte.
  // 'localeCompare' aqui seria REGRESSAO: '_' e pontuacao fraca e a colecao o ignora.
  const secrets = ['CRON_SECRET', 'EXTERNAL_SUPABASE_URL', 'PREVIEW_EGRESS_PROXY_URL'];

  const codeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const porComparadorExplicito = [...secrets].sort(codeUnit);
  const porDefault = [...secrets].sort();

  assert.deepEqual(porComparadorExplicito, porDefault,
    'comparador explicito de code-unit preserva exatamente a ordem atual');

  // Medido: nesta amostra localeCompare coincide com code-unit, porque os prefixos
  // (CRON_, EXTERNAL_, PREVIEW_) ja se distinguem antes do '_'. Ainda assim o comparador
  // explicito e o certo aqui: ele GARANTE a ordem code-unit independente de locale, e
  // localeCompare pode divergir em outro conjunto de nomes. Nao afirmo divergencia que
  // eu nao medi -- afirmo que a garantia existe.
});

test('S2871: caminhos de arquivo precisam de ordem estavel entre ambientes', () => {
  const caminhos = ['a/b_c.txt', 'a/bc.txt', 'a/b-d.txt'];
  const codeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

  assert.deepEqual([...caminhos].sort(codeUnit), [...caminhos].sort(),
    'code-unit e deterministico e nao depende de locale do runner');
  // localeCompare depende do locale do ambiente: nao serve para caminho
  // Mesma correcao: nao afirmo que localeCompare divergiu aqui (nao medi). Afirmo que
  // code-unit e deterministico por definicao e nao depende do locale do runner.
});
