import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// O app carrega `@axe-core/react` em DEV e re-audita a arvore React a cada ciclo
// de render. O E2E roda contra o MESMO dev server, entao a pagina de teste
// recebia 4.559.240 bytes de axe do app (medido em 16/11/2026, HTTP 200 em
// /node_modules/.vite/deps/@axe-core_react.js) alem dos 580 KB que as specs
// injetam. Isso derrubava o processo de conteudo do Firefox com `Page crashed`
// nos testes do painel CRM (email-navy-visual.spec.ts:343 e :418).
//
// A auditoria do app so escreve aviso no console; quem AFIRMA acessibilidade sao
// as specs, cada uma com o seu proprio axe. Este guard trava as duas pontas: a
// auditoria continua existindo em DEV para o desenvolvedor, e nao entra sob
// automacao.
const main = readFileSync(new URL('../../src/main.tsx', import.meta.url), 'utf8');
const playwright = readFileSync(new URL('../../playwright.config.ts', import.meta.url), 'utf8');

test('a auditoria continua do axe nao roda sob automacao', () => {
  const guarda = /if \(\s*import\.meta\.env\.DEV\s*&&\s*import\.meta\.env\.VITE_A11Y_AUDIT_CONTINUO !== 'off'\s*&&\s*!navigator\.webdriver\s*\)\s*\{/.exec(main);
  assert.ok(
    guarda,
    'src/main.tsx tem de condicionar a auditoria do axe aos TRES termos: ' +
      "`import.meta.env.DEV && import.meta.env.VITE_A11Y_AUDIT_CONTINUO !== 'off' && !navigator.webdriver`. " +
      'Sem a flag, o E2E volta a carregar 4,3 MB de axe por teste no Firefox (onde `navigator.webdriver` ' +
      'nao e confiavel) e o processo de conteudo cai em Page crashed',
  );
  const depois = main.slice(guarda.index);
  assert.match(
    depois.slice(0, 600),
    /@axe-core\/react/,
    'a guarda tem de ser a do bloco que importa @axe-core/react, nao de outro bloco de DEV',
  );
});

test('o bloco do axe nao tem outra entrada sem a guarda', () => {
  const importacoes = [...main.matchAll(/import\('@axe-core\/react'\)/g)];
  assert.equal(
    importacoes.length,
    1,
    'ha mais de uma importacao de @axe-core/react em src/main.tsx: cada uma precisaria da mesma guarda',
  );
});

// A guarda do app so vale se alguem DEFINIR a flag sob E2E. Sem esta assercao, o
// arquivo voltaria a ser o que era: conferencia de string no fonte, que passa verde
// mesmo quando a mudanca nao tem efeito nenhum em execucao -- foi assim que a #3190
// foi declarada resolvida enquanto o Firefox continuava caindo.
test('o webServer do Playwright define VITE_A11Y_AUDIT_CONTINUO=off', () => {
  assert.match(
    playwright,
    /command: `[^`]*VITE_A11Y_AUDIT_CONTINUO=off[^`]*bun run dev/,
    'playwright.config.ts tem de passar VITE_A11Y_AUDIT_CONTINUO=off no `command` do webServer: ' +
      'o Vite le VITE_* do ambiente do processo que ele sobe',
  );
  assert.match(
    playwright,
    /VITE_A11Y_AUDIT_CONTINUO: 'off',/,
    "playwright.config.ts tem de declarar VITE_A11Y_AUDIT_CONTINUO: 'off' no bloco `env` do webServer",
  );
});

// As assercoes acima conferem TEXTO. Esta confere o CANO: que uma variavel de
// PROCESSO com prefixo `VITE_` realmente chega ao `import.meta.env` que o app
// le. Sem isto, o arquivo inteiro voltaria a ser o que era -- conferencia de
// string que passa verde mesmo quando a mudanca nao tem efeito em execucao.
//
// Importa: no DEV SERVER o Vite NAO substitui `import.meta.env.VITE_*` por
// literal (medido: o `/src/main.tsx` servido sai identico com e sem a flag, com
// a busca em objeto preservada). Quem resolve o valor e o `loadEnv` do proprio
// Vite, em tempo de execucao. Entao e o `loadEnv` que tem de ser interrogado.
test('a flag de processo chega ao import.meta.env que o app le', async () => {
  const { loadEnv } = await import('vite');
  const raiz = new URL('../../', import.meta.url).pathname;
  const anterior = process.env.VITE_A11Y_AUDIT_CONTINUO;

  try {
    process.env.VITE_A11Y_AUDIT_CONTINUO = 'off';
    const comFlag = loadEnv('development', raiz, 'VITE_');
    assert.equal(
      comFlag.VITE_A11Y_AUDIT_CONTINUO,
      'off',
      'o Vite tem de expor VITE_A11Y_AUDIT_CONTINUO do ambiente do processo; sem isto o ' +
        '`command` do webServer nao desliga nada e o axe do app volta para dentro do E2E',
    );
    // A guarda do app, avaliada com esse valor: tem de ser FALSA.
    assert.equal(comFlag.VITE_A11Y_AUDIT_CONTINUO !== 'off', false);

    delete process.env.VITE_A11Y_AUDIT_CONTINUO;
    const semFlag = loadEnv('development', raiz, 'VITE_');
    assert.equal(semFlag.VITE_A11Y_AUDIT_CONTINUO, undefined);
    // Sem a flag a guarda e VERDADEIRA -- e o estado em que o Firefox caia.
    assert.equal(semFlag.VITE_A11Y_AUDIT_CONTINUO !== 'off', true);
  } finally {
    if (anterior === undefined) delete process.env.VITE_A11Y_AUDIT_CONTINUO;
    else process.env.VITE_A11Y_AUDIT_CONTINUO = anterior;
  }
});
