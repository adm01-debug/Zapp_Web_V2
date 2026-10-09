import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const DIR = new URL('../../docs/design/salesview-journey/', import.meta.url);
const REPORT = new URL('VERIFICACAO_S38_S41_S42_S43_2026-10-02.md', DIR);
const REFERENCES = new Map([
  ['00-antes-barra.png', 'c575638acc245df8bd54eddca96d18c1e2c849c1193ce7ad4a697c801da18fd1'],
  ['00-antes-sidebar.png', '736c12af7c722c5c1d053ff17f3adf2013a2543054dfd801e5649338eef14514'],
]);

function pngDimensions(buffer) {
  assert.equal(buffer.subarray(1, 4).toString(), 'PNG', 'arquivo precisa ser PNG');
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('reconstruções históricas existem, têm 1280×900, menos de 400 KB e links Markdown', async () => {
  const report = await readFile(REPORT, 'utf8');

  for (const [name, inspectedSha256] of REFERENCES) {
    const image = await readFile(new URL(name, DIR));
    assert.deepEqual(pngDimensions(image), { width: 1280, height: 900 }, `${name}: dimensões`);
    assert.ok(image.byteLength < 400 * 1024, `${name}: excede 400 KB`);
    assert.equal(createHash('sha256').update(image).digest('hex'), inspectedSha256, `${name}: não é o blob inspecionado`);
    assert.match(
      report,
      new RegExp(`\\[[^\\]]+\\]\\([^)]*${escapeRegExp(name)}\\)`),
      `${name}: sem link Markdown`,
    );
    assert.match(report, new RegExp(escapeRegExp(inspectedSha256)), `${name}: SHA-256 sem registro`);
  }

  assert.match(report, /reconstruções sintéticas do estado histórico/i);
  assert.match(report, /Não há telefone, e-mail,[\s\S]*nome, empresa ou conversa real visível\./);
});

test('escapeRegExp protege todos os metacaracteres usados pelo seletor de link', () => {
  const literal = '00-[antes]+(barra)?.png$^{}|\\';
  assert.match(literal, new RegExp(`^${escapeRegExp(literal)}$`));
});
