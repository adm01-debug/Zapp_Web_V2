import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// TRA-001: o plano "Banco Único" presume origem VPS self-hosted e destino Singu,
// divergindo do canônico (ZAPP = Supabase Cloud tnnnlkbymytvtqngbbqh). Enquanto
// o documento não declarar o baseline divergente, a decisão arquitetural atual
// e o inventário correto de etiquetas, executá-lo mecanicamente pode retargetar
// Auth/dados, apagar tabelas já removidas ou validar PR externa por número
// homônimo do Zapp_Web_V2.

const PLANO = new URL(
  '../../docs/audits/PLANO_BANCO_UNICO_200_ETAPAS_2026-09-24.md',
  import.meta.url,
);
const doc = await readFile(PLANO, 'utf8');

test('plano se declara proposta com baseline divergente e não executável', () => {
  assert.match(doc, /BASELINE DIVERGENTE/);
  assert.match(doc, /[Nn][ãa]o executável|NÃO EXECUTÁVEL/);
  assert.match(doc, /tnnnlkbymytvtqngbbqh/);
});

test('decisão arquitetural distingue os projetos, o Auth e o escopo de dados atuais', () => {
  // Bancos externos somente leitura e o self-hosted que não é o ZAPP.
  assert.match(doc, /pgxfvjmuubtbowutlide[^\n]*somente leitura|somente leitura[^\n]*pgxfvjmuubtbowutlide/);
  assert.match(doc, /doufsxqlfjyuvxuezpln/);
  // Auth atual: auth.users do Cloud canônico, não do Singu.
  assert.match(doc, /auth\.users[^\n]*tnnnlkbymytvtqngbbqh|tnnnlkbymytvtqngbbqh[^\n]*auth\.users/);
});

test('inventário distingue contacts.tags das tabelas legadas já removidas', () => {
  assert.match(doc, /contacts\.tags/);
  assert.match(doc, /20260927410000_drop_legacy_tags_tables/);
  assert.match(doc, /`?tags`?\s*e\s*`?contact_tags`?[^\n]*(removidas|dropadas|DROP)/i);
});

test('nenhuma PR externa aparece sem qualificação de repositório Singu_V2', () => {
  const linhas = doc.split('\n');
  const semRepo = [];
  for (const [i, linha] of linhas.entries()) {
    const mencoes = linha.match(/PR #\d+/g);
    if (mencoes && !/Singu_V2/.test(linha)) semRepo.push(`${i + 1}: ${mencoes.join(', ')}`);
  }
  assert.deepEqual(
    semRepo,
    [],
    `menções de PR sem o repositório de origem (Singu_V2) na mesma linha:\n${semRepo.join('\n')}`,
  );
});
