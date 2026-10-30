import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../../.github/workflows/types-sync.yml', import.meta.url), 'utf8');
const jobs = workflow.slice(workflow.indexOf('\njobs:\n') + 6);
const readerStart = jobs.indexOf('\n  ler-banco:\n');
const writerStart = jobs.indexOf('\n  gates-e-pr:\n');
assert.ok(readerStart >= 0, 'job ler-banco precisa existir');
assert.ok(writerStart > readerStart, 'job gates-e-pr deve vir após ler-banco');
const reader = jobs.slice(readerStart, writerStart);
const writer = jobs.slice(writerStart);

test('types-sync mantém a credencial e o environment somente no job de leitura', () => {
  assert.match(reader, /environment:\s*banco-leitura/u);
  assert.match(reader, /DESTINO_URL:\s*\$\{\{\s*secrets\.DESTINO_URL\s*\}\}/u);
  assert.match(reader, /contents:\s*read/u);
  assert.doesNotMatch(writer, /environment:\s*banco-leitura|secrets\.DESTINO_URL|DESTINO_URL|PGSSLMODE/u);
});

test('job de escrita recebe candidatos por artifact e resultados booleanos', () => {
  assert.match(reader, /schema_changed:\s*\$\{\{\s*steps\.diff\.outputs\.schema_changed\s*\}\}/u);
  assert.match(reader, /uses:\s*actions\/upload-artifact@/u);
  assert.match(writer, /needs:\s*\[preflight, ler-banco\]/u);
  assert.match(writer, /uses:\s*actions\/download-artifact@/u);
  assert.match(writer, /needs\.ler-banco\.outputs\.schema_changed/u);
  assert.match(writer, /contents:\s*write/u);
  assert.match(writer, /pull-requests:\s*write/u);
});
