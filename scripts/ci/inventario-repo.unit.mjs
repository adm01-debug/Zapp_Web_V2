import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join(ROOT, 'scripts/inventario/gerar-repo.mjs');

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'inventario-repo-'));
  for (const dir of [
    'scripts/inventario',
    'supabase/functions/exemplo',
    'supabase/migrations',
    'src',
    'e2e',
    '.github/workflows',
    'inventario/estado',
  ]) mkdirSync(join(root, dir), { recursive: true });

  copyFileSync(SCRIPT, join(root, 'scripts/inventario/gerar-repo.mjs'));
  writeFileSync(join(root, 'supabase/functions/exemplo/index.ts'), 'Deno.serve(() => new Response("ok"));\n');
  writeFileSync(join(root, 'supabase/config.toml'), '[functions.exemplo]\nverify_jwt = true\n');
  return root;
}

test('stdin vazio (/dev/null) gera edges sem criar tabelas-uso.json', () => {
  const root = fixture();
  const bin = join(root, 'bin');
  mkdirSync(bin);
  const rg = join(bin, 'rg');
  writeFileSync(rg, '#!/bin/sh\nexit 1\n');
  chmodSync(rg, 0o755);
  const result = spawnSync(process.execPath, [join(root, 'scripts/inventario/gerar-repo.mjs')], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(join(root, 'inventario/estado/edges.json')));
  assert.equal(existsSync(join(root, 'inventario/estado/tabelas-uso.json')), false);
  const edges = JSON.parse(readFileSync(join(root, 'inventario/estado/edges.json'), 'utf8'));
  assert.equal(edges.edge_functions.exemplo.sem_chamador, true, 'exit 1 do rg significa busca sem resultado');
});

test('rg ausente falha fechado e não publica edges.json incompleto', () => {
  const root = fixture();
  const pathVazio = join(root, 'path-sem-rg');
  mkdirSync(pathVazio);
  const result = spawnSync(process.execPath, [join(root, 'scripts/inventario/gerar-repo.mjs')], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PATH: pathVazio },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ripgrep \(rg\) não encontrado/);
  assert.equal(existsSync(join(root, 'inventario/estado/edges.json')), false);
});

test('rg com erro operacional (exit >= 2) falha fechado', () => {
  const root = fixture();
  const bin = join(root, 'bin');
  mkdirSync(bin);
  const rg = join(bin, 'rg');
  writeFileSync(rg, '#!/bin/sh\nexit 2\n');
  chmodSync(rg, 0o755);
  const result = spawnSync(process.execPath, [join(root, 'scripts/inventario/gerar-repo.mjs')], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PATH: bin },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ripgrep \(rg\) falhou com exit 2/);
  assert.equal(existsSync(join(root, 'inventario/estado/edges.json')), false);
});

const temRg = spawnSync('rg', ['--version'], { encoding: 'utf8' }).status === 0;

test('detecção com rg real: prefixo não casa, template string conta e segredo em helper entra', { skip: !temRg && 'ripgrep ausente' }, () => {
  const root = fixture();
  for (const dir of ['supabase/functions/foo/helpers', 'supabase/functions/foo-bar']) mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, 'supabase/functions/foo/index.ts'), "const a = Deno.env.get('SEGREDO_INDEX');\n");
  writeFileSync(join(root, 'supabase/functions/foo/helpers/x.ts'), 'const b = Deno.env.get("SEGREDO_HELPER");\n');
  writeFileSync(join(root, 'supabase/functions/foo/helpers/x.test.ts'), "Deno.env.get('SEGREDO_TESTE');\n");
  writeFileSync(join(root, 'supabase/functions/foo-bar/index.ts'), 'Deno.serve(() => new Response("ok"));\n');
  // Só chama foo-bar por URL: não pode contar como chamador de foo.
  writeFileSync(join(root, 'src/a.ts'), "await fetch(`${base}/functions/v1/foo-bar`);\n");
  // Chama foo com template string (sub-rota dinâmica): tem de contar.
  writeFileSync(join(root, 'src/b.ts'), 'await supabase.functions.invoke(`foo/${acao}`, { body });\n');

  const result = spawnSync(process.execPath, [join(root, 'scripts/inventario/gerar-repo.mjs')], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(result.status, 0, result.stderr);
  const edges = JSON.parse(readFileSync(join(root, 'inventario/estado/edges.json'), 'utf8')).edge_functions;

  assert.equal(edges['foo-bar'].chamada_em.src, 1);
  assert.equal(edges.foo.chamada_em.src, 1, 'foo: só o invoke com template string conta; /functions/v1/foo-bar não é foo');
  assert.deepEqual(edges.foo.segredos_lidos, ['SEGREDO_HELPER', 'SEGREDO_INDEX'], 'helper conta, teste não');
  assert.equal(edges.exemplo.sem_chamador, true);
});

test('migrations: edge chamada só por cron+Vault conta; citada só em comentário SQL não conta', { skip: !temRg && 'ripgrep ausente' }, () => {
  const root = fixture();
  for (const f of ['vault-edge', 'comment-edge']) {
    mkdirSync(join(root, 'supabase/functions', f), { recursive: true });
    writeFileSync(join(root, 'supabase/functions', f, 'index.ts'), 'Deno.serve(() => new Response("ok"));\n');
  }
  // URL só no Vault: o nome da edge aparece em SQL executável (nome do job), nunca como functions/v1/vault-edge.
  writeFileSync(join(root, 'supabase/migrations/0001_vault_cron.sql'), [
    '-- pg_cron chama a edge vault-edge a cada minuto, URL vinda do Vault.',
    "SELECT cron.schedule('vault-edge-1min', '* * * * *', 'SELECT public.trigger_tick()');",
  ].join('\n'));
  // comment-edge só em comentário (linha inteira e fim de linha).
  writeFileSync(join(root, 'supabase/migrations/0002_comentario.sql'), [
    '-- antes isto era feito pela edge comment-edge',
    'UPDATE public.t SET x = 1; -- mesmo efeito do comment-edge',
  ].join('\n'));

  const result = spawnSync(process.execPath, [join(root, 'scripts/inventario/gerar-repo.mjs')], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(result.status, 0, result.stderr);
  const inventario = JSON.parse(readFileSync(join(root, 'inventario/estado/edges.json'), 'utf8'));

  assert.equal(inventario.edge_functions['vault-edge'].chamada_em.migrations, 1);
  assert.equal(inventario.edge_functions['vault-edge'].sem_chamador, false);
  assert.equal(inventario.edge_functions['comment-edge'].chamada_em.migrations, 0);
  assert.equal(inventario.edge_functions['comment-edge'].sem_chamador, true);
  assert.ok(inventario.sem_chamador_no_repo.includes('comment-edge'));
  assert.ok(!inventario.sem_chamador_no_repo.includes('vault-edge'));
});
