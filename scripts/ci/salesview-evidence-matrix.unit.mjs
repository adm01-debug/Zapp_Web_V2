import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const DIR = new URL('../../docs/design/salesview-journey/', import.meta.url);
const REPORT = new URL('VERIFICACAO_S38_S41_S42_S43_2026-10-02.md', DIR);
const INVENTORY = new URL('../../reconciliation/evidence/salesview-image-inventory.json', DIR);
const REQUIRED = [
  '00-antes-barra.png',
  '00-antes-sidebar.png',
  '01-barra.png',
  '01-barra-claro.png',
  '02-salesview-vazio.png',
  '03-salesview-cheio.png',
  '04-journey.png',
  '04-journey-claro.png',
  '05-sidebar.png',
];

function pngSize(buffer) {
  assert.equal(buffer.subarray(1, 4).toString(), 'PNG', 'arquivo precisa ser PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

test('matriz visual referencia os 9 arquivos exigidos, todos em 1280 px e abaixo de 400 KB', async () => {
  const report = await readFile(REPORT, 'utf8');
  for (const name of REQUIRED) {
    const image = await readFile(new URL(name, DIR));
    assert.equal(pngSize(image).width, 1280, `${name}: largura`);
    assert.ok(image.byteLength < 400 * 1024, `${name}: excede 400 KB`);
    assert.match(report, new RegExp(`\\([^)]*${name.replaceAll('.', '\\.') }\\)`), `${name}: sem referência Markdown`);
  }
});

test('estado cheio não reutiliza o blob do estado vazio', async () => {
  const [empty, full] = await Promise.all([
    readFile(new URL('02-salesview-vazio.png', DIR)),
    readFile(new URL('03-salesview-cheio.png', DIR)),
  ]);
  assert.notEqual(sha256(empty), sha256(full));
});

test('inventário registra tamanho e hash atuais dos arquivos da matriz', async () => {
  const inventory = JSON.parse(await readFile(INVENTORY, 'utf8'));
  const byName = new Map(inventory.map((item) => [item.path.split('/').at(-1), item]));
  for (const name of REQUIRED) {
    const image = await readFile(new URL(name, DIR));
    const item = byName.get(name);
    assert.ok(item, `${name}: ausente do inventário`);
    assert.equal(item.bytes, image.byteLength, `${name}: bytes desatualizados`);
    assert.equal(item.sha256, sha256(image), `${name}: hash desatualizado`);
  }
});
