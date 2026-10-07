#!/usr/bin/env node
/**
 * scripts/db-tests/run-all.mjs
 * Suite de regressao de banco — Fase 4 do plano de 50 etapas
 * Uso: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/db-tests/run-all.mjs
 *
 * Cada .sql e enviado inteiro para POST /rest/v1/rpc/mcp_exec, que devolve UM jsonb
 * `{rows, row_count, truncated, ms}`. A decodificacao e validacao do envelope ficam em
 * ./rpc-envelope.mjs (testado por ./run-all.unit.mjs, sem rede).
 *
 * A suite so pode sair 0 com prova: envelope valido e nao truncado, cada arquivo
 * devolvendo ao menos uma assertiva com PASS/FAIL, nenhum FAIL e nenhum erro.
 * Zero assertiva executada NAO e sucesso (era o defeito R2-INF-010).
 *
 * DB_TESTS_DIR permite apontar para outro diretorio de .sql (usado pelos testes).
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodificarResposta, resumirSuite, codigoDeSaida } from './rpc-envelope.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const dir = process.env.DB_TESTS_DIR || __dir;
const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const key = process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.error('Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_KEY');
  process.exit(2);
}

async function execSQL(sql) {
  const res = await fetch(`${url}/rest/v1/rpc/mcp_exec`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({ sql }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SQL failed: ${err}`);
  }
  return res.json();
}

const files = (await readdir(dir))
  .filter(f => f.endsWith('.sql'))
  .sort();

if (files.length === 0) {
  console.error(`Nenhum .sql encontrado em ${dir}: a suite nao tem o que provar`);
  process.exit(1);
}

const porArquivo = [];

for (const file of files) {
  const sql = await readFile(join(dir, file), 'utf8');
  console.log(`\n▶ ${file}`);
  try {
    const { assertivas } = decodificarResposta(await execSQL(sql), file);
    if (assertivas.length === 0) {
      throw new Error('o arquivo devolveu zero assertiva (nenhuma linha PASS/FAIL/SKIP)');
    }
    porArquivo.push({ arquivo: file, assertivas });
    for (const a of assertivas) {
      if (a.status === 'FAIL') console.error(`  ✗ ${a.id}: ${a.detail}`);
      else if (a.status === 'SKIP') console.log(`  - ${a.id}: SKIP${a.detail ? ` (${a.detail})` : ''}`);
      else console.log(`  ✓ ${a.id}`);
    }
  } catch (e) {
    console.error(`  ERROR: ${e.message}`);
    porArquivo.push({ arquivo: file, erro: e.message });
  }
}

const resumo = resumirSuite(porArquivo);

console.log(`\n${'='.repeat(60)}`);
for (const { arquivo, motivo } of resumo.erros) console.error(`ERRO ${arquivo}: ${motivo}`);
console.log(
  `RESULTADO: ${resumo.pass} PASS / ${resumo.fail} FAIL / ${resumo.skip} SKIP`
  + ` em ${resumo.arquivos} arquivo(s)`,
);
if (resumo.total === 0) console.error('RESULTADO INVALIDO: nenhuma assertiva executada nao e aprovacao');
process.exit(codigoDeSaida(resumo));
