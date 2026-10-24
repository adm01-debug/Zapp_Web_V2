import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLAUDE = join(RAIZ, 'CLAUDE.md');
const PLANO = join(RAIZ, 'docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md');
const BASELINE = join(RAIZ, 'scripts/ci/github-settings-baseline.json');
const P006 = join(RAIZ, 'docs/reconciliation/tasks/P006.json');
const README_CI = join(RAIZ, 'docs/ci/README.md');
const DIR_WF = join(RAIZ, '.github', 'workflows');
const DB_MIGRATE = join(DIR_WF, 'db-migrate.yml');
const BUN_LOCK = join(RAIZ, 'bun.lock');

const ETAPAS_TRA009 = ['E01', 'E11', 'E55', 'E56', 'E62', 'E76', 'E93', 'E95', 'E96'];

const MARCA = {
  DONE_VERIFIED: 'x', IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE: '~', PARTIAL: '~', NEEDS_REVALIDATION: '~',
  SUPERSEDED: '!', NOT_IMPLEMENTED: ' ', PRODUCT_DECISION_REQUIRED: ' ', BLOCKED_TECHNICAL: ' ',
};
const OVERRIDES = { E11: 'x', E24: ' ', E38: 'x', E39: 'x', E95: 'x' };
const ESTADOS = ['CONCLUÍDA', 'AGUARDA RUNTIME', 'PARCIAL', 'PRECISA REVALIDAÇÃO',
  'REVOGADA', 'PENDENTE', 'DECISÃO PENDENTE', 'BLOQUEIO TÉCNICO'];
const NAO_CONCLUIDOS = new Set(['AGUARDA RUNTIME', 'PARCIAL', 'PRECISA REVALIDAÇÃO']);
const CONTAGEM_ANTIGA = [/dos\s+17\s+workflows/i, /17\s+no\s+total/i, /14\s+workflows/i, /14\s+arquivos/i];
const TOCA_STRICT_FALSE = /strict[ ]*[:=][ ]*`?false|`strict`[^\n]{0,40}`false`/i;
const ROTULO_HISTORICO = /revogad|REVOGAD|históric|HISTÓRIC|superad|SUPERAD|reconciliad|Reconcilia/;
const RE_ITEM = /^\s*-\s*\[([ xX~!])\]\s*\*\*(E\d{1,3})\*\*/;
const RE_RECON = /^\|\s*\*\*(E\d{1,3})\*\*[^|]*\|\s*`\[([ x~!])\]`\s*\*{0,2}([A-ZÇÃÉÍÓÚÊÔÂÀ\- ]+)/;

const linhas = (t) => t.split('\n');
const paragrafos = (t) => t.split(/\n[ \t]*\n/);
const achata = (t) => t.replace(/\s+/g, ' ');

function violacoesContagemClaude(texto, totalYaml) {
  const out = [];
  for (const l of linhas(texto)) {
    for (const re of CONTAGEM_ANTIGA) {
      if (re.test(l)) out.push('contagem antiga');
    }
  }
  const chato = achata(texto);
  if (!new RegExp(`\\*\\*${totalYaml}\\*\\* arquivos em \`.github/workflows/\``).test(chato)) {
    out.push(`CLAUDE.md nao declara os ${totalYaml} arquivos de .github/workflows/`);
  }
  if (!texto.includes('docs/ci/README.md')) {
    out.push('fonte canonica ausente');
  }
  return out;
}

function violacoesStrictClaude(texto) {
  const out = [];
  for (const p of paragrafos(texto)) {
    if (!TOCA_STRICT_FALSE.test(p)) continue;
    if (ROTULO_HISTORICO.test(p)) continue;
    out.push('strict=false sem rotulo');
  }
  return out;
}

function checkboxesDoPlano(plano) {
  const mapa = new Map();
  for (const l of linhas(plano)) {
    const m = RE_ITEM.exec(l);
    if (m) mapa.set(m[2], m[1].toLowerCase());
  }
  return mapa;
}

function estadoEsperado(tarefa, overrides = {}) {
  if (overrides[tarefa.id]) return overrides[tarefa.id];
  return MARCA[tarefa.status];
}

function violacoesChecklist(plano, tarefas, overrides = {}) {
  const out = [];
  const mapa = checkboxesDoPlano(plano);
  for (const t of tarefas) {
    const marca = mapa.get(t.id);
    if (marca === undefined) {
      out.push(`${t.id}: sem checkbox`);
    } else if (marca !== estadoEsperado(t, overrides)) {
      out.push(`${t.id}: checkbox divergente`);
    }
  }
  return out;
}

