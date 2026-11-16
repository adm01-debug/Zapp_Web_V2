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

test('a auditoria continua do axe nao roda sob automacao', () => {
  const guarda = /if \(import\.meta\.env\.DEV && !navigator\.webdriver\) \{/.exec(main);
  assert.ok(
    guarda,
    'src/main.tsx tem de condicionar a auditoria do axe a `import.meta.env.DEV && !navigator.webdriver`: ' +
      'sem o segundo termo o E2E volta a carregar 4,3 MB de axe por teste e o Firefox cai em Page crashed',
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
