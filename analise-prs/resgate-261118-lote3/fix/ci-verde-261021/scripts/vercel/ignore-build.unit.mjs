#!/usr/bin/env node
// V077: Testes do ignore-build.sh com git temporário.
// Executa: node scripts/vercel/ignore-build.unit.mjs

import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const SCRIPT = new URL('./ignore-build.sh', import.meta.url).pathname;

let passed = 0;
let failed = 0;

function run(env = {}, cwd = process.cwd()) {
  const fullEnv = { ...process.env, VERCEL_GIT_PREVIOUS_SHA: '', ...env };
  try {
    execSync(`sh "${SCRIPT}"`, { env: fullEnv, cwd, stdio: 'pipe' });
    return 0;
  } catch (e) {
    return e.status ?? 1;
  }
}

function test(name, exitCode, expectedExit) {
  if (exitCode === expectedExit) {
    console.log(`  ✅  ${name}`);
    passed++;
  } else {
    console.error(`  ❌  ${name} — esperado exit ${expectedExit}, obteve ${exitCode}`);
    failed++;
  }
}

// Cria repositório git temporário para os testes que precisam de git.
const tmpRepo = mkdtempSync(join(tmpdir(), 'ignore-build-test-'));
execSync('git init -q', { cwd: tmpRepo });
execSync('git config user.email "test@test.com"', { cwd: tmpRepo });
execSync('git config user.name "Test"', { cwd: tmpRepo });
writeFileSync(join(tmpRepo, 'README.md'), 'init');
execSync('git add . && git commit -q -m "init"', { cwd: tmpRepo, shell: true });
writeFileSync(join(tmpRepo, 'docs/note.md'.replace('docs/', '')), 'changed', { flag: 'w' });
execSync('git add . && git commit -q -m "docs change"', { cwd: tmpRepo, shell: true });
const [head, base] = execSync('git log --format=%H -n 2', { cwd: tmpRepo }).toString().trim().split('\n');

console.log('\nignore-build.sh — testes unitários\n');

// T1: VERCEL_ENV=production sempre builda.
test(
  'T1: production sempre builda',
  run({ VERCEL_ENV: 'production' }, tmpRepo),
  1
);

const semGit = mkdtempSync(join(tmpdir(), 'ignore-build-nogit-'));
test(
  'T2: sem base commit → fail-open (builda)',
  run({ VERCEL_ENV: 'preview' }, semGit),
  1
);

test(
  'T3: somente arquivo não-front → pula',
  run({ VERCEL_ENV: 'preview', VERCEL_GIT_PREVIOUS_SHA: base }, tmpRepo),
  0
);

mkdirSync(join(tmpRepo, 'src'));
writeFileSync(join(tmpRepo, 'src/index.ts'), 'export {}');
execSync('git add . && git commit -q -m "src change"', { cwd: tmpRepo, shell: true });
test(
  'T4: src/ mudou → builda',
  run({ VERCEL_ENV: 'preview', VERCEL_GIT_PREVIOUS_SHA: base }, tmpRepo),
  1
);

rmSync(tmpRepo, { recursive: true, force: true });
rmSync(semGit, { recursive: true, force: true });

console.log(`\n${passed} passou(aram), ${failed} falhou(aram).\n`);
if (failed > 0) process.exit(1);
