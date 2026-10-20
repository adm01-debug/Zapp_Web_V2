#!/usr/bin/env node
/**
 * E96: gera `docs/ci/README.md` a partir do bloco `# docs:` do topo de cada workflow.
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
 * e o README é a projeção desses blocos. `--check` falha se divergir — é o que
 * trava a regressão no CI (a etapa pede `--check` verde).
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

/** Nome amigável: `name:` do workflow, senão o nome do arquivo. */
function nomeDe(texto, arquivo) {
  const m = /^name:\s*(.+?)\s*$/m.exec(texto);
  return m ? m[1] : arquivo.replace(/\.yml$/, '');
}

const arquivos = (await readdir(DIR_WF)).filter((f) => f.endsWith('.yml')).sort();

const docs = [];
const semBloco = [];
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
  docs.push({ arquivo, nome: nomeDe(texto, arquivo), ...bloco });
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
  '| Workflow | Arquivo | Gatilho | O que prova | Quando falha | Quem é avisado |',
  '|---|---|---|---|---|---|',
  ...docs.map(
    (d) =>
      `| ${d.nome} | [\`${d.arquivo}\`](../../.github/workflows/${d.arquivo}) | ${d.gatilho} | ${d.prova} | ${d.falha} | ${d.avisa} |`,
  ),
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

const conteudo = linhas.join('\n');

if (process.argv.includes('--check')) {
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

await mkdir(dirname(README), { recursive: true });
await writeFile(README, conteudo, 'utf8');
console.log(`docs/ci/README.md gerado a partir de ${docs.length} workflows.`);
