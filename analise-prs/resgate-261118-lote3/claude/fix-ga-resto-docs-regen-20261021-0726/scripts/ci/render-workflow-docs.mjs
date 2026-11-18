#!/usr/bin/env node
/**
 * W96: gera `docs/ci/README.md` a partir dos blocos `# docs:` e `# nao-e-bug:` de cada workflow.
 *
 * Por que existe: um workflow de 900 linhas só conta o que faz e a quem avisa se
 * alguém escrever isso. Comentário solto no meio do arquivo não é lido, e um
 * README escrito à mão desatualiza no primeiro PR que mexe num gatilho.
 *
 * O contrato: cada YAML carrega, no topo, um bloco
 *
 *   # docs:
 *   #   gatilho: <quando roda>
 *   #   prova:   <o que ele prova>
 *   #   falha:   <o que acontece quando falha>
 *   #   avisa:   <quem é avisado>
 *
 * e opcionalmente:
 *
 *   # nao-e-bug:
 *   #   - <chave>: <descricao>
 *
 * O README é a projeção desses blocos. `--check` falha se divergir — é o que
 * trava a regressão no CI (a etapa pede `--check` verde).
 *
 * KPI opcional: se `docs/ci/kpi.json` existir, as colunas "custo/semana (min)"
 * e "taxa de falha (7 d)" são lidas de lá (chaves: `custo_semana_min` e
 * `taxa_falha_7d`, indexadas pelo nome do arquivo YAML). Sem o arquivo, "—".
 *
 * Uso:
 *   node scripts/ci/render-workflow-docs.mjs           # escreve o README
 *   node scripts/ci/render-workflow-docs.mjs --check   # falha se divergir
 */

import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..');
const DIR_WF = join(RAIZ, '.github', 'workflows');
const README = join(RAIZ, 'docs', 'ci', 'README.md');
const KPI_PATH = join(RAIZ, 'docs', 'ci', 'kpi.json');

const CAMPOS = ['gatilho', 'prova', 'falha', 'avisa'];

