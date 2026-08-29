#!/usr/bin/env node
/**
 * Confere se supabase/schema-catalog.json ainda reflete o banco.
 *
 * O guard de acoplamento roda offline contra o catalogo commitado. O preco disso
 * e que o catalogo pode envelhecer. Este script e o contrapeso: compara o arquivo
 * com uma geracao fresca do banco e falha se divergir.
 *
 * Uso:
 *   psql "$DESTINO_URL" -X -v ON_ERROR_STOP=1 -At \
 *     -f scripts/db-audit/catalog.sql > /tmp/fresh.json
 *   node scripts/db-audit/check-catalog-fresh.mjs /tmp/fresh.json
 *
 * Compara CONJUNTOS, nao bytes - a formatacao do jsonb_pretty nao bate com a do
 * arquivo commitado e isso nao importa. Colunas incluem tipo e nulabilidade para
 * que alteracoes de contrato tambem invalidem o catalogo.
 *
 * Exit codes: 0=identico, 1=drift revisavel, 2=entrada/identidade insegura.
 */
import fs from 'node:fs';

import {
  carregarIdentidadeEsperada,
  validarDestino,
  validarIdentidadeDoArtefato,
} from './database-identity.mjs';

const fresco = process.argv[2];
if (!fresco) {
  console.error('uso: node check-catalog-fresh.mjs <catalogo_fresco.json>');
  process.exit(2);
}

const catalogoCommitado = process.env.CATALOG_PATH || 'supabase/schema-catalog.json';
const identidadePath = process.env.CATALOG_IDENTITY_PATH || 'scripts/db-audit/database-identity.json';

function lerCatalogo(arquivo, rotulo) {
  try {
    const catalogo = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    if (!catalogo || typeof catalogo !== 'object' || Array.isArray(catalogo)) {
      throw new Error('a raiz precisa ser um objeto JSON');
    }
    return catalogo;
  } catch (error) {
    console.error('ERRO: catalogo ' + rotulo + ' invalido (' + arquivo + '): ' + error.message);
    process.exit(2);
  }
}

const A = lerCatalogo(catalogoCommitado, 'commitado');
const B = lerCatalogo(fresco, 'fresco');
const SECOES = ['tables', 'views', 'columns', 'functions', 'function_signatures'];

let identidadeEsperada;
try {
  identidadeEsperada = carregarIdentidadeEsperada(identidadePath);
} catch (error) {
  console.error('ERRO: ' + error.message);
  process.exit(2);
}

let drifts = 0;
let errosOperacionais = 0;

for (const [catalogo, rotulo, tipo] of [
  [A, 'catalogo commitado', 'drift'],
  [B, 'catalogo fresco', 'operacional'],
]) {
  if (catalogo.format_version !== 2) {
    console.error(
      '[metadata] format_version invalido no ' + rotulo +
      ': esperado=2 obtido=' + JSON.stringify(catalogo.format_version),
    );
    if (tipo === 'drift') drifts++;
    else errosOperacionais++;
  }

  const errosIdentidade = validarIdentidadeDoArtefato(
    catalogo.database_identity,
    identidadeEsperada,
    rotulo,
  );
  for (const erro of errosIdentidade) console.error('[metadata] ' + erro);
  if (tipo === 'drift') drifts += errosIdentidade.length;
  else errosOperacionais += errosIdentidade.length;

  const sourceEsperado = identidadeEsperada.database + ' schema ' + identidadeEsperada.schema;
  if (catalogo.source !== sourceEsperado) {
    console.error(
      '[metadata] source invalido no ' + rotulo +
      ': esperado=' + JSON.stringify(sourceEsperado) +
      ' obtido=' + JSON.stringify(catalogo.source),
    );
    if (tipo === 'drift') drifts++;
    else errosOperacionais++;
  }

  if (catalogo.how_to_regenerate !== 'scripts/db-audit/catalog.sql') {
    console.error('[metadata] how_to_regenerate ausente ou invalido no ' + rotulo);
    if (tipo === 'drift') drifts++;
    else errosOperacionais++;
  }
}

const errosDestino = validarDestino(process.env.DESTINO_URL, identidadeEsperada);
for (const erro of errosDestino) console.error('[metadata] ' + erro);
errosOperacionais += errosDestino.length;

for (const secao of SECOES) {
  const arrayA = A[secao];
  const arrayB = B[secao];
  if (!Array.isArray(arrayA) || !arrayA.every((item) => typeof item === 'string')) {
    console.error('[' + secao + '] secao ausente ou invalida no catalogo commitado');
    drifts++;
    continue;
  }
  if (!Array.isArray(arrayB) || !arrayB.every((item) => typeof item === 'string')) {
    console.error('[' + secao + '] secao ausente ou invalida no catalogo fresco');
    errosOperacionais++;
    continue;
  }

  const setA = new Set(arrayA);
  const setB = new Set(arrayB);
  const duplicadosA = arrayA.length - setA.size;
  const duplicadosB = arrayB.length - setB.size;
  const soNoArquivo = [...setA].filter((x) => !setB.has(x)).sort();
  const soNoBanco = [...setB].filter((x) => !setA.has(x)).sort();
  drifts += soNoArquivo.length + soNoBanco.length + duplicadosA;
  errosOperacionais += duplicadosB;
  console.log(
    '[' + secao + '] arquivo: ' + setA.size + ' | banco: ' + setB.size +
    ' | so no arquivo: ' + soNoArquivo.length + ' | so no banco: ' + soNoBanco.length,
  );
  if (duplicadosA) console.error('  entradas duplicadas no catalogo commitado: ' + duplicadosA);
  if (duplicadosB) console.error('  entradas duplicadas no catalogo fresco: ' + duplicadosB);
  if (soNoArquivo.length) console.error('  removidos do banco mas ainda no catalogo: ' + soNoArquivo.join(', '));
  if (soNoBanco.length) console.error('  criados no banco e ausentes do catalogo: ' + soNoBanco.join(', '));
}

if (errosOperacionais) {
  console.error('\nERRO: catalogo fresco ou identidade nao sao confiaveis; snapshot nao deve ser atualizado.');
  process.exit(2);
}

if (drifts) {
  console.error('\nCatalogo desatualizado. Regenere e commite:');
  console.error(
    '  psql "$DESTINO_URL" -X -v ON_ERROR_STOP=1 -At ' +
    '-f scripts/db-audit/catalog.sql > supabase/schema-catalog.json',
  );
  process.exit(1);
}
console.log('\nOK: catalogo em sincronia com o banco.');
