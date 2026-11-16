/**
 * SL-024 / E21 (auditoria de GitHub Actions, 2026-10-01, defeito G-25): o passo
 * "Destravar os checks do PR de sincronizacao" do `types-sync.yml` aprovava
 * TODO run `action_required` devolvido por `listWorkflowRunsForRepo` filtrando
 * apenas `head_sha` + `status`. Um run de OUTRA branch no MESMO commit (o SHA
 * do PR de sincronizacao tambem existe na branch de origem e em PRs irmaos)
 * entrava no laco e era aprovado pelo GITHUB_TOKEN — check alheio liberado.
 *
 * O desenho correto, travado aqui: a consulta filtra tambem
 * `head_branch: 'automation/types-sync'`, exatamente a branch que o
 * `peter-evans/create-pull-request` abre (`branch:` no mesmo arquivo).
 *
 * Verificacao pedida pelo plano (E21): "unit test com run de outra branch no
 * mesmo SHA -> nao aprovado". Os casos abaixo rodam o proprio script do
 * workflow (extraido do YAML) contra uma API de mentira que emula o filtro
 * documentado de `/actions/runs` (head_sha, status e head_branch).
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(
  new URL('../../.github/workflows/types-sync.yml', import.meta.url),
  'utf8',
);

const BRANCH_SYNC = 'automation/types-sync';
const SHA = 'cafe0123456789abcdef0123456789abcdef0123';

/**
 * Blocos `script: |` do workflow (texto cru, sem parser YAML). O arquivo tem
 * mais de um passo github-script, entao o teste escolhe o bloco certo.
 */
function blocosScript(texto) {
  const linhas = texto.split('\n');
  const blocos = [];
  for (let i = 0; i < linhas.length; i += 1) {
    if (!/^\s*script:\s*\|\s*$/.test(linhas[i])) continue;
    const indent = linhas[i].match(/^\s*/)[0].length;
    const corpo = [];
    let j = i + 1;
    for (; j < linhas.length; j += 1) {
      const atual = linhas[j];
      if (atual.trim() && atual.length - atual.trimStart().length <= indent) break;
      corpo.push(atual.slice(Math.min(atual.length, indent + 2)));
    }
    blocos.push(corpo.join('\n'));
    i = j - 1;
  }
  return blocos;
}

/** O bloco do passo "Destravar os checks" (o que aprova runs). */
function scriptDeDestravar(texto) {
  const bloco = blocosScript(texto).find((b) => b.includes('approveWorkflowRun'));
  assert.ok(bloco, 'nao achei o passo que aprova os runs (approveWorkflowRun)');
  return bloco;
}

const script = scriptDeDestravar(workflow);

/** Emula a API real: /actions/runs filtra por head_sha, status e head_branch. */
function apiFalsa(runs) {
  const aprovados = [];
  const consultas = [];
  const github = {
    rest: {
      actions: {
        async listWorkflowRunsForRepo(params) {
          consultas.push(params);
          const filtrados = runs.filter(
            (r) =>
              (!params.head_sha || r.head_sha === params.head_sha) &&
              (!params.status || r.status === params.status) &&
              (!params.head_branch || r.head_branch === params.head_branch),
          );
          return { data: { workflow_runs: filtrados } };
        },
        async approveWorkflowRun({ run_id }) {
          aprovados.push(run_id);
        },
      },
    },
  };
  return { github, aprovados, consultas };
}

/** Roda o script do passo com o mesmo ambiente que o actions/github-script. */
function rodar(scriptFonte, { github, sha }) {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const core = {
    warning() {},
    info() {},
    summary: { addRaw() { return this; }, async write() {} },
  };
  const context = { repo: { owner: 'adm01-debug', repo: 'Zapp_Web_V2' } };
  const process = { env: { PR_HEAD_SHA: sha } };
  // setTimeout imediato: a espera de 10 s entre tentativas nao interessa aqui.
  const setTimeoutImediato = (fn) => fn();
  const fn = new AsyncFunction('github', 'context', 'core', 'process', 'setTimeout', scriptFonte);
  return fn(github, context, core, process, setTimeoutImediato);
}

// O mesmo commit com runs de branches diferentes: o do PR de tipos, um do
// placar do Talk X e um da main — todos `action_required`.
const RUNS = [
  { id: 101, name: 'CI', head_sha: SHA, head_branch: BRANCH_SYNC, status: 'action_required' },
  { id: 202, name: 'CI', head_sha: SHA, head_branch: 'automation/talkx-status', status: 'action_required' },
  { id: 303, name: 'DB Guard', head_sha: SHA, head_branch: 'main', status: 'action_required' },
];

