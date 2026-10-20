// E56: regressao com o log REAL dos runs que quebraram a atestacao.
//
// Fixtures (todas derivadas byte a byte dos logs dos runs citados):
//   deploy-log-single-36852598923.txt  deploy de 1 funcao pulada por bundle identico
//   deploy-log-all-36583351162.txt     deploy completo, com varias puladas
//   deploy-log-ansi-f03.txt            a mesma linha, embrulhada em ANSI (F-03)
//   deploy-log-echo-only.txt           o eco do proprio script, que NAO e funcao
//
// O run 36583351162 e o caso F-03: o extrator com ancoras ^...$ nao casava a
// linha do CLI (ANSI) e a atestacao queimava 144 amostras. O teste 3 trava isso.
// O teste 4 trava o outro lado: o eco do script nao pode virar funcao.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { extractUnchangedSlugs, stripAnsi } from './unchanged-from-log.mjs';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixture = (nome) => readFileSync(join(FIXTURES, nome), 'utf8');

test('1. log real do deploy de uma funcao pulada: exatamente a funcao do run', () => {
  const slugs = extractUnchangedSlugs(fixture('deploy-log-single-36852598923.txt'));
  assert.deepEqual(slugs, ['ai-conversation-analysis']);
});

test('2. log real do deploy completo: so os slugs das linhas de saida, em ordem', () => {
  const slugs = extractUnchangedSlugs(fixture('deploy-log-all-36583351162.txt'));
  assert.equal(slugs.length, 15);
  assert.ok(slugs.every((s) => /^[a-z0-9][a-z0-9-]*$/.test(s)), `slug invalido em ${JSON.stringify(slugs)}`);
  assert.deepEqual(slugs.slice(0, 3), ['ai-auto-tag', 'ai-churn-analysis', 'ai-classify-tickets']);
  assert.equal(slugs.at(-1), 'chatbot-l1');
  assert.ok(slugs.includes('bitrix-api'));
});

test('3. F-03: a linha embrulhada em ANSI continua sendo capturada', () => {
  const bruto = fixture('deploy-log-ansi-f03.txt');
  assert.ok(bruto.includes('\x1b'), 'a fixture precisa ter byte ESC de verdade');
  assert.deepEqual(extractUnchangedSlugs(bruto), ['ai-conversation-analysis']);
  // prova de mutacao: sem o strip de ANSI a linha NAO casa (era o bug F-03)
  const semStrip = bruto.split('\n').find((l) => l.includes('\x1b'));
  assert.equal(/^No change found in Function:/.test(semStrip), false);
  assert.equal(/^No change found in Function:/.test(stripAnsi(semStrip)), true);
});

test('4. o eco do proprio script nunca vira funcao sem mudanca', () => {
  const bruto = fixture('deploy-log-echo-only.txt');
  assert.deepEqual(extractUnchangedSlugs(bruto), []);
  // prova de mutacao: o padrao antigo (sem ancora, com \S+) casava o eco
  const eco = stripAnsi(bruto);
  const antigo = [...eco.matchAll(/No change found in Function: (\S+)/g)].map((m) => m[1]);
  assert.equal(antigo.length, 1, 'o padrao antigo de fato captura o eco');
  assert.equal(antigo[0], String.raw`(\S+)/g)].map((m)`);
});

test('5. slug fora da forma de nome de funcao e descartado', () => {
  const log = 'No change found in Function: (\u005cS+)/g)].map((m)\nNo change found in Function: ai-ok\n';
  assert.deepEqual(extractUnchangedSlugs(log), ['ai-ok']);
});

test('6. linhas repetidas nao duplicam e \r de barra de progresso e tolerado', () => {
  const log = 'No change found in Function: talkx-send\r\nNo change found in Function: talkx-send\n';
  assert.deepEqual(extractUnchangedSlugs(log), ['talkx-send']);
});
