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

import { resolverCaminhoPermitido } from '../lib/seguranca-processo.mjs';
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

// S8707: caminho de entrada nunca entra cru num fs.* — a guarda vive no modulo
// compartilhado (scripts/lib/seguranca-processo.mjs): resolve e exige que o
// resultado fique dentro do repositorio ou do diretorio temporario do sistema
// (as duas raizes legitimas: snapshot commitado e arquivo fresco do psql num
// tmp). `../../etc/passwd` ou absoluto fora delas e recusado. Fail-closed:
// fora da raiz encerra com exit 2 (mesmo codigo de entrada invalida).
const frescoArg = process.argv[2];
if (!frescoArg) {
  console.error('uso: node check-manifest-fresh.mjs <manifesto_fresco.json>');
  process.exit(2);
}

let frescoPath;
let commitadoPath;
let identidadePath;
try {
  frescoPath = resolverCaminhoPermitido(frescoArg, 'manifesto fresco');
  commitadoPath = resolverCaminhoPermitido(
    process.env.MANIFEST_PATH || 'supabase/schema-manifest.json',
    'manifesto commitado',
  );
  identidadePath = resolverCaminhoPermitido(
    process.env.CATALOG_IDENTITY_PATH || 'scripts/db-audit/database-identity.json',
    'identidade do banco',
  );
} catch (erro) {
  console.error('ERRO: ' + erro.message);
  process.exit(2);
}

function lerJson(arquivo, rotulo, opcoes = {}) {
  try {
    return JSON.parse(fs.readFileSync(arquivo, 'utf8')); // NOSONAR(S8707): 'arquivo' so recebe frescoPath/commitadoPath, ja resolvidos por resolverCaminhoPermitido (exit 2 fora do repo/tmp) antes deste read
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
