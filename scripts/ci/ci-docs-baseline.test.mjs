// TRA-009 — a documentação canônica de CI ficou para trás da baseline.
//
// PERÍMETRO DESTE CARTÃO (#177, recorte local): o plano de 100 etapas. Os invariantes do
// `CLAUDE.md` (contagem de workflows, política única de `strict`, fonte gerada) NÃO entram aqui —
// o arquivo é instrução de agente, exige aprovação do dono e mora no cartão t_bd92cc1f. Sem o
// hunk do `CLAUDE.md` esses casos ficariam vermelhos, e eles não pertencem a este recorte.
//
// Invariantes fixados aqui (o texto não é relido a cada PR; sem teste, o plano volta a divergir do
// estado reconciliado):
//   * cada checkbox do plano bate com o estado reconciliado (P006) e nada que aguarda runtime
//     aparece como concluído;
//   * as etapas citadas pelo TRA-009 têm linha própria na tabela de reconciliação;
//   * a tabela de abertura do adendo de 02/10 (E01/E13/E14/E16) mantém a evidência medida em
//     02/10 e não recebe o texto da Limitação da tabela de reconciliação;
//   * etapa marcada [x] não deixa no bloco um texto dizendo que ela está bloqueada.
//
// Os dois lados são provados por fixtures em string (estado anterior FALHA, corrigido PASSA),
// além das asserções sobre os arquivos reais.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PLANO = join(RAIZ, 'docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md');
const P006 = join(RAIZ, 'docs/reconciliation/tasks/P006.json');
const README_CI = join(RAIZ, 'docs/ci/README.md');
const DIR_WF = join(RAIZ, '.github', 'workflows');
const DB_MIGRATE = join(DIR_WF, 'db-migrate.yml');
const BUN_LOCK = join(RAIZ, 'bun.lock');

const ETAPAS_TRA009 = ['E01', 'E11', 'E55', 'E56', 'E62', 'E76', 'E93', 'E95', 'E96'];

// Estado auditado (P006) -> marca do checkbox no plano.
const MARCA = {
  DONE_VERIFIED: 'x', IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE: '~', PARTIAL: '~', NEEDS_REVALIDATION: '~',
  SUPERSEDED: '!', NOT_IMPLEMENTED: ' ', PRODUCT_DECISION_REQUIRED: ' ', BLOCKED_TECHNICAL: ' ',
};
// Etapas que ESTA entrega concluiu depois da auditoria; cada override exige linha na tabela.
const OVERRIDES = { E11: 'x', E95: 'x' };
const ESTADOS = ['CONCLUÍDA', 'AGUARDA RUNTIME', 'PARCIAL', 'PRECISA REVALIDAÇÃO',
  'REVOGADA', 'PENDENTE', 'DECISÃO PENDENTE', 'BLOQUEIO TÉCNICO'];
const NAO_CONCLUIDOS = new Set(['AGUARDA RUNTIME', 'PARCIAL', 'PRECISA REVALIDAÇÃO']);
const RE_ITEM = /^\s*-\s*\[([ xX~!])\]\s*\*\*(E\d{1,3})\*\*/;
const RE_RECON = /^\|\s*\*\*(E\d{1,3})\*\*[^|]*\|\s*`\[([ x~!])\]`\s*\*{0,2}([A-ZÇÃÉÍÓÚÊÔÂÀ\- ]+)/;

