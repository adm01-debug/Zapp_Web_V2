#!/usr/bin/env node
/**
 * Diffa duas saidas v2 de manifest.sql.
 *   node scripts/db-audit/diff.mjs /tmp/src.json /tmp/dst.json
 *
 * Identidade e timestamp sao informativos: este comando pode comparar dois
 * bancos distintos. O check-manifest-fresh e quem prova o banco oficial.
 */
import fs from 'node:fs';

import {
  compararManifestos,
  imprimirComparacao,
  validarManifesto,
} from './manifest-lib.mjs';

const [a, b] = process.argv.slice(2);
if (!a || !b) {
  console.error('uso: node diff.mjs <manifesto_a.json> <manifesto_b.json>');
  process.exit(2);
}

function ler(arquivo, rotulo) {
  try {
    return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  } catch (error) {
    console.error('ERRO: manifesto ' + rotulo + ' invalido (' + arquivo + '): ' + error.message);
    process.exit(2);
  }
}

const A = ler(a, 'A');
const B = ler(b, 'B');
const erros = [...validarManifesto(A, 'A'), ...validarManifesto(B, 'B')];
if (erros.length) {
  for (const erro of erros) console.error('ERRO: ' + erro);
  process.exit(2);
}

function rotuloIdentidade(manifesto) {
  const identidade = manifesto.database_identity;
  return identidade.database + ' schema ' + identidade.schema + ' pg' + identidade.server_major;
}

console.log('A = ' + rotuloIdentidade(A) + '  (' + (A.generated_at || 'sem data') + ')');
console.log('B = ' + rotuloIdentidade(B) + '  (' + (B.generated_at || 'sem data') + ')');

const resultado = compararManifestos(A, B);
imprimirComparacao(resultado, 'A', 'B');

console.log('\nTotal de divergencias: ' + resultado.total);
process.exit(resultado.total ? 1 : 0);
