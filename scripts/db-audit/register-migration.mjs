#!/usr/bin/env node
/**
 * Registra uma migration no ledger (supabase_migrations.schema_migrations)
 * seguindo o ritual anti-colisao do CLAUDE.md secao 1, regra 2: SELECT
 * max(version) fresco antes de registrar, aborta se a versao do arquivo nao
 * for estritamente maior, e confirma que o INSERT ... ON CONFLICT DO NOTHING
 * RETURNING nao veio vazio (colisao mascarada). Escrito depois de 3 colisoes
 * reais de versao nesta sessao (2026-09-16) causadas por branches paralelos
 * escolhendo o mesmo max(version)+1 antes de qualquer um mergear -- este
 * script nao evita a colisao em si (isso exige coordenacao entre branches),
 * mas garante que ela nunca passe DESPERCEBIDA no ledger.
 *
 * Uso:
 *   node scripts/db-audit/register-migration.mjs <arquivo.sql>
 *     Gera o bloco SQL pronto para colar no db_query (dry-run, nao toca o
 *     banco). Sempre valida o nome do arquivo e faz o parse dos statements.
 *
 *   DESTINO_URL=postgres://... node scripts/db-audit/register-migration.mjs <arquivo.sql> --apply
 *     Confere max(version) ao vivo, aborta se a versao nao for estritamente
 *     maior, roda o INSERT e aborta se RETURNING vier vazio.
 *
 * Variaveis auxiliares para testes offline:
 *   PSQL_BIN  executavel psql/fake (padrao: psql; nunca passa por shell)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  carregarIdentidadeEsperada,
  endurecerDestinoTls,
  validarDestino,
} from './database-identity.mjs';

const FILE_NAME_RE = /^(\d{14})_([a-z0-9][a-z0-9_-]*)\.sql$/;
const PSQL_BIN = process.env.PSQL_BIN || 'psql';

/**
 * Separa o conteudo do arquivo em statements SQL reais: remove comentarios
 * de linha (-- ...) fora de blocos dollar-quoted e so quebra em `;` quando
 * NAO esta dentro de um bloco $tag$...$tag$ (corpo de funcao/trigger).
 */
export function splitStatements(sql) {
  const statements = [];
  let current = '';
  let i = 0;
  let dollarTag = null;
  let inQuote = false;
  while (i < sql.length) {
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      current += sql[i];
      i += 1;
      continue;
    }
    // Strings simples: ';' e '--' dentro de '...' fazem parte do SQL — sem
    // este estado, o ledger registraria statements adulterados em silencio
    // (regra 7 do CLAUDE.md exige o SQL real e completo). Escape SQL '' e
    // respeitado.
    if (inQuote) {
      current += sql[i];
      if (sql[i] === "'") {
        if (sql[i + 1] === "'") {
          current += "'";
          i += 2;
          continue;
        }
        inQuote = false;
      }
      i += 1;
      continue;
    }
    if (sql[i] === "'") {
      inQuote = true;
      current += sql[i];
      i += 1;
      continue;
    }
    if (sql[i] === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i);
      i = nl === -1 ? sql.length : nl + 1;
      continue;
    }
    const dollarMatch = /^\$(?:[a-zA-Z_][a-zA-Z0-9_]*)?\$/.exec(sql.slice(i));
    if (dollarMatch) {
      dollarTag = dollarMatch[0];
      current += dollarTag;
      i += dollarTag.length;
      continue;
    }
    if (sql[i] === ';') {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      i += 1;
      continue;
    }
    current += sql[i];
    i += 1;
  }
  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);
  return statements;
}

/** Escolhe uma tag $foo$ garantida a nao aparecer dentro do proprio statement. */
function pickDollarQuoteTag(statement) {
  const candidates = ['stmt', 'reg', 'body', 'q1', 'q2', 'q3'];
  for (const c of candidates) {
    const tag = `$${c}$`;
    if (!statement.includes(tag)) return tag;
  }
  for (let n = 0; ; n += 1) {
    const tag = `$reg${n}$`;
    if (!statement.includes(tag)) return tag;
  }
}

export function buildInsertSql(version, name, statements) {
  const arrayItems = statements.map((stmt) => {
    const tag = pickDollarQuoteTag(stmt);
    return `  ${tag}${stmt}${tag}`;
  });
  return `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('${version}', '${name.replace(/'/g, "''")}', ARRAY[
${arrayItems.join(',\n')}
]::text[])
ON CONFLICT (version) DO NOTHING
RETURNING version, name, array_length(statements,1) AS n_statements;`;
}

