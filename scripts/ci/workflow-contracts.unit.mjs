// E98 (auditoria de GitHub Actions, 2026-10-01): os invariantes deste plano que
// vivem em YAML e podem regredir numa edição — sem que nenhum gate atual perceba.
//
// Por que centralizar aqui: cada etapa destas 100 mexeu em workflow, e várias
// vezes a garantia ficou presa no texto do plano. Texto não impede regressão.
// O `actionlint` valida sintaxe; ele fica verde com `continue-on-error` de volta
// no pgbouncer ou com um checkout sem `persist-credentials`.
//
// Âncora de cada caso: um PR de fora que consiga editar `.github/workflows/*` não
// deve ganhar acesso a segredo só porque o YAML mudou. Todo invariante aqui é
// disso que protege.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const DIR = new URL('../../.github/workflows/', import.meta.url);
const arquivos = (await readdir(DIR)).filter((f) => f.endsWith('.yml'));

const wf = {};
for (const f of arquivos) wf[f] = await readFile(new URL(f, DIR), 'utf8');

const nomes = Object.keys(wf);

/** Blocos `run: |` de um workflow (texto cru, sem parser YAML). */
function blocosRun(texto) {
  const linhas = texto.split('\n');
  const saida = [];
  for (let i = 0; i < linhas.length; i += 1) {
    const m = /^(\s*)run:\s*\|\s*$/.exec(linhas[i]);
    if (!m) continue;
    const indent = m[1].length + 2;
    const corpo = [];
    let j = i + 1;
    for (; j < linhas.length; j += 1) {
      const atual = linhas[j];
      const recuo = atual.length - atual.trimStart().length;
      if (atual.trim() && recuo <= indent - 2) break;
      corpo.push(atual);
    }
    saida.push(corpo.join('\n'));
    i = j - 1;
  }
  return saida;
}

test('E98: nenhum checkout deixa credencial persistida no disco', () => {
  // `persist-credentials: true` (default) deixa o token no `.git/config` do
  // runner: qualquer passo seguinte do job pode ler e reusar.
  const faltando = [];
  for (const nome of nomes) {
    const texto = wf[nome];
    const checkouts = (texto.match(/uses:\s*actions\/checkout@/g) ?? []).length;
    if (checkouts === 0) continue;
    const comSeguro = (texto.match(/persist-credentials:\s*false/g) ?? []).length;
    if (comSeguro < checkouts) faltando.push(`${nome} (${checkouts} checkout(s), ${comSeguro} seguro(s))`);
  }
  assert.deepEqual(faltando, [], `checkout sem persist-credentials: false em: ${faltando.join(', ')}`);
});

test('E98: cancel-in-progress nunca cancela run de `main`', () => {
  // Cancelar em PR é desejável (empurra commit, mata o run velho). Cancelar em
  // push para a main mata deploy e guarda vivo no meio.
  const infratores = [];
  for (const nome of nomes) {
    const texto = wf[nome];
    if (!/cancel-in-progress:\s*true/.test(texto)) continue;
    // Qualquer gatilho `push` já é motivo: push para `main` mata deploy e guarda
    // vivo no meio. (A versão anterior deste teste excluía quem tinha
    // `branches:` — que é exatamente o caso de `push: branches: [main]`, ou seja,
    // o pior deles, e por isso a mutação passava.)
    if (/^\s{2}push:/m.test(texto)) infratores.push(nome);
  }
  assert.deepEqual(infratores, [], `cancel-in-progress: true com gatilho push: ${infratores.join(', ')}`);
});

/** Linhas executáveis de um workflow: blocos `run: |` e `run:` de uma linha. */
function linhasExecutaveis(texto) {
  const linhas = texto.split('\n');
  const saida = [];

  // `run: <comando>` numa linha só — o extrator de blocos não pegava isto, e por
  // isso `bun install --ignore-scripts` escrito assim escapava do teste.
  for (const l of linhas) {
    const m = /^\s*-?\s*run:\s*(\S.*)$/.exec(l);
    if (m) saida.push(m[1].trim());
  }

  for (const bloco of blocosRun(texto)) {
    for (const l of bloco.split('\n')) {
      const t = l.trim();
      if (t && !t.startsWith('#')) saida.push(t);
    }
  }
  return saida;
}

