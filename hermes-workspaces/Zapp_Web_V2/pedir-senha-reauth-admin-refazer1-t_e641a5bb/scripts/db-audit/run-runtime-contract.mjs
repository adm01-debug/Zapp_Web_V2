// E62: executor generico do contrato de runtime.
//
// O passo "Provar estado runtime antes do push" do db-migrate.yml tinha um braco de
// `case` por versao (12 contratos, ~275 linhas uteis embutidas). Este executor
// substitui os bracos: para a versao alvo, le o contrato em
// `scripts/db-audit/contracts/<versao>.sql`, roda pelo mesmo cliente (psql-safe.mjs,
// os mesmos flags) e imprime o resultado, que o workflow compara ao
// CONFIRM_RUNTIME_SHA256 (composicao da E64).
//
// FAIL-CLOSED e requisito, nao detalhe: versao sem contrato NAO pode virar "nada a
// verificar" -- isso transformaria a rede de protecao num no-op silencioso. Sem
// arquivo, saida != 0 e nenhum resultado em stdout.
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const CONTRATOS = join(AQUI, 'contracts');
const PSQL_SAFE = join(AQUI, 'psql-safe.mjs');

export function caminhoDoContrato(versao, dir = CONTRATOS) {
  const v = String(versao ?? '').trim();
  if (!/^\d{14}$/.test(v)) {
    throw new Error(`versao alvo invalida: "${versao}" (esperado 14 digitos)`);
  }
  return join(dir, `${v}.sql`);
}

export function lerContrato(versao, dir = CONTRATOS) {
  const arquivo = caminhoDoContrato(versao, dir);
  if (!existsSync(arquivo)) {
    // Fail-closed: nunca devolver vazio como se estivesse tudo certo.
    throw new Error(`contrato de runtime ausente para a versao ${versao}: ${arquivo}`);
  }
  const sql = readFileSync(arquivo, 'utf8');
  if (!sql.trim()) throw new Error(`contrato vazio para a versao ${versao}: ${arquivo}`);
  return sql;
}

function principal(argv) {
  const versao = argv[2];
  let sql;
  try {
    sql = lerContrato(versao);
  } catch (e) {
    console.error(`::error::${e.message}`);
    process.exit(2);
  }
  const r = spawnSync(process.execPath, [PSQL_SAFE, '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql], {
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    console.error(r.stderr || `::error::psql-safe saiu com ${r.status}`);
    process.exit(r.status ?? 1);
  }
  process.stdout.write(r.stdout);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) principal(process.argv);
