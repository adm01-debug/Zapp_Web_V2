import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// E81 · G-05 · docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md:
//   `retries: process.env.CI ? 2 : 0` SÓ para os projetos logados;
//   `trace: 'retain-on-failure'`; `video: 'off'`.
//
// POR QUE separar logado de deslogado: os projetos logados dependem da rede real
// (login E2E_TEST_EMAIL/E2E_TEST_PASSWORD e backend de verdade) e por isso podem
// repetir; os deslogados usam backend mockado e determinístico, onde repetir só
// triplica o tempo da falha real e esconde o defeito. Sem retries neles, a suíte
// deslogada do ci.yml fecha em menos de 2 min — é a verificação do E81.
//
// O config é lido como TEXTO de propósito: importá-lo exigiria resolver o ambiente
// do Playwright, e o que precisa ficar travado é o que o arquivo DECLARA.

const RAIZ = new URL('../../', import.meta.url);
const ler = (rel) => readFileSync(new URL(rel, RAIZ), 'utf8');

/** Nomes de projeto passados ao Playwright em cada invocação de `bun run test:e2e`. */
function projetosNoWorkflow(yaml) {
  const nomes = [];
  for (const linha of yaml.split('\n')) {
    if (!linha.includes('bun run test:e2e')) continue;
    for (const m of linha.matchAll(/--project=([a-z0-9-]+)/g)) nomes.push(m[1]);
  }
  return nomes;
}

/** Blocos `{ ... }` de topo do array `projects:` do playwright.config.ts. */
function blocosDeProjeto(ts) {
  const inicio = ts.indexOf('projects: [');
  assert.notEqual(inicio, -1, 'playwright.config.ts tem de declarar o array `projects`');
  // Remove comentários para que chaves em texto não confundam o casador de chaves.
  const trecho = ts.slice(inicio).replace(/\/\/[^\n]*/g, '');
  let profundidade = 0;
  let inicioBloco = -1;
  const blocos = [];
  for (let k = 0; k < trecho.length; k++) {
    const c = trecho[k];
    if (c === '{') {
      if (profundidade === 0) inicioBloco = k;
      profundidade++;
    } else if (c === '}') {
      profundidade--;
      if (profundidade === 0) blocos.push(trecho.slice(inicioBloco, k + 1));
    } else if (c === ']' && profundidade === 0) {
      break;
    }
  }
  assert.ok(blocos.length > 0, 'não consegui separar os projetos do playwright.config.ts');
  return blocos;
}

function projetosDoConfig(ts) {
  const mapa = new Map();
  for (const bloco of blocosDeProjeto(ts)) {
    const m = /name:\s*'([^']+)'/.exec(bloco);
    assert.ok(m, `bloco de projeto sem \`name\`: ${bloco.slice(0, 60)}`);
    mapa.set(m[1], bloco);
  }
  return mapa;
}

const config = ler('playwright.config.ts');
const projetos = projetosDoConfig(config);

/**
 * Um projeto é "logado" quando depende do login real: é o próprio `setup` (que faz o
 * login) ou declara `dependencies: ['setup']` / `storageState` apontando para a sessão
 * gravada em e2e/.auth/user.json (uma STRING). `storageState: { cookies: [], origins: [] }`
 * (objeto vazio, caso do `chromium-telefonia`) é o oposto — zera a sessão de propósito —,
 * então não conta como login real; só a referência em string ao arquivo da sessão conta.
 * Sessão FALSA via `installFakeSession` também não conta.
 */
function ehLogado(nome, bloco) {
  return (
    nome === 'setup' ||
    /dependencies:\s*\[\s*'setup'/.test(bloco) ||
    /storageState:\s*'/.test(bloco)
  );
}

const logados = [...projetos].filter(([nome, bloco]) => ehLogado(nome, bloco)).map(([n]) => n);
const deslogados = [...projetos].filter(([nome, bloco]) => !ehLogado(nome, bloco)).map(([n]) => n);

test('E81: a constante dos logados vale 2 em CI e 0 fora dele', () => {
  assert.match(
    config,
    /const RETRIES_LOGADOS = process\.env\.CI \? 2 : 0;/,
    'RETRIES_LOGADOS tem de valer `process.env.CI ? 2 : 0`',
  );
});

test('E81: o retries global e 0 -- projeto deslogado nao repete', () => {
  const cabecalho = config.slice(0, config.indexOf('projects: ['));
  assert.match(cabecalho, /retries:\s*0,/, 'o `retries` global tem de ser 0');
  assert.doesNotMatch(
    cabecalho,
    /retries:\s*process\.env\.CI/,
    'o retries cego em CI, que valia para TODOS os projetos, nao pode voltar',
  );
});

test('E81: todo projeto logado repete 2x em CI', () => {
  assert.ok(logados.length >= 8, `esperava os ~10 projetos logados, achei ${logados.length}`);
  for (const nome of logados) {
    assert.match(
      projetos.get(nome),
      /retries:\s*RETRIES_LOGADOS/,
      `${nome} depende do login real e tem de declarar ` + '`retries: RETRIES_LOGADOS`',
    );
  }
});

test('E81: projeto deslogado nao declara retries nenhum', () => {
  assert.ok(deslogados.length > 0, 'esperava projetos deslogados no config');
  for (const nome of deslogados) {
    assert.doesNotMatch(
      projetos.get(nome),
      /retries:/,
      `${nome} roda com backend mockado: repetir so triplicaria o tempo da falha real`,
    );
  }
});

test('E81: a suite deslogada do ci.yml nao paga o custo do retry', () => {
  const doCi = projetosNoWorkflow(ler('.github/workflows/ci.yml'));
  assert.equal(doCi.length, 0, 'CI mínimo não executa E2E por PR');
  for (const nome of doCi) {
    assert.ok(
      deslogados.includes(nome),
      `"${nome}" esta no ci.yml (workflow de PR, sem login) e por isso nao pode ser logado`,
    );
  }
});

test('E81: trace retain-on-failure e video off, sem on-first-retry', () => {
  const inicio = config.indexOf('\n  use: {');
  assert.notEqual(inicio, -1, 'o config tem de declarar um `use` global');
  const fim = config.indexOf('\n  },', inicio);
  assert.notEqual(fim, -1, 'nao consegui delimitar o `use` global');
  const blocoUse = config.slice(inicio, fim);
  assert.match(blocoUse, /trace:\s*'retain-on-failure'/, "use.trace tem de ser 'retain-on-failure'");
  assert.match(blocoUse, /video:\s*'off'/, "use.video tem de ser 'off'");
  assert.doesNotMatch(
    config,
    /'on-first-retry'/,
    "o trace antigo ('on-first-retry') nao pode voltar: ele nao guarda o trace quando o 1o retry passa",
  );
});
