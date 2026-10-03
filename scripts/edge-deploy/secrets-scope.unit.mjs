// E58: o deploy so' reescreve secrets quando precisa, e nunca em rollback.
//
// Antes: 4 blocos de escrita condicionados apenas ao ESCOPO da funcao, nunca ao
// fato de o valor ter mudado -- todo deploy reescrevia 7 secrets, inclusive em
// rollback. A decisao virou modulo testavel em vez de condicional espalhada no
// YAML.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import {
  decidirReescrita,
  extrairNomesDeSecrets,
  nomesDeSecretsParaEscopo,
  NOMES_GERAIS,
  NOMES_POR_ESCOPO,
} from './secrets-scope.mjs';

const workflow = await readFile(new URL('../../.github/workflows/deploy-functions.yml', import.meta.url), 'utf8');
const TODOS = [...NOMES_GERAIS, ...Object.values(NOMES_POR_ESCOPO).flat()];

test('E58: o escopo define exatamente os nomes que o deploy escreveria', () => {
  assert.deepEqual(nomesDeSecretsParaEscopo(''), [...TODOS].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)), 'deploy total escreve todos');
  assert.deepEqual(nomesDeSecretsParaEscopo('crm-integration'), ['CRON_SECRET', 'EXTERNAL_SUPABASE_SERVICE_ROLE_KEY', 'EXTERNAL_SUPABASE_URL'].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  assert.deepEqual(nomesDeSecretsParaEscopo('promogifts-catalog'), ['CRON_SECRET', 'PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY', 'PROMOGIFTS_SUPABASE_URL'].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  assert.deepEqual(nomesDeSecretsParaEscopo('fetch-link-preview'), ['CRON_SECRET', 'PREVIEW_EGRESS_PROXY_URL', 'PREVIEW_EGRESS_SHARED_SECRET'].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  assert.deepEqual(nomesDeSecretsParaEscopo('talkx-send'), ['CRON_SECRET'], 'escopo sem bloco de secrets nao inventa nome');
});

test('E58: rollback NUNCA reescreve (nem com rotate_secrets ligado)', () => {
  const r = decidirReescrita({ rotateSecrets: true, emRollback: true, nomesRemotos: ['CRON_SECRET'], nomesEsperados: TODOS });
  assert.equal(r.reescrever, false);
  assert.match(r.motivo, /rollback/);
});

test('E58: deploy normal com os nomes presentes nao reescreve e diz isso no log', () => {
  const r = decidirReescrita({ nomesRemotos: TODOS, nomesEsperados: nomesDeSecretsParaEscopo('') });
  assert.equal(r.reescrever, false);
  assert.match(r.motivo, /secrets inalterados/);
});

test('E58: nome ausente no projeto e divergencia medivel → reescreve e nomeia', () => {
  const r = decidirReescrita({
    nomesRemotos: TODOS.filter((n) => n !== 'PROMOGIFTS_SUPABASE_URL'),
    nomesEsperados: nomesDeSecretsParaEscopo(''),
  });
  assert.equal(r.reescrever, true);
  assert.match(r.motivo, /PROMOGIFTS_SUPABASE_URL/);
});

test('E58: rotate_secrets=true reescreve por decisao do operador', () => {
  const r = decidirReescrita({ rotateSecrets: true, nomesRemotos: TODOS, nomesEsperados: nomesDeSecretsParaEscopo('') });
  assert.equal(r.reescrever, true);
  assert.match(r.motivo, /rotate_secrets/);
});

test('E58: leitura do remoto falhando cai no comportamento anterior (reescrever), nunca em silencio', () => {
  const r = decidirReescrita({ nomesRemotos: null, nomesEsperados: nomesDeSecretsParaEscopo('') });
  assert.equal(r.reescrever, true);
  assert.match(r.motivo, /nao foi possivel ler/);
});

test('E58: extrai nomes das formas plausiveis e devolve null no que nao reconhece', () => {
  assert.deepEqual(extrairNomesDeSecrets('[{"name":"CRON_SECRET","digest":"abc"}]'), ['CRON_SECRET']);
  assert.deepEqual(extrairNomesDeSecrets('{"secrets":[{"name":"A_B"}]}'), ['A_B']);
  assert.deepEqual(
    extrairNomesDeSecrets('NAME  DIGEST\nCRON_SECRET  3f9a\noutro_secret  1111'),
    ['CRON_SECRET'],
    'a tabela de texto entrega os nomes; minusculo nao e nome de secret e fica fora',
  );
  for (const entrada of ['', 'nao e json nem tabela', '{"outra":"forma"}', '[]']) {
    assert.equal(extrairNomesDeSecrets(entrada), null, `deveria devolver null: ${JSON.stringify(entrada)}`);
  }
});

test('E58: o workflow declara o input e guarda as 4 escritas pela decisao (pin)', () => {
  assert.match(workflow, /^ {6}rotate_secrets:$/m, 'input rotate_secrets tem de existir');
  assert.match(workflow, /secrets-scope\.mjs/, 'a decisao tem de ser calculada pelo modulo testado');
  const guardas = workflow.match(/if \[ "\$REESCREVER" = "true" \]; then/g) ?? [];
  assert.equal(guardas.length, 4, `cada uma das 4 escritas precisa da guarda (achei ${guardas.length})`);
});

test('preflight empresarial do CRM e sintaticamente valido no shell do runner', () => {
  const inicio = workflow.indexOf("            while IFS='|' read -r TABELA COLUNAS; do");
  const fim = workflow.indexOf('            if [ "$REESCREVER" = "true" ]; then', inicio);
  assert.notEqual(inicio, -1, 'inicio do preflight empresarial precisa existir');
  assert.notEqual(fim, -1, 'fim do preflight empresarial precisa existir');

  const trechoDoRunner = workflow
    .slice(inicio, fim)
    .split('\n')
    .map((linha) => (linha.startsWith('          ') ? linha.slice(10) : linha))
    .join('\n');
  const resultado = spawnSync('/usr/bin/bash', ['-n'], { input: trechoDoRunner, encoding: 'utf8' });

  assert.equal(resultado.status, 0, resultado.stderr);
});
