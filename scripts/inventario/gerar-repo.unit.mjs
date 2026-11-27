// Teste do inventário de edge functions (scripts/inventario/gerar-repo.mjs).
// Cobre especificamente a detecção de chamador via Vault/pg_cron em migrations, onde a
// URL da edge nunca aparece como texto literal `functions/v1/<nome>` — só o nome da edge
// solto (nome do secret no Vault, nome do cron job, comentário).
// Rodar: node --test scripts/inventario/gerar-repo.unit.mjs

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const GERADOR = new URL('./gerar-repo.mjs', import.meta.url);

function fixture() {
  const raiz = mkdtempSync(join(tmpdir(), 'inventario-repo-'));
  for (const dir of [
    'scripts/inventario',
    'supabase/functions/vault-edge',
    'supabase/functions/orphan-edge',
    'supabase/migrations',
    'src',
    'e2e',
    '.github/workflows',
  ]) {
    mkdirSync(join(raiz, dir), { recursive: true });
  }
  copyFileSync(GERADOR, join(raiz, 'scripts/inventario/gerar-repo.mjs'));
  writeFileSync(join(raiz, 'supabase/config.toml'), '');
  writeFileSync(join(raiz, 'supabase/functions/vault-edge/index.ts'), 'export default () => new Response("ok");\n');
  writeFileSync(join(raiz, 'supabase/functions/orphan-edge/index.ts'), 'export default () => new Response("ok");\n');
  // A URL real fica só no Vault; a migration só cita o nome da edge em texto solto
  // (comentário + nome do secret), nunca como `functions/v1/vault-edge`.
  writeFileSync(join(raiz, 'supabase/migrations/0001_vault_cron.sql'), [
    '-- pg_cron chama a edge vault-edge a cada minuto, URL vinda do Vault.',
    "SELECT vault.create_secret('https://proj.supabase.co/functions/v1/OUTRA-COISA', 'vault_edge_url');",
    "SELECT cron.schedule('vault-edge-1min', '* * * * *', 'SELECT 1');",
  ].join('\n'));
  return raiz;
}

test('edge chamada só por cron+Vault (sem URL literal em migrations) não entra como sem_chamador', () => {
  const raiz = fixture();
  try {
    execFileSync(process.execPath, [join(raiz, 'scripts/inventario/gerar-repo.mjs')], { cwd: raiz, encoding: 'utf8' });
    const inventario = JSON.parse(readFileSync(join(raiz, 'inventario/estado/edges.json'), 'utf8'));
    assert.equal(inventario.edge_functions['vault-edge'].sem_chamador, false);
    assert.ok(inventario.edge_functions['vault-edge'].chamada_em.migrations >= 1);
    assert.ok(!inventario.sem_chamador_no_repo.includes('vault-edge'));
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('edge genuinamente sem nenhuma menção continua marcada como sem_chamador', () => {
  const raiz = fixture();
  try {
    execFileSync(process.execPath, [join(raiz, 'scripts/inventario/gerar-repo.mjs')], { cwd: raiz, encoding: 'utf8' });
    const inventario = JSON.parse(readFileSync(join(raiz, 'inventario/estado/edges.json'), 'utf8'));
    assert.equal(inventario.edge_functions['orphan-edge'].sem_chamador, true);
    assert.ok(inventario.sem_chamador_no_repo.includes('orphan-edge'));
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});
