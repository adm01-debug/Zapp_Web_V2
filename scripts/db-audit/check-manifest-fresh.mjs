#!/usr/bin/env node
/**
 * Compara supabase/schema-manifest.json com uma geracao fresca do banco oficial.
 *
 * Exit codes:
 *   0 = identico e identidade comprovada
 *   1 = drift estrutural (snapshot pode ser revisado/atualizado)
 *   2 = entrada invalida ou identidade nao comprovada (nunca atualizar snapshot)
 */
import fs from 'node:fs';

import {
  carregarIdentidadeEsperada,
  validarDestino,
  validarIdentidadeDoArtefato,
} from './database-identity.mjs';
import {
  compararManifestos,
  imprimirComparacao,
  validarManifesto,
} from './manifest-lib.mjs';

const frescoPath = process.argv[2];
if (!frescoPath) {
  console.error('uso: node check-manifest-fresh.mjs <manifesto_fresco.json>');
  process.exit(2);
}

const commitadoPath = process.env.MANIFEST_PATH || 'supabase/schema-manifest.json';
const identidadePath = process.env.CATALOG_IDENTITY_PATH || 'scripts/db-audit/database-identity.json';

function lerJson(arquivo, rotulo, opcoes = {}) {
  try {
    return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  } catch (error) {
    if (opcoes.permitirAusente && error.code === 'ENOENT') return null;
    console.error('ERRO: manifesto ' + rotulo + ' invalido (' + arquivo + '): ' + error.message);
    process.exit(2);
  }
}

const fresco = lerJson(frescoPath, 'fresco');
const commitado = lerJson(commitadoPath, 'commitado', { permitirAusente: true });

let esperada;
try {
  esperada = carregarIdentidadeEsperada(identidadePath);
} catch (error) {
  console.error('ERRO: ' + error.message);
  process.exit(2);
}

const errosFresco = [
  ...validarManifesto(fresco, 'fresco'),
  ...validarIdentidadeDoArtefato(fresco.database_identity, esperada, 'manifesto fresco'),
  ...validarDestino(process.env.DESTINO_URL, esperada),
];
if (errosFresco.length) {
  for (const erro of errosFresco) console.error('ERRO: ' + erro);
  process.exit(2);
}

if (commitado === null) {
  console.error(
    'DRIFT: snapshot commitado ausente; a geracao fresca teve identidade comprovada e requer revisao.',
  );
  process.exit(1);
}

const errosCommitado = [
  ...validarManifesto(commitado, 'commitado'),
  ...validarIdentidadeDoArtefato(commitado.database_identity, esperada, 'manifesto commitado'),
];
if (errosCommitado.length) {
  for (const erro of errosCommitado) console.error('DRIFT: ' + erro);
  console.error('\nManifesto versionado invalido ou desatualizado. Regenere somente apos revisar o diff.');
  process.exit(1);
}

const resultado = compararManifestos(commitado, fresco);
imprimirComparacao(resultado, 'arquivo', 'banco');

if (resultado.total) {
  console.error('\nManifesto desatualizado. Revise as divergencias antes de regenerar:');
  console.error(
    '  psql "$DESTINO_URL" -X -v ON_ERROR_STOP=1 -At ' +
    '-f scripts/db-audit/manifest.sql > supabase/schema-manifest.json',
  );
  process.exit(1);
}

console.log('\nOK: manifesto estrutural em sincronia com o banco oficial.');
