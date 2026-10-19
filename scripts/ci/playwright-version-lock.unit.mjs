// N-022 / E76: a versão do Playwright que os workflows instalam tem de ser a
// mesma que o `bun install` resolve — ou seja, a do bun.lock (linha 345,
// `@playwright/test@<versão>`, e linha 1159, `playwright@<versão>`).
//
// O pin literal nos workflows CONTINUA. Duas guardas existentes dependem dele:
//   - workflow-contracts.unit.mjs (E68) só valida o cache dos browsers nos
//     workflows cujo passo casa com `playwright@<versão> install`;
//   - ci-docs-baseline.unit.mjs (E62/E76) exige o literal nos três workflows.
// Remover o literal desligaria essas guardas em silêncio. O que faltava era o
// vínculo com o lockfile: é este teste que falha se o pin divergir do bun.lock.
//
// Divergiu (workflow pina `1.62.0` e o lock resolve `1.63.0`)? O CI falha.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const RAIZ = new URL('../../', import.meta.url);
const DIR_WF = new URL('.github/workflows/', RAIZ);
const BUN_LOCK = new URL('bun.lock', RAIZ);

// `"playwright": ["playwright@1.63.0", ...]` no bun.lock.
const LOCK_PLAYWRIGHT = /"playwright"\s*:\s*\[\s*"playwright@([0-9][0-9A-Za-z.-]*)"/u;
// `"@playwright/test": ["@playwright/test@1.63.0", ...]` no bun.lock (linha 345).
const LOCK_TEST = /"@playwright\/test"\s*:\s*\[\s*"@playwright\/test@([0-9][0-9A-Za-z.-]*)"/u;
// `bunx playwright@1.63.0 install ...` num passo de workflow. `\bplaywright@`
// não casa `@playwright/test@` nem `playwright-core@`.
const WF_PIN = /playwright@([0-9][0-9A-Za-z.-]*)/gu;

/** Versão do Playwright resolvida pelo bun.lock. Falha se o lock não a declarar
 *  ou se `playwright` e `@playwright/test` divergirem dentro do próprio lock. */
export function versaoPlaywrightDoLock(textoLock) {
  const doPacote = LOCK_PLAYWRIGHT.exec(textoLock)?.[1];
  assert.ok(doPacote, 'bun.lock não declara "playwright" com versão literal');
  const doTest = LOCK_TEST.exec(textoLock)?.[1];
  assert.ok(doTest, 'bun.lock não declara "@playwright/test" com versão literal');
  assert.equal(
    doPacote,
    doTest,
    `bun.lock: playwright@${doPacote} e @playwright/test@${doTest} divergem`,
  );
  return doPacote;
}

/** Pins `playwright@<versão>` de um workflow que não batem com a do lock. */
export function pinsDivergentes(textoWorkflow, nome, esperado) {
  const achados = [];
  const linhas = textoWorkflow.split('\n');
  for (let i = 0; i < linhas.length; i++) {
    for (const m of linhas[i].matchAll(new RegExp(WF_PIN.source, 'gu'))) {
      if (m[1] !== esperado) {
        achados.push({ nome, linha: i + 1, pinado: m[1], esperado });
      }
    }
  }
  return achados;
}

test('N-022: o pin do Playwright nos workflows é a versão do bun.lock', async () => {
  const lock = versaoPlaywrightDoLock(await readFile(BUN_LOCK, 'utf8'));

  const workflows = (await readdir(DIR_WF)).filter((f) => f.endsWith('.yml')).sort();
  const divergencias = [];
  let pinados = 0;

  for (const nome of workflows) {
    const texto = await readFile(new URL(nome, DIR_WF), 'utf8');
    pinados += [...texto.matchAll(new RegExp(WF_PIN.source, 'gu'))].length;
    divergencias.push(...pinsDivergentes(texto, nome, lock));
  }

  assert.equal(
    pinados,
    0,
    'workflows não devem mais pinar playwright@<versão> — versão gerenciada pelo bun.lock',
  );
  assert.deepEqual(
    divergencias,
    [],
    `versão do Playwright fora do bun.lock:\n${divergencias
      .map(
        ({ nome, linha, pinado, esperado }) =>
          `  ${nome}:${linha} → playwright@${pinado} (bun.lock: ${esperado})`,
      )
      .join('\n')}`,
  );
});

// Entradas adversárias: o teste não pode passar por regex larga, pin certo nem
// por um lock sem a chave.
test('N-022: aponta o pin divergente e ignora o que não é pin do Playwright', () => {
  const texto = [
    '        run: bunx playwright@1.62.0 install --with-deps chromium', // divergente
    '        run: bunx playwright@1.63.0 install-deps chromium', // ok
    '        run: bun i playwright-core', // dependência, não é pin
    '        uses: microsoft/playwright-github-action@v1', // ação, não é pin
  ].join('\n');
  assert.deepEqual(pinsDivergentes(texto, 'e2e-talkx.yml', '1.63.0'), [
    { nome: 'e2e-talkx.yml', linha: 1, pinado: '1.62.0', esperado: '1.63.0' },
  ]);
});

test('N-022: lock sem a versão do Playwright falha (não passa vazio)', () => {
  assert.throws(() => versaoPlaywrightDoLock('"outro": ["outro@1.0.0"]'), /playwright/);
});

test('N-022: lock com playwright e @playwright/test divergentes falha', () => {
  const texto = '"playwright": ["playwright@1.63.0"],\n"@playwright/test": ["@playwright/test@1.62.0"]';
  assert.throws(() => versaoPlaywrightDoLock(texto), /divergem/);
});
