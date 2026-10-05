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

const GENERICO = join(AQUI, 'generic-migration-runtime.sql');

// Resolucao explicita do contrato de uma versao: dedicado tem precedencia
// absoluta; sem dedicado, so cai no generico quando permitirGenerico e'
// verdadeiro -- e so se o arquivo generico existir com conteudo. Um dedicado
// que existe mas esta vazio e defeito, nao ausencia: falha fechada igual ao
// lerContrato, nunca downgrade silencioso para o generico.
export function resolverContrato(versao, { permitirGenerico = false, dir = CONTRATOS, generico = GENERICO } = {}) {
  const dedicado = caminhoDoContrato(versao, dir);
  if (existsSync(dedicado)) {
    if (!readFileSync(dedicado, 'utf8').trim()) {
      throw new Error(`contrato vazio para a versao ${versao}: ${dedicado}`);
    }
    return { caminho: dedicado, origem: 'dedicado' };
  }
  if (permitirGenerico) {
    if (existsSync(generico) && readFileSync(generico, 'utf8').trim()) {
      return { caminho: generico, origem: 'generico' };
    }
    throw new Error(
      `contrato de runtime ausente para a versao ${versao}: ${dedicado}; `
      + `e o contrato generico esta ausente ou vazio: ${generico}`,
    );
  }
  throw new Error(`contrato de runtime ausente para a versao ${versao}: ${dedicado}`);
}

function principal(argv) {
  const versao = argv[2];
  const permitirGenerico = argv.slice(3).includes('--generico-se-ausente');
  let sql;
  try {
    const resolvido = resolverContrato(versao, { permitirGenerico });
    if (resolvido.origem === 'generico') {
      console.error(`sem contrato dedicado para ${versao}; usando o contrato runtime generico.`);
    }
    sql = readFileSync(resolvido.caminho, 'utf8');
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
