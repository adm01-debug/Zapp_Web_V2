#!/usr/bin/env node
// E82: redige o relatório do Playwright ANTES de virar artifact.
//
// `::add-mask::` protege o LOG do run -- não o arquivo. Dois motivos, ambos medidos:
//  * o `playwright-report` é HTML com o e-mail do usuário de teste gravado dentro
//    (título de teste, argumento do fill(), URL);
//  * e, pior, o motivo registrado em `scripts/ci/check-e2e-artifact-secrets.mjs`: quando
//    o `auth.setup` falha, o Playwright grava a árvore de acessibilidade em
//    `test-results/.../error-context.md` e o relatório embute esse conteúdo -- o campo de
//    SENHA aparece com o valor digitado em texto claro.
//
// Ou seja: redigir só o e-mail não resolve. Este script aceita VÁRIOS segredos
// (--segredo-env repetido) e o e2e-logado.yml passa as duas credenciais de E2E.
//
// O valor do segredo chega SEMPRE pelo nome da variável de ambiente, nunca pela linha de
// comando: argumento de processo aparece no `ps` e no log de erro. A saída imprime só
// contagens -- o valor não é ecoado nem quando substituído.

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Valor curto demais não é tratado como segredo: substituir uma string de 1-4 caracteres
// corromperia o relatório inteiro sem proteger nada.
export const TAMANHO_MINIMO = 5;

const BINARIOS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.zip', '.woff', '.woff2', '.ttf', '.ico', '.pdf']);

export function extensaoDe(caminho) {
  const ponto = caminho.lastIndexOf('.');
  return ponto === -1 ? '' : caminho.slice(ponto).toLowerCase();
}

/** Aceita um segredo ou uma lista; descarta vazios, curtos demais e repetidos. */
export function normalizarSegredos(segredos) {
  const lista = (Array.isArray(segredos) ? segredos : [segredos]).filter(
    (s) => typeof s === 'string' && s.length >= TAMANHO_MINIMO,
  );
  return [...new Set(lista)];
}

/** Todos os arquivos de texto sob `dir`, recursivo. Binário fica de fora. */
export function arquivosDeTexto(dir) {
  const saida = [];
  const pilha = [dir];
  while (pilha.length > 0) {
    const atual = pilha.pop();
    let entradas;
    try {
      entradas = readdirSync(atual, { withFileTypes: true });
    } catch {
      continue; // diretório ausente ou sem permissão: não é motivo para derrubar o CI
    }
    for (const entrada of entradas) {
      const caminho = join(atual, entrada.name);
      if (entrada.isDirectory()) pilha.push(caminho);
      else if (entrada.isFile() && !BINARIOS.has(extensaoDe(caminho))) saida.push(caminho);
    }
  }
  return saida.sort();
}

/** Redige todos os segredos da lista, numa passada só por arquivo. */
export function redigirConteudo(texto, segredos) {
  let saida = texto;
  let ocorrencias = 0;
  for (const segredo of normalizarSegredos(segredos)) {
    const partes = saida.split(segredo);
    ocorrencias += partes.length - 1;
    saida = partes.join('[redigido]');
  }
  return { texto: saida, ocorrencias };
}

/** Redige todos os arquivos de texto sob `dir`. Devolve só contagens. */
export function redigirDiretorio(dir, segredos) {
  const arquivos = arquivosDeTexto(dir);
  const lista = normalizarSegredos(segredos);
  let arquivosTocados = 0;
  let ocorrencias = 0;
  for (const caminho of arquivos) {
    let original;
    try {
      original = readFileSync(caminho, 'utf8');
    } catch {
      continue;
    }
    const { texto, ocorrencias: n } = redigirConteudo(original, lista);
    if (n === 0) continue;
    writeFileSync(caminho, texto);
    arquivosTocados += 1;
    ocorrencias += n;
  }
  return { arquivos: arquivos.length, arquivosTocados, ocorrencias, segredos: lista.length };
}

function principal(argv) {
  const dir = argv.find((a) => !a.startsWith('--'));
  const nomes = argv
    .filter((a) => a.startsWith('--segredo-env='))
    .map((a) => a.slice('--segredo-env='.length))
    .filter(Boolean);
  if (!dir || nomes.length === 0) {
    console.error('uso: redigir-relatorio.mjs <dir> --segredo-env=NOME [--segredo-env=OUTRO]');
    return 2;
  }
  const valores = [];
  const ignorados = [];
  for (const nome of nomes) {
    const valor = process.env[nome];
    // Sem o valor não há o que redigir. Falhar aqui derrubaria o E2E por causa de um
    // secret não configurado -- e o artifact tem `if-no-files-found: ignore`. O nome da
    // variável, esse sim, vai para o log: ajuda a diagnosticar sem expor nada.
    if (!valor) ignorados.push(`${nome} (vazio)`);
    else if (valor.length < TAMANHO_MINIMO) ignorados.push(`${nome} (curto demais)`);
    else valores.push(valor);
  }
  if (ignorados.length > 0) console.log(`aviso: ignorado(s): ${ignorados.join(', ')}`);
  if (valores.length === 0) {
    console.log('aviso: nenhum segredo utilizavel - nada a redigir');
    return 0;
  }
  if (!statSync(dir, { throwIfNoEntry: false })) {
    console.log(`aviso: ${dir} nao existe - nada a redigir`);
    return 0;
  }
  const r = redigirDiretorio(dir, valores);
  console.log(
    `redigido: ${r.ocorrencias} ocorrencia(s) de ${r.segredos} segredo(s) em ` +
      `${r.arquivosTocados} de ${r.arquivos} arquivo(s)`,
  );
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(principal(process.argv.slice(2)));
}
