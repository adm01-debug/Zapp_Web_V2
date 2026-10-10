import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

import { varrer, avaliar, guarda } from './check-supabase-url-import-meta.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const TMP = join(AQUI, '.tmp-check-supabase');

function escrever(caminhoRel, conteudo) {
  const caminho = join(TMP, caminhoRel);
  const dir = dirname(caminho);
  mkdirSync(dir, { recursive: true });
  writeFileSync(caminho, conteudo);
}

function limpar() {
  try {
    rmSync(TMP, { recursive: true, force: true });
  } catch {
    // ignore
  }
  mkdirSync(TMP, { recursive: true });
}

test('check-supabase-url-import-meta: varrer encontra VITE_SUPABASE_URL em src/', () => {
  limpar();
  escrever('componente.ts', 'const url = import.meta.env.VITE_SUPABASE_URL;\n');
  const resultado = varrer(TMP);
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].variavel, 'VITE_SUPABASE_URL');
  assert.equal(resultado[0].linha, 1);
});

test('check-supabase-url-import-meta: varrer encontra VITE_SUPABASE_PUBLISHABLE_KEY em src/', () => {
  limpar();
  escrever('utils.ts', 'const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;\n');
  const resultado = varrer(TMP);
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].variavel, 'VITE_SUPABASE_PUBLISHABLE_KEY');
});

test('check-supabase-url-import-meta: varrer nao encontra quando nao ha violacao', () => {
  limpar();
  escrever('limpo.ts', 'const url = import.meta.env.VITE_CRM_INTEGRATION_ENABLED;\n');
  const resultado = varrer(TMP);
  assert.equal(resultado.length, 0);
});

test('check-supabase-url-import-meta: arquivo de teste e ignorado', () => {
  limpar();
  escrever('componente.test.ts', 'vi.stubEnv("VITE_SUPABASE_URL", "https://fake.supabase.co");\n');
  const resultado = varrer(TMP);
  assert.equal(resultado.length, 0);
});

test('check-supabase-url-import-meta: arquivo .spec.ts e ignorado', () => {
  limpar();
  escrever('componente.spec.ts', 'import.meta.env.VITE_SUPABASE_URL;\n');
  const resultado = varrer(TMP);
  assert.equal(resultado.length, 0);
});

test('check-supabase-url-import-meta: src/config/supabase.ts e ignorado', () => {
  limpar();
  escrever('config/supabase.ts', '// VITE_SUPABASE_URL nao e lida aqui\n');
  const resultado = varrer(TMP);
  assert.equal(resultado.length, 0);
});

test('check-supabase-url-import-meta: avaliar formata violacoes legiveis', () => {
  const violacoes = [
    {
      arquivo: 'src/integrations/supabase/client.ts',
      linha: 10,
      variavel: 'VITE_SUPABASE_URL',
      texto: 'import.meta.env.VITE_SUPABASE_URL',
    },
  ];
  const resultado = avaliar(violacoes);
  assert.equal(resultado.length, 1);
  assert.match(resultado[0], /VITE_SUPABASE_URL/);
  assert.match(resultado[0], /src\/integrations\/supabase\/client\.ts/);
});

test('check-supabase-url-import-meta: avaliar retorna vazio para zero violacoes', () => {
  assert.deepEqual(avaliar([]), []);
});

test('check-supabase-url-import-meta: guarda do repositorio real nao tem violacoes', () => {
  const violacoes = guarda();
  assert.deepEqual(violacoes, [], 'repositorio tem leitura de VITE_SUPABASE_URL/PUBLISHABLE_KEY em src/ — revise as excecoes');
});

test('check-supabase-url-import-meta: importar nao executa a guarda', () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./scripts/ci/check-supabase-url-import-meta.mjs');"], {
    cwd: join(AQUI, '..', '..'),
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '', 'importar nao pode imprimir o relatorio da guarda');
});
