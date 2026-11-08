import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { corpoDe, eLoginFalhou, marcadorDe, nomesDeTestResults, PREFIXO, tituloDe } from './marcador-specs.mjs';
import { conditionOf, jobOf, jobsOf, nestedValue, onlyStep, permission, scriptOf, shellCode, stepsOf, valueOf } from './workflow-test-support.mjs';

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

test('E83: o corpo da issue lista os testes e explica a falha sem test-results', () => {
  const corpo = corpoDe(['b', 'a']);
  assert.match(corpo, /\*\*2\*\* teste\(s\)/);
  assert.match(corpo, /- `a`\n- `b`/, 'lista ordenada, um por linha');
  assert.match(corpoDe([]), /sem deixar `test-results\/`/);
});

test('E83: o workflow alerta em falha, fecha ao recuperar, e as permissoes ficam no JOB', () => {
  const y = readFileSync(new URL('../../.github/workflows/e2e-logado.yml', import.meta.url), 'utf8');
  const topo = y.slice(0, y.indexOf('jobs:'));
  const job = jobOf(y, 'e2e-logado');
  const steps = stepsOf(job);
  const playwright = onlyStep(steps, (s) => /^\s*bash scripts\/e2e-isolated\/run\.sh suite\b/m.test(shellCode(s)), 'controller Playwright isolado');
  const alerta = onlyStep(steps, (s) => scriptOf(s).includes('github.rest.issues.create('), 'alerta');
  const fechamentos = [...jobsOf(y)].flatMap(([id, bloco]) => stepsOf(bloco)
    .filter((s) => /state:\s*['"]closed['"]/.test(scriptOf(s))).map((step) => ({ id, bloco, step })));
  assert.equal(fechamentos.length, 1, 'um unico fechamento');
  const fecha = fechamentos[0];
  assert.notEqual(fecha.id, 'e2e-logado', 'recuperacao espera o resultado da matriz inteira');
  assert.match(valueOf(fecha.bloco, 'needs', 4) ?? '', /^(?:e2e-logado|\[\s*e2e-logado\s*\])$/);
  assert.notEqual(permission(topo, 'issues', 0), 'write', 'escrita fica no job');
  for (const [bloco, step] of [[job, alerta], [fecha.bloco, fecha.step]]) {
    assert.equal(permission(bloco, 'issues'), 'write');
    assert.match(valueOf(step, 'uses') ?? '', /^actions\/github-script@[0-9a-f]{40}$/);
    assert.equal(nestedValue(step, 'env', 'TITULO'), '[e2e-logado] Suíte logada quebrada na main');
  }
  assert.match(scriptOf(alerta), /await import\(\s*`[^`]*\/scripts\/ci\/marcador-specs\.mjs`\s*\)/, 'o corpo executado importa o marcador testado');
  assert.ok(steps.indexOf(alerta) > steps.indexOf(playwright), 'o alerta le os resultados depois do Playwright');
  assert.equal(conditionOf(alerta), "failure() && steps.checkout.outcome == 'success'");
  assert.equal(conditionOf(fecha.step), 'success()');
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

