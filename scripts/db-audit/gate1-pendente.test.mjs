import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const SCRIPT = new URL('./gate1-pendente.mjs', import.meta.url);
const HORA = 3600;

function rodar({ tsc, pendentes, migrations, headCt, headFiles }) {
  const root = mkdtempSync(join(tmpdir(), 'zapp-gate1b-'));
  try {
    const mig = join(root, 'migrations');
    mkdirSync(mig, { recursive: true });
    writeFileSync(join(root, 'tsc.log'), tsc);
    writeFileSync(join(root, 'pending.txt'), pendentes.join('\n') + (pendentes.length ? '\n' : ''));
    for (const [nome, sql] of Object.entries(migrations)) writeFileSync(join(mig, nome), sql);
    const out = join(root, 'github_output');
    writeFileSync(out, '');
    const r = spawnSync(
      process.execPath,
      [SCRIPT.pathname, '--tsc-log', join(root, 'tsc.log'), '--pending', join(root, 'pending.txt'),
        '--migrations-dir', mig, '--head-ct', String(headCt), '--head-files', headFiles],
      { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: out } },
    );
    return { r, saida: readFileSync(out, 'utf8') };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const agora = () => Math.floor(Date.now() / 1000);
const MIG = { '20261020100000_cli.sql': 'ALTER TABLE clientes ADD COLUMN apelido text;' };
const HEAD_OK = 'supabase/migrations/20261020100000_cli.sql';
const TSC_OK = "src/a.ts(1,1): error TS2339: Property 'apelido' does not exist on type 'Cliente'.";

test('GA23: tsc explicado pelo lote fresco suprime a issue', () => {
  const { r, saida } = rodar({
    tsc: TSC_OK, pendentes: ['20261020100000'], migrations: MIG,
    headCt: agora() - HORA, headFiles: HEAD_OK,
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(saida, /awaiting_apply=true/);
  assert.match(r.stdout, /awaiting_apply=true/);
});

test('GA23: tsc citando objeto fora do lote NAO suprime', () => {
  const { r, saida } = rodar({
    tsc: "src/a.ts(1,1): error TS2304: Cannot find name 'tabela_fantasma'.",
    pendentes: ['20261020100000'], migrations: MIG,
    headCt: agora() - HORA, headFiles: HEAD_OK,
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(saida, /awaiting_apply=false/);
  assert.match(r.stdout, /fora do lote/);
});

test('GA23: pendencia stale (>24 h) NAO suprime', () => {
  const { r, saida } = rodar({
    tsc: TSC_OK, pendentes: ['20261020100000'], migrations: MIG,
    headCt: agora() - 30 * HORA, headFiles: HEAD_OK,
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(saida, /awaiting_apply=false/);
  assert.match(r.stdout, /stale/);
});

test('GA23: sem pendentes NAO suprime', () => {
  const { r, saida } = rodar({
    tsc: TSC_OK, pendentes: [], migrations: MIG,
    headCt: agora() - HORA, headFiles: HEAD_OK,
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(saida, /awaiting_apply=false/);
});
