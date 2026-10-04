#!/usr/bin/env node
// E48: verifica que todo .test.ts (supabase/functions/) e .test.sh (scripts/db-audit/)
// tem correspondente registrado em ci.yml / db-guard.yml.
// E49: quando ci.yml usa $(git ls-files 'supabase/functions/**/*.test.ts'), a
// comparação individual de .test.ts é desnecessária (o glob cobre todos).
// E50: ai-block03-vocabulary-contract, talkx-settings-rls e
// user-settings-sound-integrity-contract movidos da ALLOWLIST para db-guard.yml.

import { readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { resolverExecutavel } from '../lib/seguranca-processo.mjs';
import { fileURLToPath } from 'url';

const root = join(fileURLToPath(import.meta.url), '../../..');

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

// Testes conhecidos ainda fora do CI; remover linha quando a etapa correspondente mergear.
const ALLOWLIST = new Set([
  // --- .test.sh — TalkX features em andamento; registrar em db-guard.yml quando prontas ---
  // X034: harness de integração do motor com o provedor falso (Postgres descartável + PostgREST +
  // fake-evolution). Roda no passo Deno/harness da Fase 3; promover em db-guard.yml quando maduro.
  'scripts/db-audit/talkx-engine-provider.test.sh',
  'scripts/db-audit/talk-me-client-privileges.test.sh',
  'scripts/db-audit/talkx-current-template-version.test.sh',
  'scripts/db-audit/talkx-v23-draft-step.test.sh',
  'scripts/db-audit/talkx-v25-owner.test.sh',
  'scripts/db-audit/talkx-v26-template-version.test.sh',
  // --- .test.sh — prova em container descartável (docker); passo de YAML
  // a promover em db-guard.yml pelo dono do workflow (agente não edita workflow).
  'scripts/db-audit/pg-cron-escalonamento.test.sh',
  'scripts/db-audit/talkx-optout.test.sh',
  'scripts/db-audit/talkx-overview-stats.test.sh',
  'scripts/db-audit/talkx-campaign-segments.test.sh',
  // --- .test.sh OFFLINE (sem docker, sem banco): roda em qualquer runner. O passo no
  // db-guard.yml e uma linha — `bash scripts/db-audit/replay-classify.test.sh` — e cabe
  // junto de gen-types.test.sh; promover pelo dono do workflow.
  'scripts/db-audit/replay-classify.test.sh',
]);

// ── 1. .test.ts: disco vs ci.yml ───────────────────────────────────────────────

const testTsOnDisk = spawnSync(resolverExecutavel('git'), ['ls-files', 'supabase/functions'], { cwd: root, encoding: 'utf8' })
  .stdout
  .split('\n')
  .filter(f => f.endsWith('.test.ts'));

const ciYaml = read('.github/workflows/ci.yml');

// E49: se ci.yml usa o glob, todos os .test.ts são cobertos automaticamente.
const CI_TS_GLOB = "supabase/functions/**/*.test.ts";
const ciUsesGlob = ciYaml.includes(CI_TS_GLOB);

// ── 2. .test.sh: disco vs db-guard.yml ────────────────────────────────────────

const testShOnDisk = spawnSync(resolverExecutavel('git'), ['ls-files', 'scripts/db-audit'], { cwd: root, encoding: 'utf8' })
  .stdout
  .split('\n')
  .filter(f => f.endsWith('.test.sh'));

const dbGuardYaml = read('.github/workflows/db-guard.yml');
const testShInGuard = new Set(
  [...dbGuardYaml.matchAll(/\bscripts\/db-audit\/\S+\.test\.sh\b/g)].map(m => m[0])
);

// ── 3. Detectar órfãos ────────────────────────────────────────────────────────

const orphans = [];

if (!ciUsesGlob) {
  // Sem glob: comparação individual de .test.ts contra a lista em ci.yml.
  const testTsInCi = new Set(
    [...ciYaml.matchAll(/\bsupabase\/functions\/\S+\.test\.ts\b/g)].map(m => m[0])
  );
  for (const f of testTsOnDisk) {
    if (!testTsInCi.has(f) && !ALLOWLIST.has(f)) {
      orphans.push({ file: f, yaml: 'ci.yml' });
    }
  }
}

for (const f of testShOnDisk) {
  if (!testShInGuard.has(f) && !ALLOWLIST.has(f)) {
    orphans.push({ file: f, yaml: 'db-guard.yml' });
  }
}

// ── 4. Reportar ───────────────────────────────────────────────────────────────

if (orphans.length === 0) {
  if (ciUsesGlob) {
    console.log(`check-test-inventory: OK — ci.yml usa glob (${CI_TS_GLOB}); .test.sh verificados individualmente`);
  } else {
    console.log('check-test-inventory: OK — todos os testes têm correspondente no CI YAML');
  }
  process.exit(0);
}

console.error('check-test-inventory: FALHOU — testes no disco sem correspondente no CI YAML:');
for (const { file, yaml } of orphans) {
  console.error(`  ${file}  (não encontrado em ${yaml})`);
}
console.error(`\nTotal: ${orphans.length} teste(s) órfão(s).`);
console.error('Adicione ao YAML correspondente ou inclua na ALLOWLIST com justificativa.');
process.exit(1);
