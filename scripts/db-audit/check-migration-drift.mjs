#!/usr/bin/env node
/**
 * Compara supabase/migrations/*.sql com supabase_migrations.schema_migrations
 * do banco de destino. Falha se o conjunto de versoes divergir.
 *
 * Nao compara apenas contagem - compara o CONJUNTO. Contagens iguais podem
 * esconder um arquivo a mais e um registro a menos.
 *
 * Uso:
 *   DESTINO_URL=postgres://... node scripts/db-audit/check-migration-drift.mjs
 *
 * Diretorios que comecam com _ (_foreign, _superseded) sao ignorados de proposito:
 * ficam fora do glob do `supabase db push`. Ver docs/MIGRATIONS.md.
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const DIR = 'supabase/migrations';
const url = process.env.DESTINO_URL;

if (!url) {
  console.log('DESTINO_URL ausente - checagem de drift pulada.');
  process.exit(0);
}

const arquivos = fs
  .readdirSync(DIR, { withFileTypes: true })
  .filter((e) => e.isFile() && e.name.endsWith('.sql'))
  .map((e) => e.name.slice(0, 14))
  .filter((v) => /^\d{14}$/.test(v))
  .sort();

const raw = execFileSync(
  'psql',
  [url, '-At', '-c', 'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version'],
  { encoding: 'utf8' },
);
const registro = raw.split('\n').map((s) => s.trim()).filter(Boolean).sort();

const setArq = new Set(arquivos);
const setReg = new Set(registro);
const semRegistro = arquivos.filter((v) => !setReg.has(v));
const semArquivo = registro.filter((v) => !setArq.has(v));

console.log('arquivos em ' + DIR + ': ' + arquivos.length);
console.log('registros em schema_migrations: ' + registro.length);

if (semRegistro.length) {
  console.error('\nArquivo no repo sem registro no banco (db push tentaria aplicar):');
  for (const v of semRegistro) console.error('  ' + v);
}
if (semArquivo.length) {
  console.error('\nRegistro no banco sem arquivo no repo (DDL fora do Git):');
  for (const v of semArquivo) console.error('  ' + v);
}

if (semRegistro.length || semArquivo.length) {
  console.error('\nVer docs/MIGRATIONS.md para o procedimento de reconciliacao.');
  process.exit(1);
}

console.log('OK: os dois lados tem exatamente o mesmo conjunto de versoes.');
