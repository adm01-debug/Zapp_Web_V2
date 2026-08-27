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
 * arquivo commitado e isso nao importa.
 */
import fs from 'node:fs';

const fresco = process.argv[2];
if (!fresco) {
  console.error('uso: node check-catalog-fresh.mjs <catalogo_fresco.json>');
  process.exit(2);
}

const A = JSON.parse(fs.readFileSync('supabase/schema-catalog.json', 'utf8'));
const B = JSON.parse(fs.readFileSync(fresco, 'utf8'));

let problemas = 0;
for (const secao of ['tables', 'views', 'functions']) {
  const setA = new Set(A[secao] || []);
  const setB = new Set(B[secao] || []);
  const soNoArquivo = [...setA].filter((x) => !setB.has(x)).sort();
  const soNoBanco = [...setB].filter((x) => !setA.has(x)).sort();
  problemas += soNoArquivo.length + soNoBanco.length;
  console.log(
    '[' + secao + '] arquivo: ' + setA.size + ' | banco: ' + setB.size +
    ' | so no arquivo: ' + soNoArquivo.length + ' | so no banco: ' + soNoBanco.length,
  );
  if (soNoArquivo.length) console.error('  removidos do banco mas ainda no catalogo: ' + soNoArquivo.join(', '));
  if (soNoBanco.length) console.error('  criados no banco e ausentes do catalogo: ' + soNoBanco.join(', '));
}

if (problemas) {
  console.error('\nCatalogo desatualizado. Regenere e commite:');
  console.error('  psql "$DESTINO_URL" -At -f scripts/db-audit/catalog.sql > supabase/schema-catalog.json');
  process.exit(1);
}
console.log('\nOK: catalogo em sincronia com o banco.');
