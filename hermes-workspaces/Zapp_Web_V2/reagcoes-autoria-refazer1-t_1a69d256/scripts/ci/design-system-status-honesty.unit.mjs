#!/usr/bin/env node
// Guarda de honestidade dos checkpoints do ledger do Design System Promo Gifts.
//
// Histórico: `docs/design/DESIGN_SYSTEM_PROMO_GIFTS_STATUS.md` marcava CP0–CP11 como
// `[x]` (checkpoint fechado) enquanto o próprio corpo registrava prova parcial ou
// contrária ao fechamento: CP0 com `typecheck=timeout` (gate não demonstrado), CP1 com
// campos placeholder `_` (ΔE, fonts, light, skin nunca medidos), CP11 com
// `consoleErrors` e CP12 com PR/CI/merge `pendente`. Nenhum gate global (suíte,
// visual/responsivo, acessibilidade/console, PR/CI) estava provado. Um `[x]` nesse
// estado mente para a próxima sessão, que passa a achar que a entrega está fechada.
//
// Estes testes travam a semântica dos marcadores e a classificação dos gates:
//   [x] = implementação E todos os gates aplicáveis demonstrados, com evidência;
//   [~] = implementação/prova técnica existe, mas ao menos um gate segue não demonstrado;
//   [ ] = pendente.
// Evidência ausente é `NÃO DEMONSTRADO`/`PENDENTE`, nunca sucesso. O teste é vermelho
// enquanto um `[x]` conviver com timeout, placeholder ou gate global não demonstrado.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REL = 'docs/design/DESIGN_SYSTEM_PROMO_GIFTS_STATUS.md';
const texto = fs.readFileSync(path.join(raiz, REL), 'utf8');

// Gates globais que o ledger precisa classificar explicitamente.
const GATES = [
  'typecheck',
  'lint/ratchets',
  'build',
  'suíte',
  'visual/responsivo',
  'acessibilidade/console',
  'PR/CI',
];

// --- Blocos de checkpoint: de `## CPn` até o próximo cabeçalho `##` (ou fim). ---
function lerCheckpoints() {
  const blocos = new Map();
  let atual = null;
  for (const linha of texto.split('\n')) {
    const m = linha.match(/^##\s+CP(\d+)\b(.*)$/u);
    if (m) {
      atual = Number(m[1]);
      const marca = m[2].match(/\[([x~ ])\]/u);
      blocos.set(atual, { marcador: marca ? marca[1] : null, linhas: [linha] });
      continue;
    }
    if (atual !== null) blocos.get(atual).linhas.push(linha);
  }
  for (const bloco of blocos.values()) bloco.corpo = bloco.linhas.join('\n');
  return blocos;
}

const cps = lerCheckpoints();

// Evidência incompleta/contrária que NUNCA pode coexistir com `[x]`.
const TIMEOUT = /\btimeout\b/iu;
const PLACEHOLDER = /[\wÀ-ÿ][\w À-ÿ/+.-]*[=:]\s*_(?=\s|·|$|\))/mu; // chave=_
const PENDENTE = /\b(pendente|aguardando|não demonstrado|nao demonstrado)\b/iu;

// Estado declarado para um gate global, lendo a linha `- <gate> — <estado> — ...`.
function estadoDoGate(gate) {
  for (const linha of texto.split('\n')) {
    const m = linha.match(/^\s*[-*]\s+(.*)$/u);
    if (!m) continue;
    const rest = m[1];
    if (!rest.startsWith(gate)) continue;
    const resto = rest.slice(gate.length).trimStart();
    if (!/^[—:–-]/u.test(resto)) continue;
    const valor = resto.replace(/^[—:–-]+\s*/u, '').split(/\s+—\s+/u)[0].trim().toUpperCase();
    return valor;
  }
  return null;
}

test('ledger declara legenda que diferencia [~], [x] e [ ]', () => {
  const m = texto.match(/##[^\n]*[Ll]egenda[^\n]*\n([\s\S]*?)(?=\n##\s)/u);
  assert.ok(m, 'ledger não tem seção de legenda de estados');
  const legenda = m[1];
  for (const token of ['[x]', '[~]', '[ ]']) {
    assert.ok(legenda.includes(token), `legenda não define o estado ${token}`);
  }
  assert.match(legenda, /parcial/iu, 'legenda não descreve o estado parcial [~]');
});

test('resumo global de gates cobre os 7 gates com estado declarado', () => {
  assert.match(texto, /##[^\n]*[Rr]esumo global[^\n]*/u, 'ledger não tem seção de resumo global de gates');
  const faltando = GATES.filter((gate) => estadoDoGate(gate) === null);
  assert.deepEqual(faltando, [], `resumo global não cobre: ${faltando.join(', ')}`);
  // Ausência de prova tem de ser rotulada; nunca omitida em silêncio.
  assert.match(
    texto,
    /NÃO DEMONSTRADO|PENDENTE/u,
    'nenhum gate declarado como NÃO DEMONSTRADO/PENDENTE — suspeito de sucesso inventado',
  );
});

test('nenhum checkpoint [x] convive com prova parcial, placeholder ou timeout', () => {
  const ofensores = [];
  for (const [n, cp] of cps) {
    if (cp.marcador !== 'x') continue;
    if (TIMEOUT.test(cp.corpo)) ofensores.push(`CP${n}: timeout`);
    if (PLACEHOLDER.test(cp.corpo)) ofensores.push(`CP${n}: campo placeholder _`);
    if (PENDENTE.test(cp.corpo)) ofensores.push(`CP${n}: entrega/gate pendente`);
  }
  assert.deepEqual(
    ofensores,
    [],
    `checkpoint [x] com evidência incompleta/contrária: ${ofensores.join('; ')}`,
  );
});

test('enquanto algum gate global não estiver DEMONSTRADO, nenhum checkpoint fica [x]', () => {
  const naoDemonstrados = GATES.filter((gate) => estadoDoGate(gate) !== 'DEMONSTRADO');
  if (naoDemonstrados.length === 0) return;
  const fechados = [...cps.entries()]
    .filter(([, cp]) => cp.marcador === 'x')
    .map(([n]) => `CP${n}`);
  assert.deepEqual(
    fechados,
    [],
    `gates não demonstrados (${naoDemonstrados.join(', ')}) impedem [x] em: ${fechados.join(', ')}`,
  );
});

test('CP12 (entrega) permanece [ ] enquanto PR/CI/merge não estiverem concluídos', () => {
  assert.ok(cps.has(12), 'ledger não tem CP12');
  assert.equal(cps.get(12).marcador, ' ', 'CP12 deve permanecer pendente [ ]');
});