/** Extrai o bloco `# docs:` do topo do arquivo. Devolve null se não houver. */
function extrairDocs(texto) {
  const linhas = texto.split('\n');
  const saida = {};
  let dentro = false;

  for (const linha of linhas) {
    if (/^#\s*docs:\s*$/.test(linha)) {
      dentro = true;
      continue;
    }
    if (!dentro) continue;

    // Linha de comentário continua o bloco; qualquer outra coisa o encerra.
    const m = /^#\s+([a-z_]+):\s*(.+?)\s*$/.exec(linha);
    if (m) {
      saida[m[1]] = m[2];
      continue;
    }
    if (/^#\s*$/.test(linha) || linha.trim() === '') continue;
    break;
  }

  return Object.keys(saida).length ? saida : null;
}

/**
 * Extrai entradas do bloco `# nao-e-bug:` do topo do arquivo.
 * Cada item é uma linha `#   - <chave>: <descricao>`.
 * Devolve array de { chave, descricao } ou [] se não houver bloco.
 */
function extrairNaoEBug(texto) {
  const linhas = texto.split('\n');
  const itens = [];
  let dentro = false;

  for (const linha of linhas) {
    if (/^#\s*nao-e-bug:\s*$/.test(linha)) {
      dentro = true;
      continue;
    }
    if (!dentro) continue;

    const m = /^#\s+-\s+(.+?):\s*(.+?)\s*$/.exec(linha);
    if (m) {
      itens.push({ chave: m[1], descricao: m[2] });
      continue;
    }
    // Continuacao de item de varias linhas: `#     <texto>` (indentado além do `-`)
    // compoe a descricao do item anterior em vez de encerrar o bloco (GA98).
    const cont = /^#\s{5,}(\S.*?)\s*$/.exec(linha);
    if (cont && itens.length > 0) {
      itens[itens.length - 1].descricao += ' ' + cont[1];
      continue;
    }
    // Linha de comentário vazia continua; qualquer outra coisa (inclusive docs:) encerra.
    if (/^#\s*$/.test(linha)) continue;
    break;
  }

  return itens;
}

/** Nome amigável: `name:` do workflow, senão o nome do arquivo. */
function nomeDe(texto, arquivo) {
  const m = /^name:\s*(.+?)\s*$/m.exec(texto);
  return m ? m[1] : arquivo.replace(/\.yml$/, '');
}

export { extrairDocs, extrairNaoEBug };

// Fluxo executável (só quando rodado direto; importável para testes — GA98).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
// KPI: tenta carregar docs/ci/kpi.json; ignora silenciosamente se não existir.
let kpi = {};
try {
  kpi = JSON.parse(await readFile(KPI_PATH, 'utf8'));
} catch {
  // sem KPI → colunas ficam "—"
}

const arquivos = (await readdir(DIR_WF)).filter((f) => f.endsWith('.yml')).sort();

const docs = [];
const semBloco = [];
const naoEBugGlobal = [];

for (const arquivo of arquivos) {
  const texto = await readFile(join(DIR_WF, arquivo), 'utf8');
  const bloco = extrairDocs(texto);
  if (!bloco) {
    semBloco.push(arquivo);
    continue;
  }
  const faltando = CAMPOS.filter((c) => !bloco[c]);
  if (faltando.length) {
    console.error(`ERRO: ${arquivo} tem bloco # docs: sem ${faltando.join(', ')}`);
    process.exit(1);
  }
  const nome = nomeDe(texto, arquivo);
  const naoEBug = extrairNaoEBug(texto);
  for (const item of naoEBug) {
    naoEBugGlobal.push({ workflow: nome, arquivo, ...item });
  }
  docs.push({ arquivo, nome, ...bloco });
}

if (semBloco.length) {
  console.error(`ERRO: workflow sem bloco '# docs:' no topo: ${semBloco.join(', ')}`);
  console.error('Cada workflow precisa declarar gatilho, prova, falha e avisa.');
  process.exit(1);
}

const linhas = [
  '# Workflows de CI — o que cada um faz',
  '',
  '> **Gerado por `scripts/ci/render-workflow-docs.mjs`.** Não edite à mão: o CI roda',
  '> `--check` e falha se este arquivo divergir do bloco `# docs:` de cada workflow.',
  '> Para mudar o que está aqui, mude o bloco no YAML.',
  '',
  `**${docs.length} workflows.**`,
  '',
  '| Workflow | Arquivo | Gatilho | O que prova | Quando falha | Quem é avisado | Custo/sem (min) | Falha (7 d) |',
  '|---|---|---|---|---|---|---|---|',
  ...docs.map((d) => {
    const custo = kpi[d.arquivo]?.custo_semana_min ?? '—';
    const falha7d = kpi[d.arquivo]?.taxa_falha_7d ?? '—';
    return `| ${d.nome} | [\`${d.arquivo}\`](../../.github/workflows/${d.arquivo}) | ${d.gatilho} | ${d.prova} | ${d.falha} | ${d.avisa} | ${custo} | ${falha7d} |`;
  }),
  '',
  '## Detalhe',
  '',
  ...docs.flatMap((d) => [
    `### ${d.nome} (\`${d.arquivo}\`)`,
    '',
    `- **Gatilho:** ${d.gatilho}`,
    `- **O que prova:** ${d.prova}`,
    `- **Quando falha:** ${d.falha}`,
    `- **Quem é avisado:** ${d.avisa}`,
    '',
  ]),
];

if (naoEBugGlobal.length > 0) {
  linhas.push(
    '## O que NÃO é bug',
    '',
    '> Comportamentos que parecem erros mas são design intencional.',
    '> Cada item vem do bloco `# nao-e-bug:` do YAML do workflow.',
    '',
    '| Workflow | Situação | Por quê não é bug |',
    '|---|---|---|',
    ...naoEBugGlobal.map(
      (i) =>
        `| [\`${i.arquivo}\`](../../.github/workflows/${i.arquivo}) | **${i.chave}** | ${i.descricao} |`,
    ),
    '',
  );
}

const conteudo = linhas.join('\n');

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes('--check')) {
  let atual = '';
  try {
    atual = await readFile(README, 'utf8');
  } catch {
    console.error('ERRO: docs/ci/README.md não existe. Rode sem --check para gerar.');
    process.exit(1);
  }
  if (atual !== conteudo) {
    console.error('ERRO: docs/ci/README.md divergiu dos blocos `# docs:` dos workflows.');
    console.error('Rode `node scripts/ci/render-workflow-docs.mjs` e commite o resultado.');
    process.exit(1);
  }
  console.log(`OK: docs/ci/README.md bate com os ${docs.length} workflows.`);
  process.exit(0);
}

{
  await mkdir(dirname(README), { recursive: true });
  await writeFile(README, conteudo, 'utf8');
  console.log(`docs/ci/README.md gerado a partir de ${docs.length} workflows.`);
}
} // fim do fluxo executável (só roda direto)
