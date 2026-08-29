#!/usr/bin/env node
/**
 * Confere se supabase/schema-catalog.json ainda reflete o banco.
 *
 * O guard de acoplamento roda offline contra o catalogo commitado. O preco disso
 * e que o catalogo pode envelhecer. Este script e o contrapeso: compara o arquivo
 * com uma geracao fresca do banco e falha se divergir.
 *
 * Uso:
 *   psql "$DESTINO_URL" -At -f scripts/db-audit/catalog.sql > /tmp/fresh.json
 *   node scripts/db-audit/check-catalog-fresh.mjs /tmp/fresh.json
 *
 * Compara CONJUNTOS, nao bytes - a formatacao do jsonb_pretty nao bate com a do
 * arquivo commitado e isso nao importa. Colunas incluem tipo e nulabilidade para
 * que alteracoes de contrato tambem invalidem o catalogo.
 */
import fs from 'node:fs';

const fresco = process.argv[2];
if (!fresco) {
  console.error('uso: node check-catalog-fresh.mjs <catalogo_fresco.json>');
  process.exit(2);
}

const catalogoCommitado = process.env.CATALOG_PATH || 'supabase/schema-catalog.json';

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
const SECOES = ['tables', 'views', 'columns', 'functions'];

let problemas = 0;
for (const secao of SECOES) {
  const arrayA = A[secao];
  const arrayB = B[secao];
  if (!Array.isArray(arrayA) || !arrayA.every((item) => typeof item === 'string')) {
    console.error('[' + secao + '] secao ausente ou invalida no catalogo commitado');
    problemas++;
    continue;
  }
  if (!Array.isArray(arrayB) || !arrayB.every((item) => typeof item === 'string')) {
    console.error('[' + secao + '] secao ausente ou invalida no catalogo fresco');
    problemas++;
    continue;
  }

  const setA = new Set(arrayA);
  const setB = new Set(arrayB);
  const duplicadosA = arrayA.length - setA.size;
  const duplicadosB = arrayB.length - setB.size;
  const soNoArquivo = [...setA].filter((x) => !setB.has(x)).sort();
  const soNoBanco = [...setB].filter((x) => !setA.has(x)).sort();
  problemas += soNoArquivo.length + soNoBanco.length + duplicadosA + duplicadosB;
  console.log(
    '[' + secao + '] arquivo: ' + setA.size + ' | banco: ' + setB.size +
    ' | so no arquivo: ' + soNoArquivo.length + ' | so no banco: ' + soNoBanco.length,
  );
  if (duplicadosA) console.error('  entradas duplicadas no catalogo commitado: ' + duplicadosA);
  if (duplicadosB) console.error('  entradas duplicadas no catalogo fresco: ' + duplicadosB);
  if (soNoArquivo.length) console.error('  removidos do banco mas ainda no catalogo: ' + soNoArquivo.join(', '));
  if (soNoBanco.length) console.error('  criados no banco e ausentes do catalogo: ' + soNoBanco.join(', '));
}

if (problemas) {
  console.error('\nCatalogo desatualizado. Regenere e commite:');
  console.error('  psql "$DESTINO_URL" -At -f scripts/db-audit/catalog.sql > supabase/schema-catalog.json');
  process.exit(1);
}
console.log('\nOK: catalogo em sincronia com o banco.');