test('E98: instalação de dependência nunca roda scripts de terceiros', () => {
  // `--ignore-scripts` bloqueia postinstall de pacote comprometido. O repo não
  // depende de postinstall para funcionar (verificado: os gates rodam com isso).
  const faltando = [];
  for (const nome of nomes) {
    for (const linha of linhasExecutaveis(wf[nome])) {
      if (/\b(bun install|bun i|npm ci|npm install|pnpm install)\b/.test(linha) && !/ignore-scripts/.test(linha)) {
        faltando.push(`${nome}: ${linha.slice(0, 70)}`);
      }
    }
  }
  assert.deepEqual(faltando, [], `instalação sem --ignore-scripts:\n${faltando.join('\n')}`);
});

test('E98: o proxy pgbouncer nunca fica em continue-on-error', () => {
  // Se a instalação do proxy falha e o passo segue, os passos dependentes rodam
  // SEM proxy — e o teste que devia falhar passa em verde. Falso verde é pior
  // que falha: ninguém investiga.
  const infratores = [];
  for (const nome of nomes) {
    if (!/install-pgbouncer\.sh/.test(wf[nome])) continue;
    // Procura o bloco que contém a chamada e checa a vizinhança imediata.
    const linhas = wf[nome].split('\n');
    const idx = linhas.findIndex((l) => l.includes('install-pgbouncer.sh'));
    if (idx === -1) continue;
    const janela = linhas.slice(Math.max(0, idx - 8), idx + 2).join('\n');
    if (/continue-on-error:\s*true/.test(janela)) infratores.push(nome);
  }
  assert.deepEqual(infratores, [], `pgbouncer com continue-on-error: ${infratores.join(', ')}`);
});

test('E98: o guarda vivo não dispara por mudança de Edge Function', () => {
  // `db-live-guard` prova o contrato do BANCO. Mudar `supabase/functions/**` não
  // altera esse contrato — se entrar no `paths`, todo PR de função paga o custo
  // de um run que conecta no banco de produção (era o defeito G-35 de outro ângulo).
  const texto = wf['db-live-guard.yml'];
  assert.ok(texto, 'db-live-guard.yml sumiu');

  const trechoPaths = texto.split(/^\s{4}paths:/m)[1]?.split(/^\s{2}\w/m)[0] ?? '';
  // Se não há bloco paths (ex.: sem trigger de push), a condição é trivialmente OK.
  if (trechoPaths.length > 0) {
    assert.ok(
      !/functions\/\*\*/.test(trechoPaths),
      'functions/** voltou ao paths do guarda vivo: PR de Edge Function passa a conectar no banco de produção',
    );
  }
});

// Exceção conhecida e registrada: `supabase-sync.yml` (E98).
// Ele importa `validarDestino` (comprova a identidade do banco) mas NÃO
// `endurecerDestinoTls`. É um import MANUAL de snapshot LEGADO, desarmado desde
// 28/08 e 25/09 (só roda por workflow_dispatch com confirmação de project-ref) —
// mexer no fluxo de import para encaixar o endurecimento é risco maior que o
// ganho, e não é desta etapa. Fica listado aqui para não sumir do radar.
const EXCECOES_TLS = new Set(['supabase-sync.yml']);

