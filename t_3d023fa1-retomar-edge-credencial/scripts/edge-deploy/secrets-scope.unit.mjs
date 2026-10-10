// E58: o deploy so' reescreve secrets quando precisa, e nunca em rollback.
//
// Antes: 4 blocos de escrita condicionados apenas ao ESCOPO da funcao, nunca ao
// fato de o valor ter mudado -- todo deploy reescrevia 7 secrets, inclusive em
// rollback. A decisao virou modulo testavel em vez de condicional espalhada no
// YAML.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

// R2-INF-001 (auditoria R2, 03/10/2026): o input dry_run prometia "roda tudo ate
// o Deploy exclusive e nao publica nada", mas o passo "Configurar secrets nas
// edges" nao tinha guarda -- um ensaio com rotate_secrets, listagem divergente
// ou listagem falhando reescrevia secrets de funcoes ja publicadas, sem deploy.
// A trava e' dupla, de proposito: o passo de escrita fica atras do input E a
// decisao em modo de ensaio devolve reescrever=false (defesa em profundidade).

test('E58: em ensaio (dry_run) a decisao e sempre MANTER, nas 3 condicoes de reescrita', () => {
  const esperados = nomesDeSecretsParaEscopo('');
  const cenarios = [
    ['rotate_secrets=true', { rotateSecrets: true, nomesRemotos: TODOS, nomesEsperados: esperados }],
    ['nome ausente na listagem', { nomesRemotos: TODOS.filter((n) => n !== 'CRON_SECRET'), nomesEsperados: esperados }],
    ['listagem indisponivel (null)', { nomesRemotos: null, nomesEsperados: esperados }],
  ];
  for (const [nome, args] of cenarios) {
    const r = decidirReescrita({ ...args, emEnsaio: true });
    assert.equal(r.reescrever, false, `${nome}: ensaio nao pode reescrever`);
    assert.match(r.motivo, /dry_run/, `${nome}: o motivo tem de declarar o ensaio`);
  }
});

test('E57: dry_run trava a escrita de secrets e a decisao continua registrando o ensaio (pin)', () => {
  const posDecisao = workflow.indexOf('- name: Decidir se os secrets');
  const posConfigurar = workflow.indexOf('- name: Configurar secrets nas edges');
  const posInventario = workflow.indexOf('- name: Capturar inventario estrutural');
  assert.ok(posDecisao > 0 && posConfigurar > posDecisao && posInventario > posConfigurar, 'ordem dos passos mudou');
  const decisao = workflow.slice(posDecisao, posConfigurar);
  const configurar = workflow.slice(posConfigurar, posInventario);
  assert.match(configurar, /^        if: inputs\.dry_run != true$/m, 'o passo de escrita fica atras do input dry_run');
  assert.match(decisao, /DRY_RUN: \$\{\{ inputs\.dry_run \}\}/, 'o modo de ensaio entra na decisao por env');
  assert.match(decisao, /--dry-run/, 'e e repassado ao secrets-scope.mjs como flag');
  assert.doesNotMatch(decisao, /^        if: /m, 'a decisao segue rodando no ensaio para o plano registrar o motivo');
});

function corpoRunDoPasso(nome) {
  const inicio = workflow.indexOf(`- name: ${nome}`);
  assert.notEqual(inicio, -1, `passo "${nome}" nao encontrado no workflow`);
  let fim = workflow.indexOf('\n      - name:', inicio);
  if (fim === -1) fim = workflow.length;
  const passo = workflow.slice(inicio, fim);
  const marco = passo.indexOf('run: |');
  assert.notEqual(marco, -1, `passo "${nome}" sem bloco run: |`);
  return passo
    .slice(marco + 'run: |'.length)
    .split('\n')
    .map((linha) => (linha.startsWith('          ') ? linha.slice(10) : linha))
    .join('\n');
}

