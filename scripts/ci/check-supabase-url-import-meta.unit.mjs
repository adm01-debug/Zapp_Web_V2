import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';

import { varrer, avaliar, guarda } from './check-supabase-url-import-meta.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_REPO = join(AQUI, '..', '..');
const CLI = join(AQUI, 'check-supabase-url-import-meta.mjs');

// Cada caso monta a propria arvore temporaria em os.tmpdir(); nada fica no repo.
const BASE = mkdtempSync(join(tmpdir(), 'n024-guarda-'));
after(() => rmSync(BASE, { recursive: true, force: true }));

let seq = 0;

/** Cria <base>/caso-N/src e devolve o caminho do src. */
function novoSrc() {
  seq += 1;
  const raiz = join(BASE, `caso-${seq}`);
  const src = join(raiz, 'src');
  mkdirSync(src, { recursive: true });
  return src;
}

function escrever(src, caminhoRel, conteudo) {
  const caminho = join(src, caminhoRel);
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, conteudo);
}

test('check-supabase-url-import-meta: varrer acha acesso direto em .ts', () => {
  const src = novoSrc();
  escrever(src, 'componente.ts', 'const url = import.meta.env.VITE_SUPABASE_URL;\n');
  const resultado = varrer(src);
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].variavel, 'VITE_SUPABASE_URL');
  assert.equal(resultado[0].linha, 1);
});

test('check-supabase-url-import-meta: varrer acha acesso direto em .tsx', () => {
  const src = novoSrc();
  escrever(src, 'Componente.tsx', 'export const k = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;\n');
  const resultado = varrer(src);
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].variavel, 'VITE_SUPABASE_PUBLISHABLE_KEY');
});

test('check-supabase-url-import-meta: varrer acha acesso por colchete', () => {
  const src = novoSrc();
  escrever(src, 'colchete.ts', 'const url = import.meta.env["VITE_SUPABASE_URL"];\n');
  const resultado = varrer(src);
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].variavel, 'VITE_SUPABASE_URL');
});

test('check-supabase-url-import-meta: varrer acha destructuring', () => {
  const src = novoSrc();
  escrever(src, 'destr.ts', 'const { VITE_SUPABASE_URL } = import.meta.env;\n');
  const resultado = varrer(src);
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].variavel, 'VITE_SUPABASE_URL');
});

test('check-supabase-url-import-meta: varrer nao acusa a variavel fora de import.meta.env', () => {
  const src = novoSrc();
  escrever(src, 'limpo.ts', 'const url = process.env.VITE_SUPABASE_URL;\n');
  assert.equal(varrer(src).length, 0);
});

test('check-supabase-url-import-meta: varrer ignora .test.ts com violacao', () => {
  const src = novoSrc();
  escrever(src, 'componente.test.ts', 'const url = import.meta.env.VITE_SUPABASE_URL;\n');
  assert.equal(varrer(src).length, 0);
});

test('check-supabase-url-import-meta: varrer ignora .spec.tsx com violacao', () => {
  const src = novoSrc();
  escrever(src, 'Componente.spec.tsx', 'export const u = import.meta.env.VITE_SUPABASE_URL;\n');
  assert.equal(varrer(src).length, 0);
});

test('check-supabase-url-import-meta: varrer ignora arquivo dentro de __tests__/ com violacao', () => {
  const src = novoSrc();
  escrever(src, '__tests__/ajudante.ts', 'export const u = import.meta.env.VITE_SUPABASE_URL;\n');
  assert.equal(varrer(src).length, 0);
});

test('check-supabase-url-import-meta: varrer ignora src/config/supabase.ts mesmo com violacao', () => {
  const src = novoSrc();
  escrever(src, 'config/supabase.ts', 'const url = import.meta.env.VITE_SUPABASE_URL;\n');
  assert.equal(varrer(src).length, 0);
});

test('check-supabase-url-import-meta: avaliar formata violacoes legiveis', () => {
  const violacoes = [
    {
      arquivo: 'src/integrations/supabase/client.ts',
      linha: 10,
      variavel: 'VITE_SUPABASE_URL',
      texto: 'const url = import.meta.env.VITE_SUPABASE_URL;',
    },
  ];
  const resultado = avaliar(violacoes);
  assert.equal(resultado.length, 1);
  assert.match(resultado[0], /VITE_SUPABASE_URL/);
  assert.match(resultado[0], /src\/integrations\/supabase\/client\.ts/);
  assert.match(resultado[0], /:10/);
});

test('check-supabase-url-import-meta: avaliar devolve vazio para zero violacoes', () => {
  assert.deepEqual(avaliar([]), []);
});

test('check-supabase-url-import-meta: guarda do repositorio real nao tem violacoes', () => {
  const violacoes = guarda();
  assert.deepEqual(violacoes, [], 'repositorio tem leitura de VITE_SUPABASE_URL/PUBLISHABLE_KEY em src/ — revise as excecoes');
});

test('check-supabase-url-import-meta: CLI sai != 0 com fixtura em src/ e 0 sem ela', () => {
  const raiz = join(BASE, 'cli');
  mkdirSync(join(raiz, 'scripts', 'ci'), { recursive: true });
  const cliCopiada = join(raiz, 'scripts', 'ci', 'check-supabase-url-import-meta.mjs');
  copyFileSync(CLI, cliCopiada);
  const src = join(raiz, 'src');
  mkdirSync(src, { recursive: true });

  escrever(src, 'fixtura.ts', 'const url = import.meta.env.VITE_SUPABASE_URL;\n');
  const comViolacao = spawnSync(process.execPath, [cliCopiada], { cwd: raiz, encoding: 'utf8' });
  assert.equal(comViolacao.status, 1, `esperava exit 1; stderr=${comViolacao.stderr}`);
  assert.match(comViolacao.stderr, /VIOLACAO/);
  assert.match(comViolacao.stderr, /fixtura\.ts/);

  rmSync(join(src, 'fixtura.ts'));
  const semViolacao = spawnSync(process.execPath, [cliCopiada], { cwd: raiz, encoding: 'utf8' });
  assert.equal(semViolacao.status, 0, `esperava exit 0; stderr=${semViolacao.stderr}`);
  assert.match(semViolacao.stdout, /^OK/);
});

test('check-supabase-url-import-meta: importar nao executa a guarda', () => {
  const r = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', "await import('./scripts/ci/check-supabase-url-import-meta.mjs');"],
    { cwd: RAIZ_REPO, encoding: 'utf8' },
  );
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '', 'importar nao pode imprimir o relatorio da guarda');
});