function reconciliacao(plano) {
  const mapa = new Map();
  for (const l of linhas(plano)) {
    const m = RE_RECON.exec(l);
    if (m) mapa.set(m[1], { marca: m[2], estado: m[3].trim(), linha: l });
  }
  return mapa;
}

function violacoesReconciliacao(plano, tarefas, overrides = {}, etapasExigidas = ETAPAS_TRA009) {
  const out = [];
  const rec = reconciliacao(plano);
  const precisa = new Set(etapasExigidas);
  for (const t of tarefas) {
    const declaradoOriginal = t.documentation.original_claim === 'CHECKED' ? 'x' : ' ';
    if (estadoEsperado(t, overrides) !== declaradoOriginal) precisa.add(t.id);
  }
  for (const id of precisa) {
    if (!rec.has(id)) out.push(`${id}: sem tabela`);
  }
  for (const [id, r] of rec) {
    if (!ESTADOS.includes(r.estado)) out.push(`${id}: estado invalido`);
    if (NAO_CONCLUIDOS.has(r.estado) && r.marca === 'x') out.push(`${id}: x invalido`);
    const t = tarefas.find((x) => x.id === id);
    if (t && r.marca !== estadoEsperado(t, overrides)) {
      out.push(`${id}: tabela divergente`);
    }
  }
  return out;
}

function blocosSuperados(plano) {
  const ls = linhas(plano);
  const blocos = new Map();
  for (let i = 0; i < ls.length; i += 1) {
    const m = RE_ITEM.exec(ls[i]);
    if (!m) continue;
    let fim = i + 1;
    while (fim < ls.length && !RE_ITEM.test(ls[fim]) && !ls[fim].startsWith('### ')) fim += 1;
    blocos.set(m[2], { marca: m[1].toLowerCase(), texto: ls.slice(i, fim).join('\n') });
  }
  return blocos;
}

