#!/usr/bin/env node
/**
 * R2-INF-005 (reauditoria de 03/10/2026): extrai o heredoc EXATO que o passo
 * "Validar registro no ledger" do db-migrate.yml entrega ao psql.
 *
 * Por que este modulo existe: o contrato do passo E65 conferia a consulta por
 * PRESENCA DE TEXTO -- procurava `AND statements IS NOT NULL` dentro do YAML.
 * Isso nao distingue SQL de qualquer outro texto: as tres linhas iniciadas por
 * `#` (comentario de BASH, invalido em SQL) que ficaram DENTRO do heredoc
 * passavam pela assercao, e a consulta nunca executava -- o parser do
 * PostgreSQL aborta no `#`. Quem prova o SQL e' o SQL executado, e nao o texto
 * que o contem.
 *
 * Aqui nao ha parser de YAML: o bloco `run: |` e' desindentado pela propria
 * regra do literal block scalar (a indentacao base e' a da primeira linha nao
 * vazia do bloco), que e' exatamente o que o runner do GitHub entrega ao bash.
 *
 * Consumidores:
 *  - scripts/ci/verify-ledger-statements.unit.mjs -- tokeniza o heredoc com o
 *    lexer SQL do repositorio e recusa comentario de Bash (lane rapida do CI);
 *  - scripts/db-audit/ledger-postapply-query.integration.mjs -- executa o
 *    heredoc exato em PostgreSQL 17 descartavel.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PASSO_VALIDAR_LEDGER = '- name: Validar registro no ledger';

/**
 * Devolve o script shell de um `run: |` dentro de um passo do workflow,
 * desindentado como o literal block scalar do YAML (e nao como `sed`).
 * @param {string} textoWorkflow conteudo bruto do .yml
 * @param {string} nomeDoPasso linha `- name: <passo>` que abre o passo
 * @returns {string}
 */
export function extrairBlocoRun(textoWorkflow, nomeDoPasso) {
  const inicio = textoWorkflow.indexOf(nomeDoPasso);
  if (inicio < 0) throw new Error(`passo "${nomeDoPasso}" nao encontrado no workflow`);
  const depoisDoNome = textoWorkflow.slice(inicio + nomeDoPasso.length);
  const proximoPasso = depoisDoNome.indexOf('\n      - name:');
  const passo = textoWorkflow.slice(
    inicio,
    proximoPasso < 0 ? undefined : inicio + nomeDoPasso.length + proximoPasso,
  );

  const linhas = passo.split('\n');
  const idxRun = linhas.findIndex((linha) => /^\s*run:\s*\|-?\s*$/.test(linha));
  if (idxRun < 0) throw new Error(`passo "${nomeDoPasso}" nao tem bloco "run: |"`);

  let i = idxRun + 1;
  while (i < linhas.length && linhas[i].trim() === '') i += 1;
  if (i >= linhas.length) throw new Error(`bloco "run: |" de "${nomeDoPasso}" esta vazio`);
  const base = /^ */u.exec(linhas[i])[0].length;

  const corpo = [];
  for (; i < linhas.length; i += 1) {
    const linha = linhas[i];
    if (linha.trim() === '') {
      corpo.push('');
      continue;
    }
    if (/^ */u.exec(linha)[0].length < base) break;
    corpo.push(linha.slice(base));
  }
  while (corpo.length > 0 && corpo[corpo.length - 1] === '') corpo.pop();
  return corpo.join('\n');
}

/**
 * Devolve o corpo do heredoc `<<'TAG'` do script. O delimitador tem de estar na
 * coluna 0 (regra do `<<` sem '-'); se nao estiver, o heredoc nao termina e o
 * bash engole o resto do script -- por isso o erro, em vez de um recorte
 * silencioso.
 * @param {string} script
 * @param {string} tag
 * @returns {string}
 */
export function extrairHeredoc(script, tag) {
  const linhas = script.split('\n');
  const abertura = linhas.findIndex((linha) => new RegExp(`<<-?\\s*'?${tag}'?(?![A-Za-z0-9_])`).test(linha));
  if (abertura < 0) throw new Error(`heredoc <<'${tag}' nao encontrado no script`);
  let fim = abertura + 1;
  while (fim < linhas.length && linhas[fim] !== tag) fim += 1;
  if (fim >= linhas.length) {
    throw new Error(`heredoc <<'${tag}' nao termina: o delimitador precisa da coluna 0`);
  }
  return linhas.slice(abertura + 1, fim).join('\n');
}

/**
 * A consulta SQL exata do passo "Validar registro no ledger".
 * @param {string} textoWorkflow
 * @returns {string}
 */
export function extrairConsultaDoLedger(textoWorkflow) {
  return extrairHeredoc(extrairBlocoRun(textoWorkflow, PASSO_VALIDAR_LEDGER), 'SQL');
}

export function caminhoPadraoDoWorkflow() {
  return resolve(fileURLToPath(import.meta.url), '../../..', '.github/workflows/db-migrate.yml');
}

function main() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--workflow');
  const caminho = idx >= 0 && args[idx + 1] ? args[idx + 1] : caminhoPadraoDoWorkflow();
  const consulta = extrairConsultaDoLedger(readFileSync(caminho, 'utf8'));
  process.stdout.write(`${consulta}\n`);
}

if (process.argv[1] && process.argv[1].endsWith('extrair-consulta-ledger.mjs')) main();
