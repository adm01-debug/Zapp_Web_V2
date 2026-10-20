import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const contactsView = readFileSync('src/components/contacts/ContactsView.tsx', 'utf8');
const legacyPlan = readFileSync('docs/design/PLANO_MELHORIAS_CONTATOS_50_ETAPAS_2026-09-27.md', 'utf8');
const canonicalPlan = readFileSync('docs/audits/PLANO_CONTATOS_100_ETAPAS_2026-09-29.md', 'utf8');

const reconciliation = /38px[^\n]*(?:não se aplica|inaplicável)[^\n]*(?:cabeçalho visual|header visual)[^\n]*(?:#1262|e06e5262)/i;

test('Contatos preserva o título semântico sem recriar o cabeçalho visual removido', () => {
  assert.doesNotMatch(contactsView, /import\s+\{\s*PageHeader\s*\}/);
  assert.match(contactsView, /<h1 className="sr-only">Contatos<\/h1>/);
});

test('a decisão D3 Navy explicita que 38px não se aplica mais à tela de Contatos', () => {
  assert.match(legacyPlan, reconciliation);
  assert.match(canonicalPlan, reconciliation);
});
