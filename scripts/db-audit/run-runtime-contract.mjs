// E62: executor generico do contrato de runtime.
//
// O passo "Provar estado runtime antes do push" do db-migrate.yml tinha um braco de
// `case` por versao (12 contratos, ~275 linhas uteis embutidas). Este executor
// substitui os bracos: para a versao alvo, le o contrato em
// `scripts/db-audit/contracts/<versao>.sql`, roda pelo mesmo cliente (psql-safe.mjs,
// os mesmos flags) e imprime o resultado, que o workflow compara ao
// CONFIRM_RUNTIME_SHA256 (composicao da E64).
//
// FAIL-CLOSED semantica (W29):
//   - sem arquivo dedicado  → lerContratoComFallback devolve o contrato generico;
//     proof.contract === 'generic' no output. O executor usa sempre esse caminho.
//   - arquivo dedicado vazio → falha fechado (exit 2): arquivo vazio e um engano.
//   - arquivo dedicado com conteudo → executa o contrato dedicado.
//
// lerContrato (exportada para testes) mantém o comportamento antigo (throw se ausente)
// para nao quebrar os testes de E62 que verificam as 12 contratos historicos.
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const CONTRATOS = join(AQUI, 'contracts');
const PSQL_SAFE = join(AQUI, 'psql-safe.mjs');
const GENERIC_SQL = join(AQUI, 'generic-migration-runtime.sql');

export function caminhoDoContrato(versao, dir = CONTRATOS) {
  const v = String(versao ?? '').trim();
  if (!/^\d{14}$/.test(v)) {
    throw new Error(`versao alvo invalida: "${versao}" (esperado 14 digitos)`);
  }
  return join(dir, `${v}.sql`);
}

// Comportamento original: throw se nao existe. Mantido para compatibilidade
// com os testes E62 que verificam os 12 contratos historicos.
export function lerContrato(versao, dir = CONTRATOS) {
  const arquivo = caminhoDoContrato(versao, dir);
  if (!existsSync(arquivo)) {
    throw new Error(`contrato de runtime ausente para a versao ${versao}: ${arquivo}`);
  }
  const sql = readFileSync(arquivo, 'utf8');
  if (!sql.trim()) throw new Error(`contrato vazio para a versao ${versao}: ${arquivo}`);
  return sql;
}

// W29: sem contrato dedicado → fallback para generic-migration-runtime.sql.
// Fail-closed so para arquivo dedicado VAZIO (engano explicito).
export function lerContratoComFallback(versao, dir = CONTRATOS) {
  const arquivo = caminhoDoContrato(versao, dir);
  if (!existsSync(arquivo)) {
    // W29: sem contrato dedicado → generico.
    return { sql: readFileSync(GENERIC_SQL, 'utf8'), tipo: 'generic' };
  }
  const sql = readFileSync(arquivo, 'utf8');
  // Arquivo dedicado vazio e um engano: fail-closed.
  if (!sql.trim()) throw new Error(`contrato vazio para a versao ${versao}: ${arquivo}`);
  return { sql, tipo: 'dedicado' };
}

function principal(argv) {
  const versao = argv[2];
  let contrato;
  try {
    contrato = lerContratoComFallback(versao);
  } catch (e) {
    console.error(`::error::${e.message}`);
    process.exit(2);
  }
  const r = spawnSync(process.execPath, [PSQL_SAFE, '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', contrato.sql], {
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    console.error(r.stderr || `::error::psql-safe saiu com ${r.status}`);
    process.exit(r.status ?? 1);
  }
  process.stdout.write(r.stdout);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) principal(process.argv);
