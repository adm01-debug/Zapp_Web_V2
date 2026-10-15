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
  assert.ok(trechoPaths.length > 0, 'não achei o bloco paths do db-live-guard');
  assert.ok(
    !/functions\/\*\*/.test(trechoPaths),
    'functions/** voltou ao paths do guarda vivo: PR de Edge Function passa a conectar no banco de produção',
  );
});

// Sem exceções desde 15/10/2026: o único workflow que recebia DESTINO_URL sem
// `endurecerDestinoTls` era o `supabase-sync.yml` (E98), removido do repositório
// por estar desarmado e sem nenhum run em 30 dias. Exceção nova precisa entrar
// aqui com o motivo, não silenciosamente.
const EXCECOES_TLS = new Set();

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
  assert.equal(EXCECOES_TLS.size, 0, 'exceção de TLS mudou: confirme se o motivo ainda vale');
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

// W07 (plano de 14/10/2026, achado N-13): no guarda vivo, todo sub-check que entra
// no veredito (tem `id:` e `continue-on-error: true`) depende da credencial do
// banco. Sem `if: steps.credencial.outcome == 'success'` o passo roda sem
// credencial, falha por motivo alheio ao contrato e vira "causa" no alerta. Em
// 14/10 o passo E85 (fixtures de E2E) era o unico dos 11 sem a guarda.
test('W07: todo sub-check do guarda vivo exige a credencial do banco', () => {
  const texto = wf['db-live-guard.yml'];
  assert.ok(texto, 'db-live-guard.yml sumiu');
  const semGuarda = [];
  let subChecks = 0;
  for (const p of passos(texto)) {
    if (!/^ {8}continue-on-error:\s*true/m.test(p)) continue;
    const id = /^ {8}id:\s*(\S+)/m.exec(p)?.[1];
    if (!id || id === 'credencial') continue; // sem id nao entra no veredito (login/pre-pull)
    subChecks += 1;
    if (!/^ {8}if:\s*steps\.credencial\.outcome == 'success'/m.test(p)) semGuarda.push(id);
  }
  assert.ok(subChecks >= 10, `esperava >= 10 sub-checks com id, achei ${subChecks}`);
  assert.deepEqual(semGuarda, [], `sub-check do guarda vivo sem a guarda de credencial: ${semGuarda.join(', ')}`);
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
    if (!/\bplaywright(?:@[\w.-]+)?\s+install\b/.test(texto)) continue;
    const blocos = passos(texto);

    // Localiza o cache de BROWSERS do Playwright (path ms-playwright), não o bun cache.
    const cache = blocos.find(
      (p) => /uses:\s*actions\/cache@[a-f0-9]{40}\b/.test(p) && /ms-playwright/.test(p),
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
        /\bplaywright(?:@[\w.-]+)?\s+install\s+--with-deps\b/.test(p),
    );
    if (!miss) problemas.push(`${nome}: 'install --with-deps' não está sob steps.${id}.outputs.cache-hit != 'true'`);

    const hit = blocos.find(
      (p) =>
        new RegExp(`if:\\s*steps\\.${id}\\.outputs\\.cache-hit\\s*==\\s*'true'`).test(p) &&
        /\bplaywright(?:@[\w.-]+)?\s+install-deps\b/.test(p),
    );
    if (!hit) problemas.push(`${nome}: sem 'install-deps' sob cache hit (pacote do apt não vive no cache)`);
  }

  assert.deepEqual(problemas, [], `cache dos browsers Playwright:\n${problemas.join('\n')}`);
});

// W44: todos os workflows têm `defaults.run.shell: bash --noprofile --norc -euo pipefail {0}`.
// Sem isso, um `set -e` esquecido ou um passo importado de fora pode silenciar falhas.
// Exceção única: scorecard.yml. O scorecard-action v2.4.1 recusa publicar o resultado se o job dele
// tiver `defaults` ou `env` (README, "Restrictions on the job containing ossf/scorecard-action"), e o
// workflow não tem passo `run:` — o shell strict não teria o que proteger ali.
const SEM_DEFAULTS_POR_RESTRICAO_UPSTREAM = ['scorecard.yml'];