function runPsql(url, sql) {
  try {
    return execFileSync(PSQL_BIN, [url, '-X', '-t', '-A', '-c', sql], { encoding: 'utf8' });
  } catch (err) {
    // err.message do execFileSync embute a linha de comando inteira — com a
    // DESTINO_URL (credencial). Relanca so o stderr do psql, truncado.
    const detalhe = (err.stderr || '').toString().slice(0, 300).trim();
    throw new Error(`psql falhou (exit ${err.status ?? '?'})${detalhe ? `: ${detalhe}` : ''}`);
  }
}

export function parseMigrationFile(filePath) {
  const abs = path.resolve(filePath);
  const base = path.basename(abs);
  const match = FILE_NAME_RE.exec(base);
  if (!match) {
    throw new Error(`Nome de arquivo invalido (esperado NNNNNNNNNNNNNN_nome.sql): ${base}`);
  }
  const [, version, name] = match;
  const content = fs.readFileSync(abs, 'utf8');
  const statements = splitStatements(content);
  if (statements.length === 0) {
    throw new Error('Nenhum statement real encontrado no arquivo (so comentarios/vazio).');
  }
  return { version, name, statements };
}

function main() {
  const args = process.argv.slice(2);
  const filePath = args.find((a) => !a.startsWith('--'));
  const apply = args.includes('--apply');
  if (!filePath) {
    console.error('Uso: node scripts/db-audit/register-migration.mjs <arquivo.sql> [--apply]');
    process.exitCode = 2;
    return;
  }

  let parsed;
  try {
    parsed = parseMigrationFile(filePath);
  } catch (err) {
    console.error(`ABORT: ${err.message}`);
    process.exitCode = 1;
    return;
  }
  const { version, name, statements } = parsed;
  const insertSql = buildInsertSql(version, name, statements);

  const url = process.env.DESTINO_URL;
  if (!apply || !url) {
    console.log('-- modo dry-run (sem --apply ou sem DESTINO_URL): cole este bloco no db_query.');
    console.log(insertSql);
    return;
  }

  // E46 (plano 2026-09-20): unico script db-audit que ESCREVE no banco —
  // blindagem contra banco errado ANTES de qualquer escrita (mesmo assert
  // do db-live-guard; errar o banco ja causou retrabalho real, CLAUDE.md §1).
  try {
    const esperada = carregarIdentidadeEsperada(
      process.env.DATABASE_IDENTITY_PATH || 'scripts/db-audit/database-identity.json',
    );
    const errosIdentidade = validarDestino(url, esperada);
    if (errosIdentidade.length) {
      for (const erro of errosIdentidade) console.error(`ABORT identidade: ${erro}`);
      process.exitCode = 1;
      return;
    }
  } catch (err) {
    console.error(`ABORT identidade: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  // Vetor libpq "last-wins": query params ?host=/?user=/?dbname= sobrescrevem
  // a authority da URI e passariam pelo parse acima (provado com psql real na
  // validacao adversarial de 2026-09-20). Allowlist estrita + TLS endurecido
  // (mesma rotina do db-live-guard) antes de qualquer psql.
  let urlSegura;
  {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      console.error('ABORT identidade: DESTINO_URL invalida; credencial nao exibida');
      process.exitCode = 1;
      return;
    }
    for (const chave of parsedUrl.searchParams.keys()) {
      if (chave !== 'sslmode' && chave !== 'sslrootcert') {
        console.error(`ABORT identidade: query param nao permitido na DESTINO_URL: ${chave}`);
        process.exitCode = 1;
        return;
      }
    }
    const tls = endurecerDestinoTls(url);
    if (tls.erros.length) {
      for (const erro of tls.erros) console.error(`ABORT identidade: ${erro}`);
      process.exitCode = 1;
      return;
    }
    urlSegura = tls.connectionString;
  }

  let maxRaw;
  try {
    maxRaw = runPsql(urlSegura, 'SELECT max(version) FROM supabase_migrations.schema_migrations').trim();
  } catch (err) {
    console.error(`ABORT: falha ao consultar max(version): ${err.message}`);
    process.exitCode = 1;
    return;
  }
  if (maxRaw && maxRaw >= version) {
    console.error(`ABORT: versao ${version} nao e estritamente maior que max(version) atual (${maxRaw}). Renomeie o arquivo.`);
    process.exitCode = 1;
    return;
  }

  let returned;
  try {
    returned = runPsql(urlSegura, insertSql).trim();
  } catch (err) {
    console.error(`ABORT: falha ao registrar: ${err.message}`);
    process.exitCode = 1;
    return;
  }
  if (!returned) {
    console.error(`ABORT: RETURNING vazio -- versao ${version} ja existe no ledger (colisao mascarada por ON CONFLICT DO NOTHING).`);
    process.exitCode = 1;
    return;
  }
  console.log(`OK: migration ${version} (${name}) registrada -- ${returned}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
