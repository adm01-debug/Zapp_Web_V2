import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avaliarWorkflow, guarda, semComentarios, uploads, usaCredencial } from './check-e2e-artifact-secrets.mjs';

const COM_CREDENCIAL_E_REPORT = `
name: exemplo
on: [push]
jobs:
  e2e:
    steps:
      - run: bun run test:e2e -- --project=setup
        env:
          E2E_TEST_EMAIL: \${{ secrets.E2E_TEST_EMAIL }}
          E2E_TEST_PASSWORD: \${{ secrets.E2E_TEST_PASSWORD }}
      - uses: actions/upload-artifact@aaa
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
`;

const CREDENCIAL_SO_EM_COMENTARIO = `
name: exemplo
# Removemos E2E_TEST_EMAIL/PASSWORD daqui justamente para poder ser pull_request.
on: [pull_request]
jobs:
  x:
    steps:
      - uses: actions/upload-artifact@aaa
        with:
          path: playwright-report/
`;

const REPORT_SEM_CREDENCIAL = `
name: exemplo
on: [pull_request]
jobs:
  x:
    steps:
      - run: bun run test:e2e
      - uses: actions/upload-artifact@aaa
        if: always()
        with:
          path: playwright-report/
`;

const CREDENCIAL_SEM_REPORT = `
name: exemplo
on: [push]
jobs:
  x:
    steps:
      - run: bun run test:e2e -- --project=setup
        env:
          E2E_TEST_PASSWORD: \${{ secrets.E2E_TEST_PASSWORD }}
`;

test('reprova: credencial + publicacao do report', () => {
  const v = avaliarWorkflow('com-cred.yml', COM_CREDENCIAL_E_REPORT);
  assert.equal(v.length, 1, 'deve acusar exatamente uma violacao');
  assert.match(v[0], /playwright-report/);
  assert.match(v[0], /linha \d+/);
});

test('aprova: credencial citada apenas em comentario', () => {
  assert.equal(usaCredencial(CREDENCIAL_SO_EM_COMENTARIO), false);
  assert.deepEqual(avaliarWorkflow('so-comentario.yml', CREDENCIAL_SO_EM_COMENTARIO), []);
});

test('aprova: report publicado por workflow sem credencial (o caso do ci.yml)', () => {
  assert.deepEqual(avaliarWorkflow('sem-cred.yml', REPORT_SEM_CREDENCIAL), []);
});

test('aprova: workflow com credencial que nao publica nada (o caso do e2e-logado.yml)', () => {
  assert.equal(usaCredencial(CREDENCIAL_SEM_REPORT), true);
  assert.deepEqual(avaliarWorkflow('cred-sem-artifact.yml', CREDENCIAL_SEM_REPORT), []);
});

test('comentario de prosa nao vira caminho nem credencial', () => {
  assert.equal(semComentarios('# E2E_TEST_EMAIL\n  x: 1 # playwright-report/').includes('E2E_TEST_EMAIL'), false);
  assert.deepEqual(uploads(CREDENCIAL_SO_EM_COMENTARIO).map((u) => u.caminho), ['playwright-report/']);
});

const COM_CREDENCIAL_E_REDACAO_COMPLETA = `
name: exemplo
on: [push]
jobs:
  e2e:
    steps:
      - run: bun run test:e2e -- --project=setup
        env:
          E2E_TEST_EMAIL: \${{ secrets.E2E_TEST_EMAIL }}
          E2E_TEST_PASSWORD: \${{ secrets.E2E_TEST_PASSWORD }}
      - name: redigir
        id: redigir
        run: node scripts/ci/redigir-relatorio.mjs playwright-report --segredo-env=E2E_TEST_EMAIL --segredo-env=E2E_TEST_PASSWORD
      - uses: actions/upload-artifact@aaa
        if: failure() && steps.redigir.outcome == 'success'
        with:
          path: playwright-report/
`;

test('aprova: report publicado DEPOIS de redigir as duas credenciais', () => {
  assert.deepEqual(avaliarWorkflow('redigido.yml', COM_CREDENCIAL_E_REDACAO_COMPLETA), []);
});

test('reprova: redacao so do e-mail -- a senha digitada vaza igual', () => {
  const soEmail = COM_CREDENCIAL_E_REDACAO_COMPLETA.replace(' --segredo-env=E2E_TEST_PASSWORD', '');
  const v = avaliarWorkflow('so-email.yml', soEmail);
  assert.equal(v.length, 1, 'sem cobrir a senha, a excecao nao vale');
  assert.match(v[0], /sem redigir as credenciais/);
});

test('reprova: redacao existe mas o upload nao depende dela', () => {
  const semGuarda = COM_CREDENCIAL_E_REDACAO_COMPLETA.replace(
    "if: failure() && steps.redigir.outcome == 'success'",
    'if: failure()',
  );
  assert.equal(
    avaliarWorkflow('sem-guarda.yml', semGuarda).length,
    1,
    'se a redacao falhar, o upload publicaria o report cru',
  );
});

test('o repositorio real esta em conformidade hoje', () => {
  assert.deepEqual(guarda('.github/workflows'), [],
    'se falhar, algum workflow passou a publicar o report junto das credenciais');
});
