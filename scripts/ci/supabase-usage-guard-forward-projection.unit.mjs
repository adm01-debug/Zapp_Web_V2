import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const guard = new URL('../db-audit/supabase-usage-guard.mjs', import.meta.url);

test('usage guard projects a migration created on the catalog snapshot day', () => {
  const root = mkdtempSync(join(tmpdir(), 'zapp-usage-guard-'));
  try {
    mkdirSync(join(root, 'src'), { recursive: true });
    mkdirSync(join(root, 'supabase', 'migrations'), { recursive: true });
    mkdirSync(join(root, 'scripts', 'db-audit'), { recursive: true });
    writeFileSync(join(root, 'supabase', 'schema-catalog.json'), JSON.stringify({
      generated_at: '2026-09-09', tables: [], views: [], functions: [],
    }));
    writeFileSync(join(root, 'scripts', 'db-audit', 'known-violations.json'), '{"known":[]}');
    writeFileSync(join(root, 'src', 'caller.ts'), "supabase.rpc('same_day_rpc');\n");
    writeFileSync(
      join(root, 'supabase', 'migrations', '20260909210000_same_day.sql'),
      'CREATE OR REPLACE FUNCTION public.same_day_rpc() RETURNS void LANGUAGE sql AS $$ SELECT $$;\n',
    );

    const result = spawnSync(process.execPath, [guard.pathname], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /projecao forward-only: 0 relacoes, 1 funcoes/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