test('W44: todos os workflows declaram defaults.run.shell com bash strict', () => {
  const SHELL = /defaults:\s*\n\s+run:\s*\n\s+shell:\s*bash\s+--noprofile\s+--norc\s+-euo\s+pipefail\s+\{0\}/s;
  const faltando = nomes.filter((nome) => !SEM_DEFAULTS_POR_RESTRICAO_UPSTREAM.includes(nome) && !SHELL.test(wf[nome]));
  assert.deepEqual(faltando, [], `workflows sem defaults.run.shell strict: ${faltando.join(', ')}`);
});

/**
 * Jobs de um workflow, por varredura de linhas (sem regex com backtracking): id → linhas do job.
 * Um job começa numa linha com 2 espaços de indentação logo abaixo de `jobs:` e vai até o próximo.
 */
function blocosDeJob(texto) {
  const blocos = new Map();
  const inicioJobs = texto.indexOf('\njobs:');
  if (inicioJobs === -1) return blocos;
  let atual = null;
  for (const linha of texto.slice(inicioJobs + 1).split('\n').slice(1)) {
    if (/^\S/.test(linha)) break; // outra chave de topo
    if (/^ {2}\S/.test(linha) && !linha.trimStart().startsWith('#')) {
      atual = linha.trim().split(':')[0];
      blocos.set(atual, []);
    } else if (atual) {
      blocos.get(atual).push(linha);
    }
  }
  return blocos;
}

// O padrão do repositório é default_workflow_permissions=read (baseline, 15/10/2026). Ele só vale
// para job sem permissões declaradas; com este contrato não há nenhum, e trocar o padrão no
// GitHub não muda o comportamento de nenhum workflow.
test('todo job declara permissões (no topo do workflow ou no próprio job)', () => {
  const sem = [];
  for (const nome of nomes) {
    const texto = wf[nome];
    const inicioJobs = texto.indexOf('\njobs:');
    const topo = texto.slice(0, inicioJobs);
    if (topo.split('\n').some((l) => l.startsWith('permissions:'))) continue;
    for (const [id, linhas] of blocosDeJob(texto)) {
      if (!linhas.some((l) => l.startsWith('    permissions:'))) sem.push(`${nome}:${id}`);
    }
  }
  assert.deepEqual(sem, [], `jobs sem permissões declaradas (herdariam o padrão do repositório): ${sem.join(', ')}`);
});

test('W86: scorecard.yml sem write no nível do workflow (a API do Scorecard recusa publicar)', () => {
  // README v2.4.1, "Global workflow restrictions": nenhuma permissão de escrita no topo, e só o
  // job do scorecard-action pode ter id-token: write. Run 38782461564 falhou com
  // "global perm is set to write" para security-events e checks.
  const texto = wf['scorecard.yml'];
  const topo = texto.slice(0, texto.indexOf('\njobs:'));
  assert.ok(topo.split('\n').some((l) => l.trim() === 'permissions: {}'), 'scorecard.yml: o topo deve ser permissions: {}');
  assert.ok(!topo.split('\n').some((l) => /:\s*write\b/.test(l)), 'scorecard.yml: write no nível do workflow');
  // id-token: write no job que usa ossf/scorecard-action e em nenhum outro (Codex, PR #1952).
  const comToken = [];
  const doScorecard = [];
  for (const [id, linhas] of blocosDeJob(texto)) {
    if (linhas.some((l) => l.trim().startsWith('id-token: write'))) comToken.push(id);
    if (linhas.some((l) => l.includes('uses: ossf/scorecard-action@'))) doScorecard.push(id);
  }
  assert.equal(doScorecard.length, 1, 'scorecard.yml deve ter exatamente um job com ossf/scorecard-action');
  assert.deepEqual(comToken, doScorecard, 'id-token: write só no job do ossf/scorecard-action');
});

