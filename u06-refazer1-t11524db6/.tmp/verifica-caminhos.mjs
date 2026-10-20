#!/usr/bin/env node
// Guarda de apoio (local, .tmp): prova que o documento
// docs/design/EMAIL_NAO_LIDO_ALERTAS.md é fiel ao código quanto às REFERÊNCIAS —
// todo caminho citado existe e toda linha citada está dentro do arquivo.
// (Documento que cita arquivo inexistente ou linha fora do fim não cumpre o
// critério de pronto do cartão U06: "documento fiel ao código".)
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { basename } from 'node:path';

const doc = readFileSync('docs/design/EMAIL_NAO_LIDO_ALERTAS.md', 'utf8');
const RE_CAMINHO = /`((?:src|tests|e2e|supabase|docs)\/[^`\s]+?)`/g;

// 1) Caminhos completos citados (sem a linha, quando vem `arquivo.tsx:112-116`).
const comCaminho = new Set();
for (const m of doc.matchAll(RE_CAMINHO)) comCaminho.add(m[1].replace(/:\d+(?:-\d+)?$/, ''));
const citados = [...comCaminho].sort();
assert.ok(citados.length >= 8, `poucos caminhos citados (${citados.length}) — o documento encolheu?`);
const ausentes = citados.filter((p) => !existsSync(p));
assert.deepEqual(ausentes, [], `caminhos citados que NÃO existem: ${ausentes.join(', ')}`);

// 2) Índice por nome de arquivo, para resolver a forma curta (`SidebarNavItem.tsx:119`).
const porNome = new Map();
for (const p of citados) {
  const n = basename(p);
  porNome.set(n, porNome.has(n) ? null : p); // null = ambíguo
}

// 3) Referências de linha `arquivo:linha` ou `arquivo:ini-fim`.
const RE_LINHA = /`([\w./-]+\.(?:tsx?|mjs|json|sql)):(\d+)(?:-(\d+))?`/g;
const refs = [...doc.matchAll(RE_LINHA)];
assert.ok(refs.length >= 10, `poucas referências de linha (${refs.length})`);
const problemas = [];
for (const [, alvo, ini, fim] of refs) {
  const caminho = alvo.includes('/') ? alvo : porNome.get(basename(alvo));
  if (!caminho) { problemas.push(`${alvo}: não resolvi o caminho`); continue; }
  const total = readFileSync(caminho, 'utf8').split('\n').length;
  for (const n of new Set([Number(ini), fim ? Number(fim) : Number(ini)])) {
    if (n < 1 || n > total) problemas.push(`${caminho}:${n} (o arquivo tem ${total} linhas)`);
  }
}
assert.deepEqual(problemas, [], `referências infiéis: ${problemas.join(', ')}`);

console.log(`OK: ${citados.length} caminhos citados (todos existem) e ${refs.length} referências de linha dentro do arquivo.`);