test('E21: run de outra branch no mesmo SHA nao e aprovado', async () => {
  const { github, aprovados } = apiFalsa(RUNS);
  await rodar(script, { github, sha: SHA });
  assert.deepEqual(
    aprovados,
    [101],
    'so o run da branch do PR de tipos pode ser aprovado (G-25: check alheio liberado)',
  );
});

test('E21: a consulta de runs filtra por head_branch alem do head_sha', async () => {
  const { github, consultas } = apiFalsa(RUNS);
  await rodar(script, { github, sha: SHA });
  assert.ok(consultas.length > 0, 'o passo precisa consultar os runs do commit');
  for (const c of consultas) {
    assert.equal(c.head_sha, SHA, 'o filtro por head_sha continua');
    assert.equal(c.status, 'action_required', 'o filtro por status continua');
    assert.equal(
      c.head_branch,
      BRANCH_SYNC,
      'a consulta precisa filtrar head_branch da branch de sincronizacao',
    );
  }
});

test('E21: o head_branch do filtro e o mesmo `branch:` do create-pull-request', () => {
  const m = /uses:\s*peter-evans\/create-pull-request@[a-f0-9]{40}[\s\S]*?\n\s+branch:\s*(\S+)/u.exec(workflow);
  assert.ok(m, 'nao achei o `branch:` do create-pull-request');
  assert.equal(m[1], BRANCH_SYNC, 'a branch do PR mudou: revise o filtro junto');
  assert.match(
    script,
    new RegExp(`head_branch:\\s*'${BRANCH_SYNC.replace('/', '\\/')}'`, 'u'),
    'o filtro head_branch precisa usar a mesma branch que o PR abre',
  );
});

/**
 * O Gate 3 ("remocoes destrutivas") roda no job `gates-e-pr`, DEPOIS do passo
 * "Aplicar candidatos no worktree" — que sobrescreve
 * `supabase/schema-catalog.json` com o candidato. Chamar
 * `check-remocoes-destrutivas.mjs supabase/schema-catalog.json
 * /tmp/catalog.new.json` ali comparava o candidato consigo mesmo: dois arquivos
 * identicos, zero objetos removidos, gate sempre verde. Um `DROP TABLE` de
 * tabela ainda consumida pelo `src/` passava direto para a PR de sync.
 *
 * O desenho travado aqui: o catalogo da `main` e copiado para
 * `/tmp/catalog.old.json` ANTES do sobrescrito, e o Gate 3 compara essa copia
 * com o candidato.
 */
test('Gate 3: o catalogo da main e guardado antes de ser sobrescrito', () => {
  const iGate = workflow.indexOf('check-remocoes-destrutivas.mjs');
  assert.ok(iGate > 0, 'nao achei a chamada do check-remocoes-destrutivas.mjs');
  const antes = workflow.slice(0, iGate);
  // Ha dois passos "Aplicar candidatos no worktree" (um por job); o que importa
  // para o Gate 3 e o ultimo antes dele, no job `gates-e-pr`.
  const iSobrescrito = antes.lastIndexOf('cp /tmp/catalog.new.json supabase/schema-catalog.json');
  assert.ok(iSobrescrito > 0, 'nao achei o passo que sobrescreve o catalogo antes do Gate 3');
  const iCopia = antes.lastIndexOf('cp supabase/schema-catalog.json /tmp/catalog.old.json');
  assert.ok(iCopia > 0, 'o catalogo da main precisa ser copiado para /tmp/catalog.old.json');
  assert.ok(
    iCopia < iSobrescrito,
    'a copia tem de vir ANTES do sobrescrito, senao guarda o candidato',
  );
});

test('Gate 3: a comparacao usa a copia antiga, nao o worktree sobrescrito', () => {
  const m = /check-remocoes-destrutivas\.mjs\s+(\S+)\s+(\S+)/u.exec(workflow);
  assert.ok(m, 'nao achei a chamada do check-remocoes-destrutivas.mjs no workflow');
  assert.equal(m[1], '/tmp/catalog.old.json', 'o catalogo ANTIGO do Gate 3 mudou');
  assert.equal(m[2], '/tmp/catalog.new.json', 'o catalogo NOVO do Gate 3 mudou');
  assert.notEqual(
    m[1],
    'supabase/schema-catalog.json',
    'comparar o worktree deixa o gate vacuo: o arquivo ja foi sobrescrito',
  );
});

test('Gate 3: roda depois do passo que sobrescreve o catalogo', () => {
  assert.ok(
    workflow.indexOf('cp /tmp/catalog.new.json supabase/schema-catalog.json') <
      workflow.indexOf('check-remocoes-destrutivas.mjs'),
    'se o Gate 3 passar a rodar antes do sobrescrito, a copia antiga deixa de ser necessaria',
  );
});
