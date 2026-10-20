// Contrato offline: os tipos de contato do front (CONTACT_TYPES em
// src/utils/whatsappFileTypes.ts) e o CHECK `contacts.chk_contact_type` do catálogo
// (supabase/schema-catalog.json) aceitam exatamente o mesmo conjunto. Mudar um lado
// sem o outro reabre o drift que quebrou a Sicoob Bridge (auditoria de 29/09, §3.2).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function parseFrontContactTypes(source) {
  const block = source.match(/export const CONTACT_TYPES = \[([\s\S]*?)\] as const;/);
  if (!block) throw new Error('CONTACT_TYPES não encontrado em whatsappFileTypes.ts');
  return [...block[1].matchAll(/value:\s*'([^']+)'/g)].map(m => m[1]);
}

export function parseCheckContactTypes(catalog) {
  const entry = (catalog.check_constraints ?? []).find(c => c.startsWith('contacts.chk_contact_type:'));
  if (!entry) throw new Error('contacts.chk_contact_type ausente do schema-catalog.json');
  return [...entry.matchAll(/'([^']+)'::text/g)].map(m => m[1]);
}

test('parsers extraem os valores dos dois lados', () => {
  assert.deepEqual(
    parseFrontContactTypes("export const CONTACT_TYPES = [\n  { value: 'a', label: 'A' },\n  { value: 'b', label: 'B' },\n] as const;"),
    ['a', 'b'],
  );
  assert.deepEqual(
    parseCheckContactTypes({ check_constraints: ["contacts.chk_contact_type:CHECK ((contact_type = ANY (ARRAY['a'::text, 'b'::text])))"] }),
    ['a', 'b'],
  );
  assert.throws(() => parseCheckContactTypes({ check_constraints: [] }), /ausente/);
});

test('CONTACT_TYPES (front) == chk_contact_type (catálogo)', () => {
  const front = parseFrontContactTypes(fs.readFileSync(path.join(ROOT, 'src/utils/whatsappFileTypes.ts'), 'utf8'));
  const db = parseCheckContactTypes(JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase/schema-catalog.json'), 'utf8')));
  assert.ok(front.length > 0);
  assert.deepEqual([...front].sort(), [...db].sort());
});
