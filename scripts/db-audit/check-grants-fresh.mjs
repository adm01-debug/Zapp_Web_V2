#!/usr/bin/env node
/**
 * Confere se scripts/db-audit/grants-baseline.json ainda reflete o banco.
 *
 * Compara apenas o conteudo de ACL (anon_execute, anon_table_select,
 * authenticated_execute_count, service_role_execute_count) — chaves de
 * metadados como generated_at/note/how_to_regenerate mudam a cada geracao
 * e nao devem contar como drift (isso ja derrubou a main em 2026-09-22).
 *
 * Extraido do heredoc que antes vivia embutido em types-sync.yml: a logica
 * so era testada por regex contra o texto do workflow, nunca executada de
 * verdade num teste. Ver check-grants-fresh.test.mjs.
 *
 * Uso:
 *   psql "$DESTINO_URL" -X -v ON_ERROR_STOP=1 -At \
 *     -f scripts/db-audit/grants-baseline.sql > /tmp/grants.new.json
 *   node scripts/db-audit/check-grants-fresh.mjs /tmp/grants.new.json
 *
 * Exit codes: 0=identico, 1=drift revisavel, 2=entrada invalida.
 */
import fs from 'node:fs';

const fresco = process.argv[2];
if (!fresco) {
  console.error('uso: node check-grants-fresh.mjs <grants_fresco.json>');
  process.exit(2);
}

const commitadoPath = process.env.GRANTS_BASELINE_PATH || 'scripts/db-audit/grants-baseline.json';

function ler(arquivo, rotulo) {
  try {
    return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  } catch (error) {
    console.error('ERRO: baseline de grants ' + rotulo + ' invalido (' + arquivo + '): ' + error.message);
    return null;
  }
}

const isSortedUniqueStrings = (value) => Array.isArray(value)
  && value.every((item) => typeof item === 'string' && item.length > 0)
  && value.every((item, index) => index === 0 || value[index - 1] < item);

const valid = (value) => value && typeof value === 'object' && !Array.isArray(value)
  && isSortedUniqueStrings(value.anon_execute)
  && isSortedUniqueStrings(value.anon_table_select)
  && Number.isInteger(value.authenticated_execute_count)
  && value.authenticated_execute_count >= 0
  && Number.isInteger(value.service_role_execute_count)
  && value.service_role_execute_count >= 0;

const METADADOS = new Set(['generated_at', 'note', 'how_to_regenerate']);
const canon = (value) => Array.isArray(value) ? value.map(canon)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canon(value[key])]))
    : value;
const aclOnly = (value) => Object.fromEntries(
  Object.entries(value).filter(([key]) => !METADADOS.has(key)),
);

const fresh = ler(fresco, 'fresco');
const committed = ler(commitadoPath, 'commitado');

if (!valid(fresh) || !valid(committed)) {
  if (fresh !== null && !valid(fresh)) {
    console.error('ERRO: baseline de grants fresco tem formato invalido (' + fresco + ')');
  }
  if (committed !== null && !valid(committed)) {
    console.error('ERRO: baseline de grants commitado tem formato invalido (' + commitadoPath + ')');
  }
  process.exit(2);
}

if (JSON.stringify(canon(aclOnly(fresh))) === JSON.stringify(canon(aclOnly(committed)))) {
  console.log('OK: baseline de grants em sincronia com o banco.');
  process.exit(0);
}

console.error('Baseline de grants desatualizado. Regenere e commite:');
console.error(
  '  psql "$DESTINO_URL" -X -v ON_ERROR_STOP=1 -At -f scripts/db-audit/grants-baseline.sql > ' + commitadoPath,
);
process.exit(1);
