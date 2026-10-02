#!/usr/bin/env node
// E48: verifica que todo .test.ts (supabase/functions/) e .test.sh (scripts/db-audit/)
// tem correspondente registrado em ci.yml / db-guard.yml.
// Sai com código 1 se houver teste no disco fora dos YAMLs (exceto allowlist abaixo).

import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';

const root = join(fileURLToPath(import.meta.url), '../../..');

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

// Testes conhecidos ainda fora do CI; remover linha quando a etapa correspondente mergear.
// .test.ts serão cobertos quando E49 trocar a lista por glob em ci.yml.
// .test.sh serão cobertos quando E50 adicionar os passos em db-guard.yml.
const ALLOWLIST = new Set([
  // --- .test.ts — fixar com E49 (glob) ---
  'supabase/functions/_shared/__tests__/ai-response-contracts.test.ts',
  'supabase/functions/_shared/__tests__/ai-vocabulary.test.ts',
  'supabase/functions/_shared/__tests__/chatbot-l1-output.test.ts',
  'supabase/functions/_shared/__tests__/postgrest-filters.test.ts',
  'supabase/functions/_shared/__tests__/talkx-reply-window.test.ts',
  'supabase/functions/_shared/__tests__/talkx-v20-window-business-hours.test.ts',
  'supabase/functions/_shared/ai-generate.test.ts',
  'supabase/functions/talkx-send/v20-daily-limit.test.ts',
  // --- .test.sh — fixar com E50 (db-guard.yml) ---
  'scripts/db-audit/ai-block03-vocabulary-contract.test.sh',
  'scripts/db-audit/talkx-settings-rls.test.sh',
  'scripts/db-audit/user-settings-sound-integrity-contract.test.sh',
  // --- .test.sh — TalkX features em andamento; registrar em db-guard.yml quando prontas ---
  'scripts/db-audit/talk-me-client-privileges.test.sh',
  'scripts/db-audit/talkx-current-template-version.test.sh',
  'scripts/db-audit/talkx-v23-draft-step.test.sh',
  'scripts/db-audit/talkx-v25-owner.test.sh',
  'scripts/db-audit/talkx-v26-template-version.test.sh',
]);

// ── 1. .test.ts: disco vs ci.yml ───────────────────────────────────────────────

const testTsOnDisk = execSync('git ls-files supabase/functions', { cwd: root })
  .toString()
  .split('\n')
  .filter(f => f.endsWith('.test.ts'));

const ciYaml = read('.github/workflows/ci.yml');
// extrai qualquer token que termine em .test.ts (pode aparecer em meio a linha YAML)
const testTsInCi = new Set(
  [...ciYaml.matchAll(/\bsupabase\/functions\/\S+\.test\.ts\b/g)].map(m => m[0])
);

// ── 2. .test.sh: disco vs db-guard.yml ────────────────────────────────────────

const testShOnDisk = execSync('git ls-files scripts/db-audit', { cwd: root })
  .toString()
  .split('\n')
  .filter(f => f.endsWith('.test.sh'));

const dbGuardYaml = read('.github/workflows/db-guard.yml');
const testShInGuard = new Set(
  [...dbGuardYaml.matchAll(/\bscripts\/db-audit\/\S+\.test\.sh\b/g)].map(m => m[0])
);

// ── 3. Detectar órfãos ────────────────────────────────────────────────────────

const orphans = [];

for (const f of testTsOnDisk) {
  if (!testTsInCi.has(f) && !ALLOWLIST.has(f)) {
    orphans.push({ file: f, yaml: 'ci.yml' });
  }
}

for (const f of testShOnDisk) {
  if (!testShInGuard.has(f) && !ALLOWLIST.has(f)) {
    orphans.push({ file: f, yaml: 'db-guard.yml' });
  }
}

// ── 4. Reportar ───────────────────────────────────────────────────────────────

if (orphans.length === 0) {
  console.log('check-test-inventory: OK — todos os testes têm correspondente no CI YAML');
  process.exit(0);
}

console.error('check-test-inventory: FALHOU — testes no disco sem correspondente no CI YAML:');
for (const { file, yaml } of orphans) {
  console.error(`  ${file}  (não encontrado em ${yaml})`);
}
console.error(`\nTotal: ${orphans.length} teste(s) órfão(s).`);
console.error('Adicione ao YAML correspondente ou inclua na ALLOWLIST com justificativa.');
process.exit(1);
