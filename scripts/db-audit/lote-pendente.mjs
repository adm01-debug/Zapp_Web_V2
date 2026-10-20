#!/usr/bin/env node
/**
 * W26: fonte única da regra "apply pendente".
 *
 * Chama check-migration-drift.mjs, escreve uma seção no
 * GITHUB_STEP_SUMMARY e sai com o mesmo código de saída:
 *   exit 0 — sem drift e sem apply-pendente (clean)
 *   exit 1 — drift real (conteudo divergente ou DDL fora do Git)
 *   exit 2 — erro de infra (ledger inacessivel, falha de autenticacao, etc.)
 *   exit 3 — somente apply-pendente (migrations no disco sem ledger no banco)
 *
 * GA19: o 3 e exclusivo de apply-pendente; o 2 voltou a ser so erro. Uma
 * falha de autenticacao no ledger NUNCA vira "apply aguardado" verde.
 *
 * Cada chamador aplica sua própria política sobre exit 3:
 *   db-live-guard  → em push trata como neutro (exit 0); em schedule/dispatch
 *                    mantém exit 3 para abrir issue.
 *   types-sync     → usa exit 3 para setar awaiting_apply=true e pular gates.
 *
 * Uso:
 *   node scripts/db-audit/lote-pendente.mjs [-- <args extras para check-migration-drift>]
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRIFT_SCRIPT = path.join(__dirname, 'check-migration-drift.mjs');

function writeSummary(lines) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  try {
    appendFileSync(summaryPath, lines.join('\n') + '\n');
  } catch {
    // não fatal
  }
}

// Sem DESTINO_URL não há banco para comparar; validação local sempre passa.
if (!process.env.DESTINO_URL) {
  writeSummary([
    '### ✅ Lote pendente — sem drift',
    '',
    'DESTINO_URL não definido; somente validação local (sem banco).',
  ]);
  process.exitCode = 0;
} else {
  const result = spawnSync(
    process.execPath,
    [DRIFT_SCRIPT, '--classificar', ...process.argv.slice(2)],
    { stdio: 'inherit', encoding: 'utf8' },
  );

  const rc = result.status ?? 1;

  if (rc === 0) {
    writeSummary([
      '### ✅ Lote pendente — sem drift',
      '',
      'Todas as migrations locais estão registradas no ledger do banco.',
    ]);
  } else if (rc === 3) {
    // GA19 (sobre W21/W26): somente apply-pendente; exit 2 agora e erro e cai
    // no ramo "drift real" abaixo (falha fechada, nunca verde).
    writeSummary([
      '### ⏳ Lote pendente — apply aguardado',
      '',
      'Existem migrations no disco sem registro no ledger do banco.',
      'O apply acontecerá no ciclo de lote do dia (db-migrate.yml).',
      '',
      '> Não é drift — é o estado esperado entre o merge e o apply.',
    ]);
  } else {
    writeSummary([
      '### ❌ Lote pendente — drift real detectado',
      '',
      'Há diferença entre as migrations no disco e o ledger do banco.',
      'Ver `docs/MIGRATIONS.md` para o procedimento de reconciliação.',
    ]);
  }

  process.exitCode = rc;
}