test('E57/E58: CLI falsa prova ZERO secrets set em dry_run, nas 3 condicoes', async () => {
  const decisaoShell = corpoRunDoPasso('Decidir se os secrets das edges precisam ser reescritos');
  const escritas = workflow.match(/if \[ "\$REESCREVER" = "true" \]; then\n[\s\S]*?\n\s*fi\n/g) ?? [];
  assert.equal(escritas.length, 4, `as 4 escritas guardadas por REESCREVER tem de existir (achei ${escritas.length})`);
  const valoresFixture = Object.fromEntries(TODOS.map((n) => [n, `fixture-${n.toLowerCase()}`]));

  const cenarios = [
    ['rotate_secrets=true', { rotate: 'true', lista: TODOS }],
    ['nome ausente na listagem', { rotate: 'false', lista: TODOS.filter((n) => n !== 'CRON_SECRET') }],
    ['listagem indisponivel (null)', { rotate: 'false', lista: null }],
  ];

  for (const [nome, { rotate, lista }] of cenarios) {
    const dir = await mkdtemp(join(tmpdir(), 'secrets-scope-'));
    const toolDir = join(dir, 'edge-tooling', 'scripts', 'edge-deploy');
    await mkdir(toolDir, { recursive: true });
    await copyFile(new URL('./secrets-scope.mjs', import.meta.url), join(toolDir, 'secrets-scope.mjs'));
    const bin = join(dir, 'bin');
    await mkdir(bin);
    const log = join(dir, 'supabase.log');
    const listaFixture = join(dir, 'lista.json');
    if (lista !== null) await writeFile(listaFixture, JSON.stringify(lista.map((n) => ({ name: n }))));
    await writeFile(
      join(bin, 'supabase'),
      `#!/usr/bin/env bash
echo "$*" >> "$SUPABASE_FAKE_LOG"
if [ "\${1:-}" = "secrets" ] && [ "\${2:-}" = "list" ]; then
  [ -f "$SUPABASE_FAKE_LISTA" ] || exit 1
  cat "$SUPABASE_FAKE_LISTA"
fi
exit 0
`,
      { mode: 0o755 },
    );
    const ghOut = join(dir, 'gh-output');
    const env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      RUNNER_TEMP: dir,
      GITHUB_OUTPUT: ghOut,
      SUPABASE_FAKE_LOG: log,
      SUPABASE_FAKE_LISTA: lista === null ? join(dir, 'listagem-indisponivel.json') : listaFixture,
      PROJECT_REF: 'projeto-de-teste',
      FN: '',
      SOURCE_REF: '',
      ROTATE_SECRETS: rotate,
      DRY_RUN: 'true',
      ...valoresFixture,
    };
    const decisao = spawnSync('/usr/bin/bash', ['-c', decisaoShell], { env, encoding: 'utf8' });
    assert.equal(decisao.status, 0, `${nome}: passo de decisao falhou: ${decisao.stderr}`);
    const reescrever = /^reescrever=(.*)$/m.exec(await readFile(ghOut, 'utf8'))?.[1];
    for (const bloco of escritas) {
      const escrita = spawnSync('/usr/bin/bash', ['-c', `set -euo pipefail\n${bloco}`], {
        env: { ...env, REESCREVER: reescrever },
        encoding: 'utf8',
      });
      assert.equal(escrita.status, 0, `${nome}: escrita guardada falhou: ${escrita.stderr}`);
    }
    const registrado = existsSync(log) ? await readFile(log, 'utf8') : '';
    const mutacoes = registrado.split('\n').filter((l) => /^secrets set\b/.test(l));
    assert.equal(mutacoes.length, 0, `${nome}: dry_run vazou ${mutacoes.length}x "secrets set": ${mutacoes.join(' | ')}`);
    assert.equal(reescrever, 'false', `${nome}: a decisao registrada no plano tem de ser MANTER`);
  }
});

test('E57/E58: controle — sem ensaio as 4 escritas acontecem (a prova acima nao e vazia)', async () => {
  const decisaoShell = corpoRunDoPasso('Decidir se os secrets das edges precisam ser reescritos');
  const escritas = workflow.match(/if \[ "\$REESCREVER" = "true" \]; then\n[\s\S]*?\n\s*fi\n/g) ?? [];
  const dir = await mkdtemp(join(tmpdir(), 'secrets-scope-controle-'));
  const toolDir = join(dir, 'edge-tooling', 'scripts', 'edge-deploy');
  await mkdir(toolDir, { recursive: true });
  await copyFile(new URL('./secrets-scope.mjs', import.meta.url), join(toolDir, 'secrets-scope.mjs'));
  const bin = join(dir, 'bin');
  await mkdir(bin);
  const log = join(dir, 'supabase.log');
  const listaFixture = join(dir, 'lista.json');
  await writeFile(listaFixture, JSON.stringify(TODOS.map((n) => ({ name: n }))));
  await writeFile(
    join(bin, 'supabase'),
    `#!/usr/bin/env bash
echo "$*" >> "$SUPABASE_FAKE_LOG"
if [ "\${1:-}" = "secrets" ] && [ "\${2:-}" = "list" ]; then
  cat "$SUPABASE_FAKE_LISTA"
fi
exit 0
`,
    { mode: 0o755 },
  );
  const ghOut = join(dir, 'gh-output');
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    RUNNER_TEMP: dir,
    GITHUB_OUTPUT: ghOut,
    SUPABASE_FAKE_LOG: log,
    SUPABASE_FAKE_LISTA: listaFixture,
    PROJECT_REF: 'projeto-de-teste',
    FN: '',
    SOURCE_REF: '',
    ROTATE_SECRETS: 'true',
    DRY_RUN: 'false',
    ...Object.fromEntries(TODOS.map((n) => [n, `fixture-${n.toLowerCase()}`])),
  };
  const decisao = spawnSync('/usr/bin/bash', ['-c', decisaoShell], { env, encoding: 'utf8' });
  assert.equal(decisao.status, 0, decisao.stderr);
  const reescrever = /^reescrever=(.*)$/m.exec(await readFile(ghOut, 'utf8'))?.[1];
  assert.equal(reescrever, 'true', 'controle: rotate fora de ensaio tem de decidir REESCREVER');
  for (const bloco of escritas) {
    spawnSync('/usr/bin/bash', ['-c', `set -euo pipefail\n${bloco}`], {
      env: { ...env, REESCREVER: reescrever },
      encoding: 'utf8',
    });
  }
  const mutacoes = (await readFile(log, 'utf8')).split('\n').filter((l) => /^secrets set\b/.test(l));
  assert.equal(mutacoes.length, 4, `controle: esperava 4x "secrets set" registradas pela CLI falsa, achei ${mutacoes.length}`);
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
