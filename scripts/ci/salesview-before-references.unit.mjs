import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const DIR = new URL('../../docs/design/salesview-journey/', import.meta.url);
const REPORT = new URL('VERIFICACAO_S38_S41_S42_S43_2026-10-02.md', DIR);
const REFERENCES = [
  '00-antes-barra.png',
  '00-antes-sidebar.png',
];

function pngWidth(buffer) {
  assert.equal(buffer.subarray(1, 4).toString(), 'PNG', 'arquivo precisa ser PNG');
  return buffer.readUInt32BE(16);
}

test('referências históricas existem, têm 1280 px, menos de 400 KB e links Markdown', async () => {
  const report = await readFile(REPORT, 'utf8');

  for (const name of REFERENCES) {
    const image = await readFile(new URL(name, DIR));
    assert.equal(pngWidth(image), 1280, `${name}: largura`);
    assert.ok(image.byteLength < 400 * 1024, `${name}: excede 400 KB`);
    assert.match(
      report,
      new RegExp(`\\[[^\\]]+\\]\\([^)]*${name.replaceAll('.', '\\.') }\\)`),
      `${name}: sem link Markdown`,
    );
  }
});
