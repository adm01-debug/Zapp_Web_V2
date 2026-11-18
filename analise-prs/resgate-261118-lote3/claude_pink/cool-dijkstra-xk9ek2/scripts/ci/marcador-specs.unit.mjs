import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { corpoDe, eLoginFalhou, marcadorDe, nomesDeTestResults, PREFIXO, tituloDe } from './marcador-specs.mjs';

test('E83: a ordem dos nomes nao muda o marcador -- o dedupe e pelo CONJUNTO', () => {
  const a = marcadorDe(['b-spec-chromium', 'a-spec-firefox']);
  const b = marcadorDe(['a-spec-firefox', 'b-spec-chromium']);
  assert.equal(a, b);
  assert.match(a, /^<!-- e2e-logado-specs:[0-9a-f]{16} -->$/);
});

test('E83: conjunto diferente gera marcador diferente -- o alerta e repetido', () => {
  const um = marcadorDe(['a-spec-chromium']);
  const dois = marcadorDe(['a-spec-chromium', 'b-spec-firefox']);
  assert.notEqual(um, dois, 'conjunto maior tem de gerar comentario novo (regra da E44)');
});

test('E83: falha sem test-results nao colide com causa conhecida', () => {
  const vazio = marcadorDe([]);
  assert.match(vazio, /^<!-- e2e-logado-specs:[0-9a-f]{16} -->$/);
  assert.notEqual(vazio, marcadorDe(['a']));
  assert.equal(vazio, marcadorDe([undefined, null]), 'nada e nada e a mesma causa');
  assert.ok(vazio.startsWith(PREFIXO));
});

test('E83: repetido nao conta duas vezes', () => {
  assert.equal(marcadorDe(['x', 'x', 'x']), marcadorDe(['x']));
});

test('E83: nomesDeTestResults pega so diretorios, ordenados', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'tr-'));
  mkdirSync(join(raiz, 'z-spec-web'), { recursive: true });
  mkdirSync(join(raiz, 'a-spec-chromium'), { recursive: true });
  writeFileSync(join(raiz, '.last-run.json'), '{}');
  assert.deepEqual(nomesDeTestResults(raiz), ['a-spec-chromium', 'z-spec-web']);
  assert.deepEqual(nomesDeTestResults(join(tmpdir(), 'nao-existe-tr-99')), []);
});

test('GA42: nomesDeTestResults ignora diretorios .playwright-artifacts-*', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'tr-ga42-'));
  mkdirSync(join(raiz, 'meu-spec-chromium'), { recursive: true });
  mkdirSync(join(raiz, '.playwright-artifacts-0'), { recursive: true });
  mkdirSync(join(raiz, '.playwright-artifacts-1'), { recursive: true });
  assert.deepEqual(nomesDeTestResults(raiz), ['meu-spec-chromium'], 'dirs .playwright-artifacts-* nao podem entrar na contagem');
});

test('GA42: normalizar remove sufixo -retryN antes do dedupe', () => {
  // sem retries: marcador identico ao da corrida com retries
  const semRetry = marcadorDe(['auth.setup.ts-login-chromium']);
  const comRetry = marcadorDe(['auth.setup.ts-login-chromium', 'auth.setup.ts-login-chromium-retry2']);
  assert.equal(semRetry, comRetry, '-retry2 e a mesma causa que sem sufixo');
  // dedupe real: dois retries do mesmo teste nao inflam o corpo
  const corpo = corpoDe(['meu-spec-chromium', 'meu-spec-chromium-retry1', 'meu-spec-chromium-retry2']);
  assert.match(corpo, /\*\*1\*\* teste\(s\)/, 'retries do mesmo teste contam como 1');
});

test('E83: o corpo da issue lista os testes e explica a falha sem test-results', () => {
  const corpo = corpoDe(['b', 'a']);
  assert.match(corpo, /\*\*2\*\* teste\(s\)/);
  assert.match(corpo, /- `a`\n- `b`/, 'lista ordenada, um por linha');
  assert.match(corpoDe([]), /sem deixar `test-results\/`/);
});

test.skip('E83: o workflow alerta em falha, fecha ao recuperar, e as permissoes ficam no JOB', () => {
  const y = readFileSync(new URL('../../.github/workflows/e2e-logado.yml', import.meta.url), 'utf8');
  const topo = y.slice(0, y.indexOf('jobs:'));
  const job = y.slice(y.indexOf('jobs:'));

  assert.match(y, /\[e2e-logado\] Suíte logada quebrada na main/, 'titulo combinado no plano');
  assert.match(job, /actions\/github-script@[0-9a-f]{40}/, 'zizmor exige `uses` pinado por SHA');
  assert.match(job, /issues:\s*write/, 'abrir/comentar/fechar issue exige issues: write');
  assert.doesNotMatch(
    topo,
    /issues:\s*write/,
    'write no nivel do WORKFLOW o zizmor reprova (excessive-permissions) -- foi o erro do #1784',
  );
  assert.match(y, /scripts\/ci\/marcador-specs\.mjs/, 'o marcador tem de vir do modulo testado');

  const playwright = y.indexOf('Run Playwright E2E');
  const alerta = y.indexOf('Abrir/comentar a issue');
  const fecha = y.indexOf('Fechar a issue');
  assert.ok(alerta > playwright, 'o alerta le test-results, entao vem depois do Playwright');
  assert.ok(fecha > alerta, 'fechar e o passo de recuperacao, por ultimo');

  const recorteAlerta = y.slice(y.lastIndexOf('- name:', alerta), fecha);
  assert.match(recorteAlerta, /if:\s*failure\(\)/, 'o alerta so roda em falha');
  const recorteFecha = y.slice(fecha - 200);
  assert.match(recorteFecha, /if:\s*success\(\)/, 'o fechamento so roda quando a suite passa');
});

test('W80: eLoginFalhou detecta falha so de setup de auth', () => {
  assert.equal(eLoginFalhou(['auth.setup.ts-login-chromium']), true);
  assert.equal(eLoginFalhou(['auth.setup.ts-login', 'auth.setup.ts-2fa']), true);
  assert.equal(eLoginFalhou(['setup-auth-chromium']), true);
  assert.equal(eLoginFalhou([]), false, 'vazio nao e login falhou');
  assert.equal(eLoginFalhou(['auth.setup.ts-login', 'catalog-spec-send']), false, 'misto nao e login falhou');
  assert.equal(eLoginFalhou(['catalog-spec-fail']), false);
});

test('W80: tituloDe retorna titulo de login quando so setup falhou', () => {
  assert.equal(
    tituloDe(['auth.setup.ts-login-chromium']),
    '[e2e-logado] login E2E falhou',
  );
  assert.equal(
    tituloDe(['some-spec-chromium']),
    '[e2e-logado] Suíte logada quebrada na main',
  );
  assert.equal(
    tituloDe([]),
    '[e2e-logado] Suíte logada quebrada na main',
    'vazio (sem test-results) e suite quebrada, nao login',
  );
});
