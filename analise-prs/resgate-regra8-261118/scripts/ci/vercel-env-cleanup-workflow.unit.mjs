import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../../.github/workflows/vercel-env-cleanup.yml', import.meta.url), 'utf8');

test('Vercel cleanup jamais usa credencial privilegiada a partir de ref não-main', () => {
  assert.match(workflow, /cleanup:[\s\S]*?if:\s*github\.ref\s*==\s*['"]refs\/heads\/main['"]/u);
  assert.match(workflow, /permissions:\s*\n\s+contents:\s*read/u);
});

test('dry-run usa somente token de leitura; apply exige credencial de escrita explícita', () => {
  assert.match(workflow, /VERCEL_TOKEN:\s*\$\{\{\s*inputs\.dry_run\s*==\s*'0'\s*&&\s*secrets\.VERCEL_WRITE_TOKEN\s*\|\|\s*secrets\.VERCEL_READONLY_TOKEN\s*\}\}/u);
  assert.match(workflow, /if:\s*inputs\.dry_run\s*==\s*'0'[\s\S]*?secrets\.VERCEL_WRITE_TOKEN/u);
  assert.match(workflow, /Apply bloqueado: configure VERCEL_WRITE_TOKEN/u);
});