test('E98: todo workflow que recebe DESTINO_URL endurece o TLS', () => {
  // DESTINO_URL é o segredo de conexão com o banco canônico. O endurecimento
  // (validarDestino + endurecerDestinoTls) existe para o destino não vir do
  // ambiente sem checagem de identidade e TLS.
  const semEndurecimento = [];
  for (const nome of nomes) {
    const texto = wf[nome];
    if (!/\$\{\{\s*secrets\.DESTINO_URL\s*\}\}/.test(texto)) continue;
    if (/\bendurecerDestinoTls\s*\(/.test(texto)) continue;
    if (EXCECOES_TLS.has(nome)) continue;
    semEndurecimento.push(nome);
  }
  assert.deepEqual(
    semEndurecimento,
    [],
    `workflow usa DESTINO_URL sem endurecerDestinoTls: ${semEndurecimento.join(', ')}`,
  );
});

test('E98: a lista de exceções não cresce em silêncio', () => {
  // Se alguém acrescentar um workflow à exceção, este caso obriga a olhar.
  assert.equal(EXCECOES_TLS.size, 1, 'exceção de TLS mudou: confirme se o motivo ainda vale');
});

// E97 (auditoria de GitHub Actions, 2026-10-01): todo workflow com passo shell
// roda com `-euo pipefail`. Sem isto, um `run:` multi-linha segue depois do
// primeiro comando que falha — e o gate passa sem ter testado nada.
//
// O GitHub já usa `bash -e` por padrão; o que a E97 acrescenta é `-u` (variável
// não definida é erro, não string vazia) e `pipefail` (o código de saída do pipe
// é o do primeiro comando que falhar, não o do último).
test('E97: todo workflow com run: roda com -euo pipefail', () => {
  const sem = [];
  for (const nome of nomes) {
    const texto = wf[nome];
    const temRun = /^\s*-?\s*run:/m.test(texto);
    if (!temRun) continue;
    const temDefaults = /^\s*defaults:\s*$/m.test(texto) && /-euo pipefail \{0\}/.test(texto);
    const temInline = /set -euo pipefail/.test(texto);
    if (!temDefaults && !temInline) sem.push(nome);
  }
  assert.deepEqual(
    sem,
    [],
    `workflow com run: sem -euo pipefail (defaults.run.shell ou set inline): ${sem.join(', ')}`,
  );
});

test('E98: workflow disparado por pull_request não recebe segredo de banco', () => {
  // Reforça o invariante central: código de PR de terceiro não pode alcançar
  // DESTINO_URL. O `check-pr-workflow-secrets.mjs` é o gate oficial; aqui a
  // checagem é independente, no YAML.
  const infratores = [];
  for (const nome of nomes) {
    const texto = wf[nome];
    if (!/^\s{2}pull_request:/m.test(texto)) continue;
    if (/\$\{\{\s*secrets\.DESTINO_URL\s*\}\}/.test(texto)) infratores.push(nome);
  }
  assert.deepEqual(infratores, [], `pull_request com DESTINO_URL: ${infratores.join(', ')}`);
});

// E68 (auditoria de GitHub Actions, 2026-10-01): o download dos browsers do
// Playwright (centenas de MB) volta a acontecer em todo job se o cache não
// existir OU se a instalação rodar mesmo com cache quente. As duas metades
// precisam de teste: só "tem actions/cache" aprovaria um workflow que continua
// baixando tudo, e só "tem if: cache-hit" aprovaria um `if` apontando para um
// cache que ninguém salva.
//
// A chave precisa nomear o CONJUNTO de browsers: sem isso um cache gravado pelo
// job que instala apenas Chromium (e2e-talkx.yml) satisfaz o job que precisa de
// Chromium+Firefox+WebKit (ci.yml, e2e-logado.yml) — a instalação é pulada e os
// projetos de firefox/webkit falham por executável ausente.

/** Passos de um job (`steps:` é uma lista indentada em 6 espaços). */
function passos(texto) {
  const blocos = [];
  let atual = null;
  for (const linha of texto.split('\n')) {
    if (/^ {6}- /.test(linha)) {
      if (atual) blocos.push(atual.join('\n'));
      atual = [linha];
    } else if (atual) {
      atual.push(linha);
    }
  }
  if (atual) blocos.push(atual.join('\n'));
  return blocos;
}

test('E68: browser do Playwright é cacheado e o download só roda em cache miss', () => {
  const LETRA = { chromium: 'c', firefox: 'f', webkit: 'w' };
  const problemas = [];

  for (const nome of nomes) {
    const texto = wf[nome];
    if (!/\bplaywright@[\w.-]+\s+install\b/.test(texto)) continue;
    const blocos = passos(texto);

    // SL-095 pôs um 2º `actions/cache` no mesmo job (cache do Bun, antes do
    // install) — o passo dos browsers do Playwright é o que aponta para
    // `~/.cache/ms-playwright`, não necessariamente o primeiro `actions/cache`.
    const cache = blocos.find(
      (p) => /uses:\s*actions\/cache@[a-f0-9]{40}\b/.test(p) && /~\/\.cache\/ms-playwright\b/.test(p),
    );
    if (!cache) {
      problemas.push(`${nome}: sem passo actions/cache para os browsers`);
      continue;
    }
    if (!/^ {10}path:\s*~\/\.cache\/ms-playwright\s*$/m.test(cache)) {
      problemas.push(`${nome}: o cache não aponta para ~/.cache/ms-playwright`);
    }

    const id = /^ {8}id:\s*(\S+)\s*$/m.exec(cache)?.[1];
    if (!id) {
      problemas.push(`${nome}: passo de cache sem id — o if da instalação não tem como citá-lo`);
      continue;
    }

    // A chave separa os jobs pelo conjunto de engines que eles instalam.
    const chave = /^ {10}key:\s*(.+?)\s*$/m.exec(cache)?.[1] ?? '';
    const conjunto = /(?:^|[^a-z])pw-([cfw]+)-/.exec(chave)?.[1] ?? '';
    const instalados = Object.keys(LETRA)
      .filter((b) => new RegExp(`install --with-deps[^\n]*\\b${b}\\b`).test(texto))
      .map((b) => LETRA[b])
      .sort()
      .join('');
    if (!conjunto) {
      problemas.push(`${nome}: chave '${chave}' não nomeia o conjunto de browsers (esperado pw-<cfw>-)`);
    } else if ([...conjunto].sort().join('') !== instalados) {
      problemas.push(`${nome}: chave diz '${conjunto}' mas o job instala '${instalados}'`);
    }

    const miss = blocos.find(
      (p) =>
        new RegExp(`if:\\s*steps\\.${id}\\.outputs\\.cache-hit\\s*!=\\s*'true'`).test(p) &&
        /\bplaywright@[\w.-]+\s+install\s+--with-deps\b/.test(p),
    );
    if (!miss) problemas.push(`${nome}: 'install --with-deps' não está sob steps.${id}.outputs.cache-hit != 'true'`);

    const hit = blocos.find(
      (p) =>
        new RegExp(`if:\\s*steps\\.${id}\\.outputs\\.cache-hit\\s*==\\s*'true'`).test(p) &&
        /\bplaywright@[\w.-]+\s+install-deps\b/.test(p),
    );
    if (!hit) problemas.push(`${nome}: sem 'install-deps' sob cache hit (pacote do apt não vive no cache)`);
  }

  assert.deepEqual(problemas, [], `cache dos browsers Playwright:\n${problemas.join('\n')}`);
});

// E86 (auditoria de GitHub Actions, 2026-10-01): "avaliar `supabase start` +
// seed mínimo em CI para a suíte logada". **Avaliado neste repositório e NÃO
// adotado** — e a decisão fica travada aqui, não no texto do plano:
//
//  1. a suíte logada existe para provar PRODUÇÃO — login real
//     (E2E_TEST_EMAIL/E2E_TEST_PASSWORD), RLS real e fixtures que vivem no banco
//     de produção (`e2e/README.md`; presença cobrada pela E85). Um Postgres local
//     com seed não prova nada disso.
//  2. os specs que NÃO precisam de produção já rodam 100% locais com custo de
//     boot ZERO — sessão falsa (`installFakeSession`) + REST/RPC/Mapbox
//     interceptados por rota (`e2e/README.md`, "Aba Arquivos: prova autenticada
//     100% local"; `chromium-mapa`, travado em `ci-e2e-projects.unit.mjs`).
//     Contra os ~3 min de boot por run que o próprio item E86 levantou.
//  3. o caminho local do CLI já existe e é documentado como SÓ-DEV:
//     `scripts/db-audit/gen-types.sh` (`--local` — "nenhum workflow atual usa").
//  4. um "seed mínimo" teria de recriar `profiles`/`user_roles`/contatos/
//     campanhas/conexão Talk X — DDL e dados que este plano não admite.
//
// Enquanto a suíte prova produção, o único freio para ela não poluir o banco é a
// limpeza explícita do que grava (segundo caso, abaixo). Adotar um Supabase local
// não pode entrar em silêncio num PR: estes casos obrigam a revisitar a decisão
// de propósito.
const BOOT_SUPABASE_LOCAL = /\bsupabase\s+(start|db\s+start|db\s+reset|db\s+seed)\b/;

test('E86: nenhum workflow sobe Supabase local (a suíte prova produção ou sessão falsa)', () => {
  const infratores = [];
  for (const nome of nomes) {
    for (const linha of linhasExecutaveis(wf[nome])) {
      if (BOOT_SUPABASE_LOCAL.test(linha)) infratores.push(`${nome}: ${linha.slice(0, 70)}`);
    }
  }
  assert.deepEqual(
    infratores,
    [],
    `workflow sobe Supabase local (decisão E86, ver o comentário acima):\n${infratores.join('\n')}`,
  );
});

test('E86: quem roda a suíte logada declara a limpeza do que grava em produção', () => {
  // Sem banco local (decisão acima), a suíte logada grava em PRODUÇÃO. O freio
  // contra poluir o banco é o teardown explícito (`e2e-logado.yml`). Um workflow
  // logado novo sem essa limpeza gravaria fixture permanente a cada run.
  const semLimpeza = [];
  for (const nome of nomes) {
    const texto = wf[nome];
    if (!/secrets\.E2E_TEST_(EMAIL|PASSWORD)/.test(texto)) continue;
    if (!/teardown|cleanup|limpeza|limpar/i.test(texto)) semLimpeza.push(nome);
  }
  assert.deepEqual(
    semLimpeza,
    [],
    `workflow roda a suíte logada contra produção sem passo de limpeza: ${semLimpeza.join(', ')}`,
  );
});

// E67 (auditoria de GitHub Actions, 2026-10-01 — SL-095): todo job que roda
// `bun install` restaura o cache global do Bun ANTES de instalar.
//
// Por que importa: o `bun install` é o passo mais repetido e mais caro do
// pipeline (10 jobs em 5 workflows). Sem `actions/cache`, cada run baixa o
// registry inteiro do zero.
//
// Âncoras que o teste trava, cada uma por um motivo:
//   (a) o passo de cache existe no MESMO job (cache de outro job não serve);
//   (b) ele vem ANTES do install (depois não economiza nada);
//   (c) o caminho é `~/.bun/install/cache` (o cache global de pacotes);
//   (d) a chave acompanha `hashFiles('bun.lock')` — chave fixa devolveria
//       dependência velha para um lock novo, e o `--frozen-lockfile` passaria
//       a validar contra o que não foi instalado.

const USES_CACHE = /uses:\s*actions\/cache@[a-f0-9]{40}\b/;
const PATH_CACHE_BUN = /path:\s*~\/\.bun\/install\/cache\s*$/;
const KEY_CACHE_BUN = /key:\s*bun-\$\{\{\s*hashFiles\('bun\.lock'\)\s*\}\}/;

/** Blocos de job de um workflow: chaves de 2 espaços sob `jobs:` (texto cru). */
function blocosDeJob(texto) {
  const linhas = texto.split('\n');
  const inicio = linhas.findIndex((l) => /^jobs:\s*$/.test(l));
  if (inicio === -1) return [];

  const blocos = [];
  let atual = null;
  for (let i = inicio + 1; i < linhas.length; i += 1) {
    const l = linhas[i];
    if (/^ {2}["']?[A-Za-z0-9_][A-Za-z0-9_.-]*["']?:\s*$/.test(l)) {
      if (atual) blocos.push(atual);
      atual = { nome: l.trim().replace(/:$/, '').replace(/["']/g, ''), linhas: [] };
      continue;
    }
    // Chave de topo de novo: acabou o bloco `jobs:`.
    if (/^\S/.test(l)) {
      if (atual) blocos.push(atual);
      atual = null;
      continue;
    }
    if (atual) atual.linhas.push(l);
  }
  if (atual) blocos.push(atual);
  return blocos.map((b) => ({ nome: b.nome, texto: b.linhas.join('\n') }));
}

test('E67: todo job que roda bun install restaura o cache do Bun antes de instalar', () => {
  const problemas = [];
  let jobsComInstall = 0;

  for (const nome of nomes) {
    for (const job of blocosDeJob(wf[nome])) {
      const linhasJob = job.texto.split('\n');
      const idxInstall = linhasJob.findIndex((l) => /\bbun install\b/.test(l) && !/^\s*#/.test(l));
      if (idxInstall === -1) continue;
      jobsComInstall += 1;

      const idxCache = linhasJob.findIndex((l) => USES_CACHE.test(l));
      if (idxCache === -1) {
        problemas.push(`${nome} → ${job.nome}: sem passo actions/cache`);
        continue;
      }
      if (idxCache > idxInstall) {
        problemas.push(`${nome} → ${job.nome}: cache DEPOIS do bun install (não economiza nada)`);
      }
      if (!linhasJob.some((l) => PATH_CACHE_BUN.test(l))) {
        problemas.push(`${nome} → ${job.nome}: cache sem path ~/.bun/install/cache`);
      }
      if (!linhasJob.some((l) => KEY_CACHE_BUN.test(l))) {
        problemas.push(`${nome} → ${job.nome}: cache sem key atrelada a bun.lock (hashFiles('bun.lock'))`);
      }
    }
  }

  assert.ok(jobsComInstall > 0, 'nenhum job com bun install encontrado: o extrator de jobs quebrou');
  assert.deepEqual(problemas, [], `job com bun install sem cache do Bun:\n${problemas.join('\n')}`);
});

// E69 (08/10/2026): o tempo de parede do ci.yml era a SOMA dos jobs porque
// `test`, `security`, `e2e` e `mutation-mapa` tinham `needs: lint-and-typecheck`
// — e nenhum deles precisa do lint para começar (cada um faz o próprio checkout
// e `bun install`). Sem o `needs`, eles rodam em PARALELO com o lint; o `build`
// continua atrás do lint E do `test`, que é o gate de fato. Um comentário no
// YAML não impede ninguém de recolocar o `needs`: estes casos, sim.

/** Grafo de `needs` do bloco `jobs:` (formas inline `[a, b]` e em lista `- a`). */
function grafoDeNeeds(texto) {
  const linhas = texto.split('\n');
  const inicio = linhas.findIndex((l) => /^jobs:\s*$/.test(l));
  const grafo = new Map();
  if (inicio === -1) return grafo;

  let job = null;
  let dentroNeeds = false;
  for (let i = inicio + 1; i < linhas.length; i += 1) {
    const l = linhas[i];

    // Corpo de `run: |` é shell, não YAML — não pode virar cabeçalho de job.
    const mRun = /^(\s*)-?\s*run:\s*\|\s*$/.exec(l);
    if (mRun) {
      const recuo = mRun[1].length;
      while (i + 1 < linhas.length) {
        const prox = linhas[i + 1];
        if (prox.trim() && prox.length - prox.trimStart().length <= recuo) break;
        i += 1;
      }
      continue;
    }

    if (/^\S/.test(l)) break; // saiu do bloco jobs
    const mJob = /^  ([A-Za-z0-9_-]+):\s*$/.exec(l);
    if (mJob) {
      job = mJob[1];
      grafo.set(job, []);
      dentroNeeds = false;
      continue;
    }
    if (job === null) continue;

    const mInline = /^    needs:\s*(\S.*)$/.exec(l);
    if (mInline) {
      const bruto = mInline[1].trim().replace(/^\[|\]$/g, '');
      for (const p of bruto.split(',').map((s) => s.trim()).filter(Boolean)) {
        grafo.get(job).push(p);
      }
      dentroNeeds = false;
      continue;
    }
    if (/^    needs:\s*$/.test(l)) {
      dentroNeeds = true;
      continue;
    }
    if (dentroNeeds) {
      const mItem = /^\s+-\s*(\S+)\s*$/.exec(l);
      if (mItem) {
        grafo.get(job).push(mItem[1]);
        continue;
      }
      dentroNeeds = false;
    }
  }
  return grafo;
}

/** Ancestrais de `job` no grafo: o que tem de terminar antes dele. */
function ancestrais(grafo, job) {
  const vistos = new Set();
  const pilha = [...(grafo.get(job) ?? [])];
  while (pilha.length) {
    const atual = pilha.pop();
    if (vistos.has(atual)) continue;
    vistos.add(atual);
    for (const p of grafo.get(atual) ?? []) pilha.push(p);
  }
  return vistos;
}

test('E69: unit-tests/node-scripts não esperam o typecheck (rodam em paralelo)', () => {
  const grafo = grafoDeNeeds(wf['ci.yml']);
  for (const job of ['unit-tests', 'node-scripts']) {
    assert.ok(grafo.has(job), `job ${job} sumiu do ci.yml`);
    const anc = [...ancestrais(grafo, job)];
    assert.deepEqual(
      anc,
      [],
      `${job} volta a esperar ${anc.join(', ')} — o job vira série em vez de rodar em paralelo`,
    );
  }
});

test('E69: o build continua atrás do lint E do test', () => {
  const anc = ancestrais(grafoDeNeeds(wf['ci.yml']), 'build');
  assert.ok(anc.has('typecheck'), 'build deixou de esperar o lint');
  assert.ok(anc.has('unit-tests'), 'build deixou de esperar o test');
});
