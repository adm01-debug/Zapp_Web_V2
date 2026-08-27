// apply-batch.js — aplica um arquivo SQL no destino, statement a statement,
// emitindo NOTIFY pgrst,'reload schema' após cada DDL.
//
// Uso:
//   DATABASE_URL=<destino> node apply-batch.js <arquivo.sql> [--dry-run] [--no-notify]
//
// Flags:
//   --dry-run    imprime o que seria executado, sem tocar o banco
//   --no-notify  desativa o NOTIFY pgrst (use quando PostgREST não está rodando ainda)
//
// Comportamento:
//   - Divide SQL por ; ignorando ; dentro de $$ ... $$ (dollar-quoted)
//   - Ignora comentários standalone (-- ...)
//   - Em caso de erro num statement: loga e continua (não aborta o batch)
//   - Exit code 1 se qualquer statement falhou

const { Client } = require('pg');
const fs = require('fs');

const file = process.argv.find(a => !a.startsWith('--') && a !== process.argv[0] && a !== process.argv[1]);
const dryRun = process.argv.includes('--dry-run');
const noNotify = process.argv.includes('--no-notify');

if (!file) {
  console.error('Uso: node apply-batch.js <arquivo.sql> [--dry-run] [--no-notify]');
  process.exit(1);
}

const DDL_RE = /^\s*(CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COMMENT|INSERT INTO supabase_migrations)/i;

function splitStatements(sql) {
  const stmts = [];
  let cur = '', depth = 0, i = 0;
  while (i < sql.length) {
    const two = sql.slice(i, i + 2);
    if (two === '$$') { depth = depth ? 0 : 1; cur += two; i += 2; continue; }
    if (sql[i] === ';' && depth === 0) {
      const s = cur.trim();
      if (s && !s.match(/^--/)) stmts.push(s);
      cur = ''; i++; continue;
    }
    cur += sql[i++];
  }
  const last = cur.trim();
  if (last && !last.match(/^--/)) stmts.push(last);
  return stmts;
}

async function run() {
  const raw = fs.readFileSync(file, 'utf8');
  const stmts = splitStatements(raw);

  console.log(`[apply-batch] arquivo  : ${file}`);
  console.log(`[apply-batch] statements: ${stmts.length}`);
  console.log(`[apply-batch] notify   : ${!noNotify}`);
  if (dryRun) {
    console.log('[apply-batch] *** DRY RUN — nenhuma alteração será feita ***\n');
    stmts.forEach((s, i) =>
      console.log(`[${String(i+1).padStart(3)}/${stmts.length}] ${s.slice(0, 120).replace(/\n/g, ' ')}`));
    return;
  }

  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  let ok = 0, fail = 0;
  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i];
    const label = `[${String(i+1).padStart(3)}/${stmts.length}]`;
    const preview = stmt.slice(0, 100).replace(/\n/g, ' ');
    try {
      await c.query(stmt);
      if (DDL_RE.test(stmt) && !noNotify) {
        await c.query("SELECT pg_notify('pgrst', 'reload schema')");
      }
      console.log(`${label} OK   ${preview}`);
      ok++;
    } catch (e) {
      console.error(`${label} ERR  ${preview}`);
      console.error(`          → ${e.message}`);
      fail++;
    }
  }

  await c.end();
  console.log(`\n[apply-batch] resultado: ${ok} OK, ${fail} erro(s)`);
  if (fail > 0) process.exitCode = 1;
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