function linhasDaReconciliacao(plano) {
  const ls = linhas(plano);
  const ini = ls.findIndex((l) => /^##\s+Reconciliação TRA-009/.test(l));
  if (ini === -1) return null;
  const out = [];
  for (let i = ini + 1; i < ls.length; i += 1) {
    if (/^##\s/.test(ls[i])) break;
    if (ls[i].startsWith('|')) out.push(ls[i]);
  }
  return out;
}

function violacoesCelulaTruncada(plano) {
  const tabela = linhasDaReconciliacao(plano);
  if (tabela === null) return ['plano sem a secao "## Reconciliação TRA-009"'];
  return tabela
    .filter((l) => l.includes('…'))
    .map(() => 'celula cortada');
}

function violacoesCabecalhoDuplicado(plano) {
  const out = [];
  const vistos = new Map();
  linhas(plano).forEach((l, i) => {
    const m = /^##\s+(.+?)\s*$/.exec(l);
    if (!m) return;
    if (vistos.has(m[1])) out.push('cabecalho duplicado');
    else vistos.set(m[1], i);
  });
  return out;
}

const CLAUDE_ANTES = [
  '**Plano vigente:** auditoria exaustiva dos 17 workflows + meta CI score 10/10.',
  'Auditoria dos 14 workflows + 3 dinâmicos (17 total), da branch protection.',
  'são 14 arquivos em `.github/workflows/` e mais 3 dinâmicos — 17 no total.',
  'Antes de qualquer `github_update_branch_protection`, ler o estado e repetir `strict: false`.',
].join('\n\n');

const CLAUDE_DEPOIS = [
  '**Plano vigente:** auditoria exaustiva dos **16** arquivos em `.github/workflows/` (+3 dinâmicos).',
  'A fonte canônica do inventário é o gerado `docs/ci/README.md`.',
  '**Correção de 2026-10-01 — HISTÓRICA, SUPERADA por E15(b):** repetir `strict: false` está REVOGADO.',
].join('\n\n');

const TAREFA_E76 = { id: 'E76', status: 'IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE', documentation: { original_claim: 'CHECKED' } };
const TAREFA_E62 = { id: 'E62', status: 'PARTIAL', documentation: { original_claim: 'UNCHECKED' } };

const PLANO_ANTES = [
  '- [x] **E76** - `bunx playwright@1.63.0` -> `bunx playwright`.',
  '- [ ] **E62** - Destino do `db-migrate.yml`.',
].join('\n');

const PLANO_DEPOIS = [
  '- [~] **E76** - AGUARDA RUNTIME (paridade 1.63.0 entre lock e workflows).',
  '- [~] **E62** - PARCIAL (12 contratos extraidos).',
  '| **E76** | `[~]` AGUARDA RUNTIME | `bun.lock` + os 3 workflows (1.63.0) | nao ha mismatch; remover o pin e opcao da E75 |',
  '| **E62** | `[~]` PARCIAL | PR #1778 | guardas de DB preservadas |',
].join('\n');

const RECON_TRUNCADA = [
  '## Reconciliação TRA-009 — estados, evidências e limitações (2026-10-05)',
  '',
  '| Etapa | Estado reconciliado | Evidência (PR) | Limitação |',
  '|---|---|---|---|',
  '| **E03** | `[~]` AGUARDA RUNTIME | PR #1343 | DB Live Guard atual verd… |',
  '',
  '## 0. Sumário executivo — o que está quebrado agora',
].join('\n');

const RECON_COMPLETA = [
  '## Reconciliação TRA-009 — estados, evidências e limitações (2026-10-05)',
  '',
  '| Etapa | Estado reconciliado | Evidência (PR) | Limitação |',
  '|---|---|---|---|',
  '| **E03** | `[~]` AGUARDA RUNTIME | PR #1343 | DB Live Guard atual verde. |',
  '',
  '## 0. Sumário executivo — o que está quebrado agora',
].join('\n');

test('fixture: CLAUDE.md com contagem antiga e strict=false solto e rejeitado', () => {
  assert.ok(violacoesContagemClaude(CLAUDE_ANTES, 16).length > 0);
  assert.ok(violacoesStrictClaude(CLAUDE_ANTES).length > 0);
});

test('fixture: CLAUDE.md corrigido passa (16 arquivos, fonte gerada, strict=false rotulado)', () => {
  assert.deepEqual(violacoesContagemClaude(CLAUDE_DEPOIS, 16), []);
  assert.deepEqual(violacoesStrictClaude(CLAUDE_DEPOIS), []);
});

test('fixture: etapa que aguarda runtime marcada [x] e rejeitada, [~] passa', () => {
  assert.ok(violacoesChecklist(PLANO_ANTES, [TAREFA_E76]).length > 0);
  assert.deepEqual(violacoesChecklist(PLANO_DEPOIS, [TAREFA_E76]), []);
  assert.deepEqual(violacoesChecklist(PLANO_DEPOIS, [TAREFA_E62]), []);
});

test('fixture: discrepancia sem linha na tabela de reconciliacao e rejeitada', () => {
  assert.ok(
    violacoesReconciliacao('- [~] **E62** - PARCIAL.', [TAREFA_E62], {}, []).length > 0,
    'E62 divergente sem linha na tabela tinha de ser rejeitado',
  );
  assert.deepEqual(violacoesReconciliacao(PLANO_DEPOIS, [TAREFA_E62, TAREFA_E76], {}, []), []);
});

test('fixture: celula cortada em "…" e cabecalho "## " duplicado sao rejeitados', () => {
  assert.ok(violacoesCelulaTruncada(RECON_TRUNCADA).length > 0);
  assert.deepEqual(violacoesCelulaTruncada(RECON_COMPLETA), []);
  assert.deepEqual(violacoesCelulaTruncada(`${RECON_COMPLETA}\n\n## 0. Sumário executivo\n| x | outro… |`), []);
  assert.ok(violacoesCabecalhoDuplicado('## 0. Sumário executivo\n## 0. Sumário executivo').length > 0);
  assert.deepEqual(violacoesCabecalhoDuplicado(RECON_COMPLETA), []);
});

test('inventario: 16 YAML em .github/workflows e a fonte gerada em paridade', async () => {
  const arquivos = (await readdir(DIR_WF)).filter((f) => /\.ya?ml$/.test(f));
  assert.equal(arquivos.length, 16);
  const readme = await readFile(README_CI, 'utf8');
  assert.match(readme, /\*\*16 workflows\.\*\*/);
  for (const f of arquivos) assert.ok(readme.includes(f));
});

test('CLAUDE.md: contagem atual e fonte canonica (sem 14/17)', async () => {
  assert.deepEqual(violacoesContagemClaude(await readFile(CLAUDE, 'utf8'), 16), []);
});

test('CLAUDE.md: politica unica de strict, coerente com o baseline', async () => {
  const claude = await readFile(CLAUDE, 'utf8');
  const baseline = JSON.parse(await readFile(BASELINE, 'utf8'));
  assert.equal(baseline.branch_protection_main.strict, true);
  assert.deepEqual(violacoesStrictClaude(claude), []);
  assert.match(claude, /\|\s*Branch protection — `strict`\s*\|\s*\*\*`true`\*\*/);
  assert.match(claude, /403 administrativo é limite de evidência/i);
});

test('plano: cada checkbox bate com o estado reconciliado do P006', async () => {
  const plano = await readFile(PLANO, 'utf8');
  const { tasks } = JSON.parse(await readFile(P006, 'utf8'));
  assert.equal(tasks.length, 100);
  assert.deepEqual(violacoesChecklist(plano, tasks, OVERRIDES), []);
});

test('plano: tabela de reconciliacao cobre as discrepancias e as etapas do TRA-009', async () => {
  const plano = await readFile(PLANO, 'utf8');
  const { tasks } = JSON.parse(await readFile(P006, 'utf8'));
  assert.deepEqual(violacoesReconciliacao(plano, tasks, OVERRIDES), []);
});

test('plano: nenhuma etapa superada pede reexecucao', async () => {
  for (const [id, b] of blocosSuperados(await readFile(PLANO, 'utf8'))) {
    if (b.marca !== '!') continue;
    assert.match(b.texto, /SUPERAD|REVOGAD/i);
  }
});

test('plano: inventario atual e 16 YAML com fonte gerada', async () => {
  const plano = await readFile(PLANO, 'utf8');
  const chato = achata(plano);
  assert.match(chato, /\*\*16\*\* arquivos YAML em `\.github\/workflows\/`/);
  assert.ok(plano.includes('docs/ci/README.md'));
  assert.ok(plano.includes('render-workflow-docs.mjs'));
  assert.match(chato, /403[^.]*limite de evidência/i);
  for (const id of ETAPAS_TRA009) assert.ok(plano.includes(id));
});

test('E62/E76: os numeros citados conferem com o repositorio', async () => {
  const plano = await readFile(PLANO, 'utf8');
  const rec = reconciliacao(plano);

  const linhasDb = (await readFile(DB_MIGRATE, 'utf8')).split('\n');
  if (linhasDb.at(-1) === '') linhasDb.pop();
  const e62 = rec.get('E62');
  assert.ok(e62);
  assert.ok(e62.linha.includes(`${linhasDb.length} linhas`));
  assert.match(e62.linha, /guardas de DB|pós-apply/i);

  const lock = await readFile(BUN_LOCK, 'utf8');
  assert.ok(/playwright@1\.63\.0/.test(lock));
  assert.ok(/playwright-core@1\.63\.0/.test(lock));
  assert.ok(/@playwright\/test@1\.63\.0/.test(lock));

  const tres = ['ci.yml', 'e2e-logado.yml', 'e2e-talkx.yml'];
  for (const f of tres) {
    const wf = await readFile(join(DIR_WF, f), 'utf8');
    assert.ok(wf.includes('playwright@1.63.0'));
  }
  const e76 = rec.get('E76');
  assert.ok(e76);
  for (const f of tres) assert.ok(e76.linha.includes(f), `E76 deve citar ${f}`);
  assert.match(e76.linha, /1\.63\.0/);
  assert.match(e76.linha, /não há mismatch/i);
});

test('plano: tabela de reconciliacao sem celula cortada e sem cabecalho "## " duplicado', async () => {
  const plano = await readFile(PLANO, 'utf8');
  assert.deepEqual(violacoesCelulaTruncada(plano), []);
  assert.deepEqual(violacoesCabecalhoDuplicado(plano), []);
});


test('plano: E13 na tabela de 02/10 preserva evidencia medida do #1436', async () => {
  const plano = await readFile(PLANO, 'utf8');
  const linha = linhas(plano).find((l) => l.startsWith('| **E13** criar `settings-guard.yml` |'));
  assert.ok(linha, 'linha E13 da tabela de 02/10 deve existir');
  assert.equal(
    linha,
    '| **E13** criar `settings-guard.yml` | JÁ EXISTIA desde `#1436` (`4ba2e1b94`) | `.github/workflows/settings-guard.yml`, schedule de 6 h; a §1 deste plano não o listou |',
  );
});


test('plano: E11 marcada concluida explicita reconciliacao na nota de execucao', async () => {
  const plano = await readFile(PLANO, 'utf8');
  assert.match(plano, /- \[x\] \*\*E11\*\*/);
  const inicio = plano.indexOf('Nota de execução (03/10/2026)');
  assert.notEqual(inicio, -1, 'nota de execução da E11 deve existir');
  const bloco = plano.slice(inicio, plano.indexOf('- [ ] **E12**', inicio));
  assert.match(bloco, /Reconciliado em 05\/10\/2026: concluída \(ver Reconciliação TRA-009\)\./);
});
