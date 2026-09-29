#!/usr/bin/env node
/**
 * Snapshot do contrato de Telefonia (etapas T04 e T93 do plano
 * `docs/design/PLANO_TELEFONIA_FINALIZACAO_100_ETAPAS_2026-09-29.md`).
 *
 * Roda `scripts/db-audit/telefonia-snapshot.sql` no banco de destino e grava o
 * JSON em disco, para que o diff entre execucoes (pos-fase-0 vs final) seja
 * revisavel num PR.
 *
 * Uso:
 *   DESTINO_URL=postgres://... node scripts/db-audit/telefonia-snapshot.mjs <saida.json>
 *
 * Tambem aceita TELEFONIA_SNAPSHOT_OUT no lugar do argumento. A identidade do
 * banco e conferida antes de qualquer consulta (mesmo contrato do
 * check-catalog-fresh.mjs): sem DESTINO_URL ou apontando para outro projeto, o
 * script sai com codigo 2 e nao escreve nada.
 *
 * Exit codes: 0=snapshot gravado, 2=entrada/identidade insegura ou psql falhou.
 *
 * Nao e passo de CI: exige credencial viva do banco canonico, que so existe no
 * ambiente com DESTINO_URL. Quem roda o gate de drift e o db-guard/db-live-guard.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { withPsqlEnvironment } from './psql-environment.mjs';
import {
  carregarIdentidadeEsperada,
  validarDestino,
} from './database-identity.mjs';

const SQL_PATH = process.env.TELEFONIA_SNAPSHOT_SQL || 'scripts/db-audit/telefonia-snapshot.sql';
const IDENTITY_PATH = process.env.CATALOG_IDENTITY_PATH || 'scripts/db-audit/database-identity.json';
const PSQL_BIN = process.env.PSQL_BIN || 'psql';

const destino = (process.argv[2] || process.env.TELEFONIA_SNAPSHOT_OUT || '').trim();
if (!destino) {
  console.error('uso: DESTINO_URL=postgres://... node scripts/db-audit/telefonia-snapshot.mjs <saida.json>');
  process.exit(2);
}

const url = process.env.DESTINO_URL?.trim();
if (!url) {
  console.error('ERRO: DESTINO_URL ausente; nao foi possivel provar a identidade do banco.');
  process.exit(2);
}

let identidade;
try {
  identidade = carregarIdentidadeEsperada(IDENTITY_PATH);
} catch (error) {
  console.error('ERRO: ' + error.message);
  process.exit(2);
}

const problemas = validarDestino(url, identidade);
if (problemas.length > 0) {
  // As mensagens de validarDestino nao contem credencial.
  console.error('ERRO: ' + problemas.join('; '));
  process.exit(2);
}

let bruto;
try {
  bruto = withPsqlEnvironment(url, env => execFileSync(PSQL_BIN,
    ['-X', '-v', 'ON_ERROR_STOP=1', '-At', '-f', SQL_PATH],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000, env }));
} catch (error) {
  // Nem o stderr e seguro: libpq, proxies ou wrappers podem repetir credenciais.
  const status = Number.isInteger(error?.status) ? error.status : '?';
  console.error(`ERRO: psql falhou (exit ${status}); diagnostico suprimido.`);
  process.exit(2);
}

let snapshot;
try {
  snapshot = JSON.parse(bruto.trim());
} catch {
  console.error('ERRO: a saida do psql nao e um JSON valido.');
  process.exit(2);
}

fs.mkdirSync(path.dirname(path.resolve(destino)), { recursive: true });
fs.writeFileSync(destino, JSON.stringify(snapshot, null, 2) + '\n');
console.log(`Snapshot gravado em ${destino} (tabela public.calls: ${snapshot.counts.total} linhas; funcoes: ${snapshot.functions.length}).`);