test('W44: a exceção do scorecard.yml só vale enquanto ele não tiver passo run, defaults nem env', () => {
  for (const nome of SEM_DEFAULTS_POR_RESTRICAO_UPSTREAM) {
    const texto = wf[nome];
    assert.ok(texto, `${nome} não existe: remova a exceção`);
    // Linha a linha, sem `\s*` multilinha (Sonar S5852: backtracking super-linear).
    const chaves = texto.split('\n').map((l) => l.trimStart().replace(/^-[ \t]+/, ''));
    assert.ok(!chaves.some((l) => l.startsWith('run:')), `${nome} ganhou passo run: — sem defaults strict ele roda sem -euo pipefail`);
    assert.ok(!chaves.some((l) => l.startsWith('defaults:')), `${nome}: o scorecard-action recusa defaults no workflow e no job`);
    assert.ok(!chaves.some((l) => l.startsWith('env:')), `${nome}: o scorecard-action recusa env no workflow e no job`);
  }
});

// W09 (plano de 14/10/2026, achado N-05b): a versão do Playwright tem UMA fonte, o
// bun.lock. `bunx playwright@1.63.0` nos workflows duplicava a versão em 6 lugares e o
// bump do Dependabot (#1918) nascia vermelho até alguém editar YAML e teste à mão.
// Vale para QUALQUER invocação, não só `install`: `bunx playwright@latest test` resolve o
// pacote fora do lockfile do mesmo jeito (Codex, PR #1923).
test('W09: workflows invocam o Playwright do lockfile, sem bunx nem seletor playwright@…', () => {
  const problemas = [];
  for (const nome of nomes) {
    const texto = wf[nome];
    if (!/\bplaywright\b/.test(texto)) continue;
    if (/(?:@playwright\/[\w.-]+|\bplaywright)@[^\s"'`]+/.test(texto)) problemas.push(`${nome}: seletor playwright@… literal`);
    // Por linha e com qualquer coisa entre `bunx`/`bun x` e o pacote: `bunx --bun playwright test`
    // e `bun x playwright test` resolvem fora do lockfile do mesmo jeito (Codex, PR #1923).
    if (/^.*\b(?:bunx|bun\s+x)\b.*\b(?:@playwright\/[\w.-]+|playwright)\b/m.test(texto)) problemas.push(`${nome}: usa bunx/bun x playwright (resolve fora do bun.lock)`);
    if (/\bplaywright\s+install/.test(texto) && !/\.\/node_modules\/\.bin\/playwright\s+install/.test(texto)) {
      problemas.push(`${nome}: não usa ./node_modules/.bin/playwright`);
    }
  }
  assert.deepEqual(problemas, [], problemas.join('\n'));
});

// W99: novos invariantes de segurança de workflow

test('W99: todo curl usa --proto e --tlsv1.2', async () => {
  const dir = new URL('../../.github/workflows/', import.meta.url);
  const arquivos = (await readdir(dir)).filter((f) => /\.ya?ml$/.test(f));
  const infratores = [];
  for (const nome of arquivos) {
    const texto = await readFile(new URL(nome, dir), 'utf8');
    const linhas = texto.split('\n');
    for (let i = 0; i < linhas.length; i += 1) {
      const linha = linhas[i];
      if (!/\bcurl\b/.test(linha)) continue;
      if (/--proto\b/.test(linha) && /--tlsv1\.\d/.test(linha)) continue;
      // linha de continuação: o curl pode estar na linha e as flags na próxima
      const bloco = linhas.slice(i, i + 4).join(' ');
      if (/--proto\b/.test(bloco) && /--tlsv1\.\d/.test(bloco)) continue;
      infratores.push(`${nome}:${i + 1}: ${linha.trim()}`);
    }
  }
  assert.deepEqual(infratores, [], `curl sem --proto='=https' --tlsv1.2:\n${infratores.join('\n')}`);
});

// W99: todo passo upload-artifact deve declarar retention-days explicitamente.
// Sem isso o artifact herda o default do repo (90 dias) e acumula storage.
test('W99: todo upload-artifact tem retention-days explícito', () => {
  const problemas = [];
  for (const nome of nomes) {
    const blocos = passos(wf[nome]);
    for (const bloco of blocos) {
      if (!bloco.includes('upload-artifact@')) continue;
      if (!/retention-days:/u.test(bloco)) {
        const nomeStep = /name:\s*(.+)/u.exec(bloco)?.[1]?.trim() ?? '(sem nome)';
        problemas.push(`${nome}: passo '${nomeStep}' sem retention-days`);
      }
    }
  }
  assert.deepEqual(problemas, [], `upload-artifact sem retention-days:\n${problemas.join('\n')}`);
});

// W99: todo curl deve usar --proto '=https' e --tlsv1.2 (ou --tlsv1.3).
// Sem as flags, o curl aceita downgrade para HTTP ou TLS < 1.2.
test('W99: todo curl usa --proto =https e --tlsv1.2/3', () => {
  const problemas = [];
  for (const nome of nomes) {
    for (const bloco of blocosRun(wf[nome])) {
      for (const linha of bloco.split('\n')) {
        if (!/\bcurl\b/.test(linha)) continue;
        if (linha.trim().startsWith('#')) continue;
        const temProto = /--proto\s+'?=https'?/.test(linha);
        const temTls   = /--tlsv1\.[23]/.test(linha);
        if (!temProto || !temTls) {
          problemas.push(`${nome}: curl sem TLS obrigatório: ${linha.trim().slice(0, 80)}`);
        }
      }
    }
  }
  assert.deepEqual(problemas, [], `curl sem flags TLS:\n${problemas.join('\n')}`);
});

// W99 (W60): `contents: write` só em workflows que realmente fazem push de código
// ou chamam a API update-branch. Um workflow de deploy ou CI com essa permissão
// pode commitar acidentalmente em caso de comprometimento de supply-chain.
test('W99/W60: contents:write apenas em workflows que fazem push', () => {
  // Lista de workflows autorizados (justificativa):
  //   auto-update-pr-branch: gh api PUT .../update-branch → push no branch da PR
  //   talkx-status-regen:    git push (branch de status) + gh pr create
  //   types-sync:            git push (branch de sync)   + gh pr create
  const PERMITIDOS = new Set([
    'auto-update-pr-branch.yml',
    'talkx-status-regen.yml',
    'types-sync.yml',
  ]);
  const infratores = nomes.filter((nome) => {
    if (PERMITIDOS.has(nome)) return false;
    // Remove linhas de comentário antes de checar (evita falso positivo em
    // "# contents:write foi removido" que é texto de documentação, não permissão).
    const semComentarios = wf[nome].split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    return /\bcontents:\s*write\b/.test(semComentarios);
  });
  assert.deepEqual(
    infratores,
    [],
    `contents:write fora dos workflows autorizados:\n${infratores.join('\n')}\n` +
      '(adicione à lista PERMITIDOS com justificativa, ou remova a permissão)',
  );
});

// W99 (W94): todo workflow que abre PR deve ter `concurrency` para não abrir
// duplicatas em runs concorrentes do mesmo evento.
test('W99/W94: todo workflow que cria PR tem concurrency', () => {
  // Detecta workflows que usam a ação create-pull-request ou chamam gh pr create.
  const abrePR = nomes.filter(
    (nome) =>
      /peter-evans\/create-pull-request@|gh\s+pr\s+create\b/.test(wf[nome]),
  );
  const semConcurrency = abrePR.filter((nome) => !/\bconcurrency:\s*$/m.test(wf[nome]));
  assert.deepEqual(
    semConcurrency,
    [],
    `workflow que cria PR sem concurrency: ${semConcurrency.join(', ')}`,
  );
});

// W99 (W55): db-guard.yml deve conter o mecanismo SKIP_CONTRACTS — um passo
// que exporta a variável e ao menos um passo condicional que a consulta.
// Sem isso o path filter de PR não existe mais e db-guard.yml roda os contratos Docker
// em toda PR, mesmo as que não tocam banco.
test('W99/W55: db-guard.yml tem mecanismo SKIP_CONTRACTS', () => {
  const texto = wf['db-guard.yml'];
  assert.ok(texto, 'db-guard.yml sumiu');
  assert.ok(
    /core\.exportVariable\s*\(\s*['"]SKIP_CONTRACTS['"]/.test(texto),
    'db-guard.yml não exporta SKIP_CONTRACTS via core.exportVariable',
  );
  assert.ok(
    /env\.SKIP_CONTRACTS\s*!=\s*['"]true['"]/.test(texto),
    "db-guard.yml não tem passos condicionais em env.SKIP_CONTRACTS != 'true'",
  );
});

// W30: `supabase db push --db-url "$SUPABASE_DB_URL"` expõe a URL na argv do processo
// (visível via `ps -ef`). O CLI 2.116.0 ignora `SUPABASE_DB_URL` como variável de
// ambiente e cai no projeto "linkado" ("Cannot find project ref") — por isso `--db-url`
// explícito é necessário. Exceção documentada: o valor já está mascarado via
// `::add-mask::` ANTES de qualquer chamada ao CLI, então a URL nunca aparece em
// claro nos logs do GitHub Actions. Restrição residual: `ps -ef` de outro processo no
// MESMO runner veria a URL — mitigação natural é que o runner do GitHub Actions é
// efêmero e isolado por job (sem acesso externo ao PID table durante a execução).
// Resolução futura: quando o CLI suportar `SUPABASE_DB_URL` ou `PGPASSFILE`, remover
// `--db-url` explícito e este comentário.
test('W30: SUPABASE_DB_URL é mascarada antes de qualquer `supabase db push`', () => {
  const texto = wf['db-migrate.yml'];
  assert.ok(texto, 'db-migrate.yml sumiu');

  // Prova 1: ::add-mask:: ocorre pelo menos duas vezes (preflight + apply)
  const masks = (texto.match(/::add-mask::/g) ?? []).length;
  assert.ok(masks >= 2, `esperava >= 2 ::add-mask:: em db-migrate.yml, achei ${masks}`);

  // Prova 2: o valor mascarado é gravado em GITHUB_ENV como SUPABASE_DB_URL
  // (o mesmo DSN endurecido, já mascarado, exportado pelo passo de identidade)
  assert.ok(
    /SUPABASE_DB_URL=\$\{tls\.connectionString\}/.test(texto) ||
    /SUPABASE_DB_URL=\$\{tls\.connectionString\}|appendFileSync[^}]*SUPABASE_DB_URL/.test(texto),
    'db-migrate.yml não exporta SUPABASE_DB_URL a partir do connectionString endurecido',
  );

  // Prova 3: `supabase db push --db-url` usa a variável de ambiente, não o secret bruto
  const pushLines = texto.split('\n').filter((l) => l.includes('supabase db push'));
  for (const l of pushLines) {
    assert.ok(
      !/--db-url\s+"?\$\{\{\s*secrets\./.test(l),
      `supabase db push usa secret direto no argv (não mascarado): ${l.trim()}`,
    );
    assert.ok(
      /--db-url\s+"?\$SUPABASE_DB_URL/.test(l),
      `supabase db push não usa SUPABASE_DB_URL como fonte: ${l.trim()}`,
    );
  }
});

test('W06: e2e-logado encerra a suite pelo Playwright antes de o runner cancelar o job', () => {
  const y = wf['e2e-logado.yml'];
  const job = Number(/^    timeout-minutes: (\d+)$/m.exec(y)?.[1]);
  const global = Number(/--global-timeout=(\d+)/.exec(y)?.[1]);
  assert.ok(global > 0, 'sem --global-timeout, quem encerra a suite e o runner (job cancelado, sem relatorio)');
  // Margem de 5 min: setup sem cache de browsers (~3 min) + passos de falha (~1-2 min).
  assert.ok(
    global / 60_000 <= job - 5,
    `--global-timeout (${global / 60_000} min) precisa ficar >= 5 min abaixo do job (${job} min): ` +
      'cancelado nao e failure(), e a redacao/artifact/alerta so rodam em failure()',
  );
});
