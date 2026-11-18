#!/usr/bin/env node
// Gerador do bloco "Objetos por tipo" de docs/DB-INVENTORY.md.
//
// POR QUE ELE EXISTE: a guarda `scripts/ci/db-inventory-doc.unit.mjs` compara as
// contagens do documento com `supabase/schema-catalog.json`. O catálogo é
// REGENERADO pelo bot do types-sync; o documento, não — ele era escrito à mão.
// Resultado: todo objeto novo no banco quebrava a guarda e CONGELAVA a PR do
// types-sync até alguém lembrar de editar o markdown. Aconteceu na #3256 e de
// novo em 18/11/2026, com as 6 colunas e as 2 RPCs do X065.
//
// O gerador reescreve SÓ a tabela de contagens da seção "## Objetos por tipo".
// Todo o resto do documento — inclusive o inventário de tabelas, com status e
// consumidores, que é curadoria humana e a guarda confere contra o repositório —
// fica intocado.
//
// Uso:
//   node scripts/db/gen-db-inventory.mjs           # reescreve o documento
//   node scripts/db/gen-db-inventory.mjs --check   # falha se estiver desatualizado

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CATALOGO = resolve(RAIZ, 'supabase/schema-catalog.json');
export const DOC = resolve(RAIZ, 'docs/DB-INVENTORY.md');

/** Rótulo de cada chave do catálogo, na ordem em que o documento as lista. */
export const LINHAS = [
  ['tables', 'Tabelas'],
  ['views', 'Views'],
  ['columns', 'Colunas'],
  ['functions', 'Funções'],
  ['function_signatures', 'Assinaturas de função'],
  ['trigger_functions', 'Funções de gatilho'],
  ['check_constraints', 'Restrições de verificação'],
];

const tamanho = (v) => (Array.isArray(v) ? v.length : Object.keys(v ?? {}).length);

/** Tabela markdown das contagens, a partir do catálogo já lido. */
export function tabelaDeContagens(catalogo) {
  const linhas = ['| Objeto | Quantidade |', '|---|---|'];
  for (const [chave, rotulo] of LINHAS) {
    if (catalogo[chave] === undefined) continue;
    linhas.push(`| ${rotulo} (\`${chave}\`) | ${tamanho(catalogo[chave])} |`);
  }
  return linhas.join('\n');
}

/**
 * Troca a tabela de contagens dentro da seção "## Objetos por tipo", preservando
 * o texto que vem antes e depois dela. Erra alto se a seção sumiu: é melhor
 * falhar do que reescrever o documento errado.
 */
export function documentoAtualizado(doc, catalogo) {
  const linhas = doc.split('\n');
  const inicio = linhas.findIndex((l) => /^##\s+Objetos por tipo\b/u.test(l));
  if (inicio === -1) throw new Error('seção "## Objetos por tipo" não encontrada em DB-INVENTORY.md');
  const relativo = linhas.slice(inicio + 1);
  const fimRel = relativo.findIndex((l) => /^##\s/u.test(l));
  const fim = fimRel === -1 ? linhas.length : inicio + 1 + fimRel;

  const bloco = linhas.slice(inicio + 1, fim);
  const t0 = bloco.findIndex((l) => /^\|\s*Objeto\s*\|/u.test(l));
  if (t0 === -1) throw new Error('tabela de contagens não encontrada na seção "Objetos por tipo"');
  let t1 = t0;
  while (t1 < bloco.length && bloco[t1].trimStart().startsWith('|')) t1++;

  const novo = [
    ...linhas.slice(0, inicio + 1 + t0),
    ...tabelaDeContagens(catalogo).split('\n'),
    ...linhas.slice(inicio + 1 + t1),
  ];
  return novo.join('\n');
}

function principal(argv) {
  const catalogo = JSON.parse(readFileSync(CATALOGO, 'utf8'));
  const atual = readFileSync(DOC, 'utf8');
  const esperado = documentoAtualizado(atual, catalogo);
  if (argv.includes('--check')) {
    if (atual === esperado) {
      console.log('gen-db-inventory: docs/DB-INVENTORY.md em dia com o catálogo.');
      return 0;
    }
    console.error('gen-db-inventory: docs/DB-INVENTORY.md DESATUALIZADO — rode `node scripts/db/gen-db-inventory.mjs` e commite.');
    return 1;
  }
  if (atual === esperado) {
    console.log('gen-db-inventory: nada a fazer, já estava em dia.');
    return 0;
  }
  writeFileSync(DOC, esperado);
  console.log('gen-db-inventory: docs/DB-INVENTORY.md atualizado a partir do catálogo.');
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(principal(process.argv.slice(2)));