const linhas = (t) => t.split('\n');
const achata = (t) => t.replace(/\s+/g, ' ');

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
      out.push(`${t.id}: sem checkbox no plano`);
    } else if (marca !== estadoEsperado(t, overrides)) {
      out.push(`${t.id}: checkbox [${marca}] != [${estadoEsperado(t, overrides)}] para o estado ${t.status}`);
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
    if (!rec.has(id)) out.push(`${id}: sem linha na tabela de reconciliacao`);
  }
  for (const [id, r] of rec) {
    if (!ESTADOS.includes(r.estado)) out.push(`${id}: estado "${r.estado}" fora do vocabulario da tabela`);
    if (NAO_CONCLUIDOS.has(r.estado) && r.marca === 'x') out.push(`${id}: estado "${r.estado}" nao pode estar marcado [x]`);
    const t = tarefas.find((x) => x.id === id);
    if (t && r.marca !== estadoEsperado(t, overrides)) {
      out.push(`${id}: tabela [${r.marca}] != [${estadoEsperado(t, overrides)}] do estado reconciliado`);
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

// Fronteira da camada de reconciliacao (secao `## Reconciliação TRA-009`): as linhas de tabela
// dentro dela sao a evidencia declarada de cada etapa. Celula cortada no meio ("verdade…") e
// cabecalho `## ` repetido sao defeitos que o revisor ja recusou neste cartao.
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
    .map((l) => `celula cortada com "…" na tabela de reconciliacao: ${l.trim().slice(0, 90)}`);
}

function violacoesCabecalhoDuplicado(plano) {
  const out = [];
  const vistos = new Map();
  linhas(plano).forEach((l, i) => {
    const m = /^##\s+(.+?)\s*$/.exec(l);
    if (!m) return;
    if (vistos.has(m[1])) out.push(`cabecalho "## ${m[1]}" duplicado (linhas ${vistos.get(m[1]) + 1} e ${i + 1})`);
    else vistos.set(m[1], i);
  });
  return out;
}

// A tabela de abertura do adendo de 02/10 ("### Etapas superadas pela política vigente") registra o que foi
// MEDIDO em 02/10 — ela não é a camada de reconciliação. Trocar a célula de evidência pelo texto de
// Limitação do P006 (foi o que aconteceu com a E13 no primeiro envio deste cartão) apaga a evidência
// medida e faz a mesma frase aparecer nos dois lugares. As linhas E01/E13/E14/E16 são fixadas abaixo.
const ABERTURA_ESPERADA = {
  E01: '| **E01** restaurar `strict=false` | SUPERADA | medido `strict=false`, mas a política da casa é `true`; aplicar E01 deixaria o guard da casa em conflito permanente com a configuração |',
  E13: '| **E13** criar `settings-guard.yml` | JÁ EXISTIA desde `#1436` (`4ba2e1b94`) | `.github/workflows/settings-guard.yml`, schedule de 6 h; a §1 deste plano não o listou |',
  E14: '| **E14** `github-settings-guard.mjs` + testes | JÁ EXISTIA desde `#1436` (`4ba2e1b94`) | 6 testes verdes; o script **restaura via `PATCH`** — é ele que sustenta a política `strict=true` |',
  E16: '| **E16** apagar `auto-update-pr-branch.yml` | SUPERADA | não é código morto: o cabeçalho do próprio arquivo registra reativação em 01/10 para a política `strict=true` |',
};

const celulas = (l) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

function linhasDaAbertura(plano) {
  const ls = linhas(plano);
  const ini = ls.findIndex((l) => /^###\s+Etapas superadas pela política vigente/.test(l));
  if (ini === -1) return null;
  const out = [];
  for (let i = ini + 1; i < ls.length; i += 1) {
    if (/^###\s/.test(ls[i])) break;
    if (ls[i].startsWith('|')) out.push(ls[i]);
  }
  return out;
}

function tabelaDeAbertura(plano) {
  const ls = linhasDaAbertura(plano);
  if (ls === null) return null;
  const mapa = new Map();
  for (const l of ls) {
    const m = /^\|\s*\*\*(E\d{1,3})\*\*\s[^|]*\|/.exec(l);
    if (m) mapa.set(m[1], l);
  }
  return mapa;
}

function violacoesTabelaAbertura(plano, esperado = ABERTURA_ESPERADA) {
  const out = [];
  const tab = tabelaDeAbertura(plano);
  if (tab === null) return ['plano sem a secao "### Etapas superadas pela politica vigente"'];
  const rec = reconciliacao(plano);
  for (const [id, linhaEsperada] of Object.entries(esperado)) {
    const linha = tab.get(id);
    if (linha === undefined) { out.push(`${id}: sem linha na tabela de abertura do adendo de 02/10`); continue; }
    if (achata(linha) !== achata(linhaEsperada)) {
      out.push(`${id}: linha da tabela de abertura != evidencia medida em 02/10 ("${achata(linha).slice(0, 100)}")`);
    }
    const r = rec.get(id);
    if (!r) continue;
    const evidencia = celulas(linha)[2];
    const limitacao = celulas(r.linha).at(-1);
    if (limitacao && evidencia.includes(limitacao)) {
      out.push(`${id}: evidencia da abertura repete a Limitacao da tabela de reconciliacao`);
    }
  }
  return out;
}

// A evidência da E13 na abertura ("...a §1 deste plano não o listou") é conferível no próprio documento:
// a §1 lista o que o plano de 27/09 já entregou e não cita o settings-guard. Evidência copiada da
// camada de reconciliação — ou §1 e abertura discordando — acusa aqui, não no olho do revisor.
function linhasDaSecao1(plano) {
  const ls = linhas(plano);
  const ini = ls.findIndex((l) => /^##\s+1\.\s/.test(l));
  if (ini === -1) return null;
  const out = [];
  for (let i = ini + 1; i < ls.length; i += 1) {
    if (/^##\s/.test(ls[i])) break;
    out.push(ls[i]);
  }
  return out;
}

function violacoesEvidenciaDaE13(plano) {
  const s1 = linhasDaSecao1(plano);
  if (s1 === null) return ['plano sem a secao "## 1."'];
  const abertura = tabelaDeAbertura(plano);
  const linha = abertura && abertura.get('E13');
  if (!linha) return ['E13: sem linha na tabela de abertura do adendo de 02/10'];
  const cita = s1.some((l) => l.includes('settings-guard'));
  const diz = /a §1 deste plano não o listou/.test(linha);
  const out = [];
  if (cita && diz) {
    out.push('E13: a evidencia da abertura diz que a §1 nao listou o settings-guard, mas a §1 cita o arquivo');
  }
  if (!cita && !diz) {
    out.push('E13: a §1 lista o settings-guard e a evidencia da abertura nao registra isso');
  }
  return out;
}

// Bloco marcado [x] (concluída) que ainda afirma estar bloqueado precisa dizer que a nota é histórica e
// apontar a conclusão — foi o texto que sobrou contradizendo o checkbox reconciliado da E11.
const RE_NOTA_BLOQUEIO = /est[áa] bloquead[ao]|N[ÃA]O pode cumprir|nao pode cumprir/i;
const RE_RESSALVA_HISTORICA = /hist[óo]ric/i;

function violacoesBlocoConcluidoBloqueado(plano) {
  const out = [];
  for (const [id, b] of blocosSuperados(plano)) {
    if (b.marca !== 'x') continue;
    if (!RE_NOTA_BLOQUEIO.test(b.texto)) continue;
    if (!RE_RESSALVA_HISTORICA.test(b.texto) || !/Reconcilia/.test(b.texto)) {
      out.push(`${id}: checkbox [x] mas o bloco ainda diz que a etapa esta bloqueada, sem ressalva historica que aponte a reconciliacao`);
    }
  }
  return out;
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

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

const ABERTURA_OK = [
  '### Etapas superadas pela política vigente',
  '',
  '| Etapa | Status | Evidência medida em 02/10 |',
  '|---|---|---|',
  '| **E01** restaurar `strict=false` | SUPERADA | medido `strict=false` |',
  '| **E13** criar `settings-guard.yml` | JÁ EXISTIA | `.github/workflows/settings-guard.yml`, schedule de 6 h |',
  '| **E14** `github-settings-guard.mjs` + testes | JÁ EXISTIA | 6 testes verdes |',
  '| **E16** apagar `auto-update-pr-branch.yml` | SUPERADA | não é código morto |',
  '',
  '### Próxima seção',
].join('\n');

const ABERTURA_ESPERADA_FIXTURE = {
  E01: '| **E01** restaurar `strict=false` | SUPERADA | medido `strict=false` |',
  E13: '| **E13** criar `settings-guard.yml` | JÁ EXISTIA | `.github/workflows/settings-guard.yml`, schedule de 6 h |',
  E14: '| **E14** `github-settings-guard.mjs` + testes | JÁ EXISTIA | 6 testes verdes |',
  E16: '| **E16** apagar `auto-update-pr-branch.yml` | SUPERADA | não é código morto |',
};

const LIMITACAO_E13 = 'Guards existem e explicitam pontos cegos; administração não se comprova só com GITHUB_TOKEN (403).';

const ABERTURA_TROCADA = ABERTURA_OK
  .replace('`.github/workflows/settings-guard.yml`, schedule de 6 h |', `${LIMITACAO_E13} |`)
  + `\n| **E13** | \`[~]\` PRECISA REVALIDAÇÃO | PR #1436, #1834 | ${LIMITACAO_E13} |`;

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

test('fixture: etapa que aguarda runtime marcada [x] e rejeitada, [~] passa', () => {
  assert.ok(violacoesChecklist(PLANO_ANTES, [TAREFA_E76]).length > 0, 'E76 aguardando runtime nao pode ficar [x]');
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
  assert.ok(violacoesCelulaTruncada(RECON_TRUNCADA).length > 0,
    'celula cortada no meio tinha de ser rejeitada');
  assert.deepEqual(violacoesCelulaTruncada(RECON_COMPLETA), []);
  assert.deepEqual(violacoesCelulaTruncada(`${RECON_COMPLETA}\n\n## 0. Sumário executivo\n| x | outro… |`), [],
    'a regra vale so para a tabela de reconciliacao, nao para o plano inteiro');
  assert.ok(violacoesCabecalhoDuplicado('## 0. Sumário executivo\n## 0. Sumário executivo').length > 0,
    'cabecalho "## " repetido tinha de ser rejeitado');
  assert.deepEqual(violacoesCabecalhoDuplicado(RECON_COMPLETA), []);
});

test('fixture: troca da celula de evidencia na tabela de abertura e rejeitada', () => {
  assert.deepEqual(violacoesTabelaAbertura(ABERTURA_OK, ABERTURA_ESPERADA_FIXTURE), []);
  const v = violacoesTabelaAbertura(ABERTURA_TROCADA, ABERTURA_ESPERADA_FIXTURE);
  assert.ok(v.some((x) => x.startsWith('E13: linha da tabela de abertura')),
    'a E13 com texto de Limitacao no lugar da evidencia medida tinha de ser rejeitada');
  // a regra vale por si: mesmo passando a Limitacao como texto "esperado", repetir a mesma frase nos
  // dois lugares (abertura e reconciliacao) continua sendo defeito.
  assert.ok(
    violacoesTabelaAbertura(ABERTURA_TROCADA, { E13: `| **E13** criar \`settings-guard.yml\` | JÁ EXISTIA | ${LIMITACAO_E13} |` })
      .some((x) => x.includes('repete a Limitacao')),
    'repetir a Limitacao do P006 na evidencia da abertura tinha de ser rejeitado',
  );
  assert.ok(violacoesTabelaAbertura('## Outra seção\n', ABERTURA_ESPERADA_FIXTURE).length > 0,
    'plano sem a tabela de abertura tinha de ser rejeitado');
});

test('fixture: bloco [x] que ainda diz estar bloqueado e rejeitado', () => {
  const bloco = [
    '- [x] **E11** - Corrigir o `CLAUDE.md` nos 5 pontos divergentes.',
    '  - ⚠️ **Nota de execução (03/10/2026) — a etapa está bloqueada.**',
  ].join('\n');
  assert.ok(violacoesBlocoConcluidoBloqueado(bloco).length > 0,
    'checkbox [x] com texto de bloqueio tinha de ser rejeitado');
  const corrigido = `${bloco}\n  - ✅ **Nota de status (05/10/2026):** a nota de 03/10 é histórica; ver Reconciliação TRA-009.`;
  assert.deepEqual(violacoesBlocoConcluidoBloqueado(corrigido), []);
  assert.deepEqual(violacoesBlocoConcluidoBloqueado(bloco.replace('- [x]', '- [ ]')), [],
    'bloqueio sem checkbox concluido continua legitimo');
});

// ── Arquivos reais ───────────────────────────────────────────────────────────

test('inventario: 16 YAML em .github/workflows e a fonte gerada em paridade', async () => {
  const arquivos = (await readdir(DIR_WF)).filter((f) => /\.ya?ml$/.test(f));
  assert.equal(arquivos.length, 16, 'o numero de workflows mudou: a documentacao precisa acompanhar');
  const readme = await readFile(README_CI, 'utf8');
  assert.match(readme, /\*\*16 workflows\.\*\*/, 'docs/ci/README.md nao declara os 16 workflows');
  for (const f of arquivos) assert.ok(readme.includes(f), `docs/ci/README.md nao cita ${f}`);
});

test('plano: cada checkbox bate com o estado reconciliado do P006', async () => {
  const plano = await readFile(PLANO, 'utf8');
  const { tasks } = JSON.parse(await readFile(P006, 'utf8'));
  assert.equal(tasks.length, 100, 'o plano de referencia tem 100 etapas');
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
    assert.match(b.texto, /SUPERAD|REVOGAD/i,
      `${id} esta marcada como superada mas o corpo nao diz que nao deve ser reexecutada`);
  }
});

test('plano: inventario atual e 16 YAML com fonte gerada', async () => {
  const plano = await readFile(PLANO, 'utf8');
  const chato = achata(plano);
  assert.match(chato, /\*\*16\*\* arquivos YAML em `\.github\/workflows\/`/);
  assert.ok(plano.includes('docs/ci/README.md'), 'o plano precisa apontar a fonte gerada');
  assert.ok(plano.includes('render-workflow-docs.mjs'), 'o plano precisa citar o gerador');
  assert.match(chato, /403[^.]*limite de evidência/i);
  for (const id of ETAPAS_TRA009) assert.ok(plano.includes(id), `o plano perdeu a etapa ${id}`);
});

test('E62/E76: os numeros citados conferem com o repositorio', async () => {
  const plano = await readFile(PLANO, 'utf8');
  const rec = reconciliacao(plano);

  const linhasDb = (await readFile(DB_MIGRATE, 'utf8')).split('\n');
  if (linhasDb.at(-1) === '') linhasDb.pop();
  const e62 = rec.get('E62');
  assert.ok(e62, 'E62 precisa de linha na tabela');
  assert.ok(e62.linha.includes(`${linhasDb.length} linhas`),
    `E62 deve registrar o tamanho atual do db-migrate.yml (${linhasDb.length} linhas)`);
  assert.match(e62.linha, /guardas de DB|pós-apply/i, 'E62 nao pode sugerir remover as guardas de DB');

  const lock = await readFile(BUN_LOCK, 'utf8');
  assert.ok(/playwright@1\.63\.0/.test(lock), 'bun.lock precisa resolver playwright 1.63.0');
  assert.ok(/playwright-core@1\.63\.0/.test(lock), 'bun.lock precisa resolver playwright-core 1.63.0');
  assert.ok(/@playwright\/test@1\.63\.0/.test(lock), 'bun.lock precisa resolver @playwright/test 1.63.0');

  const tres = ['ci.yml', 'e2e-logado.yml', 'e2e-talkx.yml'];
  for (const f of tres) {
    const wf = await readFile(join(DIR_WF, f), 'utf8');
    assert.ok(wf.includes('playwright@1.63.0'), `${f} precisa pinar playwright@1.63.0`);
  }
  const e76 = rec.get('E76');
  assert.ok(e76, 'E76 precisa de linha na tabela');
  for (const f of tres) assert.ok(e76.linha.includes(f), `E76 deve citar ${f}`);
  assert.match(e76.linha, /1\.63\.0/, 'E76 deve registrar a versao 1.63.0');
  assert.match(e76.linha, /não há mismatch/i, 'E76 deve registrar que nao ha mismatch de versao');
});

test('plano: tabela de reconciliacao sem celula cortada e sem cabecalho "## " duplicado', async () => {
  const plano = await readFile(PLANO, 'utf8');
  assert.deepEqual(violacoesCelulaTruncada(plano), [],
    'nenhuma linha da tabela de reconciliacao pode terminar em "…"');
  assert.deepEqual(violacoesCabecalhoDuplicado(plano), [],
    'o plano nao pode ter cabecalho "## " repetido');
});

test('plano: tabela de abertura do adendo de 02/10 mantem a evidencia medida (E01/E13/E14/E16)', async () => {
  assert.deepEqual(violacoesTabelaAbertura(await readFile(PLANO, 'utf8')), [],
    'a evidencia medida em 02/10 nao pode ser trocada por texto da camada de reconciliacao');
});

test('plano: a evidencia da E13 na abertura confere com a secao 1 do proprio documento', async () => {
  assert.deepEqual(violacoesEvidenciaDaE13(await readFile(PLANO, 'utf8')), [],
    'a abertura e a secao 1 nao podem discordar sobre o settings-guard');
});

test('plano: etapa marcada [x] nao deixa texto dizendo que esta bloqueada', async () => {
  assert.deepEqual(violacoesBlocoConcluidoBloqueado(await readFile(PLANO, 'utf8')), [],
    'a E11 esta concluida: a nota de 03/10 precisa estar rotulada como historica');
});
