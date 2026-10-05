import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';

const EMPTY_PATH = 'docs/design/salesview-journey/02-salesview-vazio.png';
const FULL_PATH = 'docs/design/salesview-journey/03-salesview-cheio.png';
const INVENTORY_PATH = 'docs/reconciliation/evidence/salesview-image-inventory.json';

async function sha256(path) {
  const bytes = await readFile(path);
  return createHash('sha256').update(bytes).digest('hex');
}

test('estado cheio da SalesView difere do vazio e corresponde ao inventário', async () => {
  const [emptyHash, fullHash, fullStats, inventorySource] = await Promise.all([
    sha256(EMPTY_PATH),
    sha256(FULL_PATH),
    stat(FULL_PATH),
    readFile(INVENTORY_PATH, 'utf8'),
  ]);
  const inventory = JSON.parse(inventorySource);
  const entry = inventory.find(({ path }) => path === FULL_PATH);

  assert.notEqual(
    fullHash,
    emptyHash,
    '03-salesview-cheio.png deve ter conteúdo visual distinto de 02-salesview-vazio.png',
  );
  assert.ok(entry, `inventário deve conter ${FULL_PATH}`);
  assert.equal(entry.bytes, fullStats.size, 'bytes do inventário devem corresponder ao PNG cheio');
  assert.equal(entry.sha256, fullHash, 'SHA-256 do inventário deve corresponder ao PNG cheio');
});
