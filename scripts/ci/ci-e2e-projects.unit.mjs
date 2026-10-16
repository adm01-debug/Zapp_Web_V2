import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// #463 (CAIXA-7c06): o módulo MAPA (E71/E72 picker, E73 cadastro, E74 mapa/pino)
// só era coletado por projetos que vivem no `e2e-logado.yml` (login real, pós-merge).
// O job E2E obrigatório do `ci.yml` não listava `--project=chromium-mapa`, então os
// PRs passavam com E2E VERDE sem executar spec alguma do mapa (ver
// docs/mapa/PLANO_FINALIZACAO_100_ETAPAS_2026-09-29.md, E75).
//
// Este teste trava a regressão e documenta POR QUE a inclusão é permitida: o projeto
// `chromium-mapa` não declara `dependencies`/`storageState` (sessão FALSA via
// installFakeSession, REST/RPC e Mapbox mockados), logo roda em workflow de PR sem
// arrastar E2E_TEST_EMAIL/E2E_TEST_PASSWORD — que
// scripts/ci/check-pr-workflow-secrets.mjs proíbe em `pull_request`.

const RAIZ = new URL('../../', import.meta.url);
const ler = (rel) => readFileSync(new URL(rel, RAIZ), 'utf8');

/** Nomes de projeto passados ao Playwright: na linha `bun run test:e2e`
 *  (job simples) ou nas linhas `projects:` da matriz do e2e-logado.yml
 *  (E83: a run expande `matrix.projects`). Na matriz cada token ja leva o
 *  prefixo de projeto (travado em e2e/quarantine.unit.mjs); aqui o prefixo
 *  e removido para comparar nomes. */
function projetosNoWorkflow(yaml) {
  const nomes = [];
  for (const linha of yaml.split('\n')) {
    if (linha.includes('bun run test:e2e')) {
      for (const m of linha.matchAll(/--project=([a-z0-9-]+)/g)) nomes.push(m[1]);
      continue;
    }
    const matriz = /^\s*projects:\s*(.+)$/.exec(linha);
    if (matriz) {
      for (const token of matriz[1].trim().split(/\s+/)) {
        const m = /^--project=([a-z0-9-]+)$/.exec(token);
        if (m) nomes.push(m[1]);
      }
    }
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

const ciYml = ler('.github/workflows/ci.yml');
const logadoYml = ler('.github/workflows/e2e-logado.yml');
const config = ler('playwright.config.ts');
const doCi = projetosNoWorkflow(ciYml);
const doLogado = projetosNoWorkflow(logadoYml);
const projetos = projetosDoConfig(config);

test('#463: o job E2E obrigatorio do ci.yml coleta o modulo MAPA (chromium-mapa)', () => {
  assert.ok(
    doCi.includes('chromium-mapa'),
    'ci.yml precisa passar --project=chromium-mapa: sem isso os PRs ficam verdes sem ' +
      'executar location-picker/contact-address/contact-map-pin',
  );
});

test('#463: chromium-mapa e deslogado -- por isso pode entrar no job de PR', () => {
  const bloco = projetos.get('chromium-mapa');
  assert.ok(bloco, 'chromium-mapa tem de existir no playwright.config.ts');
  assert.doesNotMatch(
    bloco,
    /dependencies:\s*\[/,
    'chromium-mapa não pode depender do projeto "setup": isso traria o login real ' +
      '(E2E_TEST_EMAIL/E2E_TEST_PASSWORD) para um workflow de pull_request',
  );
  assert.doesNotMatch(
    bloco,
    /storageState:/,
    'chromium-mapa usa sessão FALSA (installFakeSession), não e2e/.auth/user.json',
  );
});

test('#463: chromium-mapa cobre as 3 specs do mapa', () => {
  const bloco = projetos.get('chromium-mapa');
  for (const spec of ['location-picker', 'contact-address', 'contact-map-pin']) {
    assert.match(
      bloco,
      new RegExp(`${spec}\\\\.spec\\\\.ts`),
      `chromium-mapa tem de coletar ${spec}.spec.ts`,
    );
  }
});

test('#463: todo --project= do ci.yml existe de fato no playwright.config.ts', () => {
  assert.ok(doCi.length > 0, 'o job E2E do ci.yml tem de listar projetos explicitamente');
  for (const nome of doCi) {
    assert.ok(projetos.has(nome), `ci.yml referencia o project "${nome}", que não existe no config`);
  }
});

test('#463: nenhum project listado no ci.yml depende de login real', () => {
  for (const nome of doCi) {
    const bloco = projetos.get(nome);
    assert.doesNotMatch(
      bloco,
      /dependencies:\s*\[|storageState:/,
      `"${nome}" no ci.yml arrastaria o login real para um workflow de PR`,
    );
  }
});

// E88 (PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01, G-35): o job E2E de PR do `ci.yml`
// é o caminho mais caro do pipeline e já exercita `auth.spec.ts` pelo projeto
// `chromium`; `firefox-auth`/`webkit-auth` rodavam ali por herança, não por
// precisarem de PR. Passaram para o `e2e-logado.yml`, que já instala os 3 engines: o
// PR deixa de subir 2 engines e a cobertura cross-browser da tela de login continua
// existindo depois do merge. Os 3 testes abaixo travam a mudança (ida E volta): se
// alguém devolver os projetos ao PR, o primeiro reprova; se alguém apagá-los do
// workflow logado, o segundo reprova.
test('E88: o job E2E de PR (ci.yml) não roda firefox-auth/webkit-auth', () => {
  for (const nome of ['firefox-auth', 'webkit-auth']) {
    assert.ok(
      !doCi.includes(nome),
      `"${nome}" não volta ao ci.yml: é cobertura cross-browser de auth, que só roda ` +
        'depois do merge no e2e-logado.yml — o PR fica só com Chromium',
    );
  }
});

test('E88: firefox-auth/webkit-auth seguem cobertos no e2e-logado.yml', () => {
  for (const nome of ['firefox-auth', 'webkit-auth']) {
    assert.ok(
      doLogado.includes(nome),
      `"${nome}" tem de estar no e2e-logado.yml: sem ele a tela de login deixa de ser ` +
        'provada no Firefox/WebKit (sobraria só o Chromium)',
    );
  }
});

test('E88: firefox-auth/webkit-auth continuam deslogados onde rodarem', () => {
  for (const nome of ['firefox-auth', 'webkit-auth']) {
    const bloco = projetos.get(nome);
    assert.ok(bloco, `${nome} tem de existir no playwright.config.ts`);
    assert.doesNotMatch(
      bloco,
      /dependencies:\s*\[|storageState:/,
      `"${nome}" prova a tela de LOGIN deslogada: com \`setup\`/storageState ele deixaria ` +
        'de exercitar o estado deslogado e passaria a exigir E2E_TEST_EMAIL/E2E_TEST_PASSWORD',
    );
  }
});

test('E88: todo --project= do e2e-logado.yml existe de fato no playwright.config.ts', () => {
  assert.ok(doLogado.length > 0, 'o e2e-logado.yml tem de listar projetos explicitamente');
  for (const nome of doLogado) {
    assert.ok(
      projetos.has(nome),
      `e2e-logado.yml referencia o project "${nome}", que não existe no config`,
    );
  }
});
