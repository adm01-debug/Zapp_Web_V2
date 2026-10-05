#!/usr/bin/env node
// Valida docs/catalogo/PLANO_IMPLEMENTACAO_CATALOGO_100.md: 100 etapas, 10 sub-etapas e checklist em cada.
import { readFileSync } from 'node:fs';

import { resolverCaminhoPermitido } from '../lib/seguranca-processo.mjs';

// S8707: o caminho do plano vem do argumento; nunca entra cru no readFileSync.
// A guarda vive no modulo compartilhado (scripts/lib/seguranca-processo.mjs).
// Fail-closed: fora da raiz encerra com exit 1 (mesmo codigo usado para um plano
// invalido). Um `../../etc/passwd` ou absoluto fora delas e recusado.
let arquivo;
try {
  arquivo = resolverCaminhoPermitido(
    process.argv[2] || 'docs/catalogo/PLANO_IMPLEMENTACAO_CATALOGO_100.md',
    'plano de implementacao',
  );
} catch (erro) {
  console.error('ERRO: ' + erro.message);
  process.exit(1);
}
const md = readFileSync(arquivo, 'utf8'); // NOSONAR(S8707): 'arquivo' vem de resolverCaminhoPermitido(...) acima, que resolve o caminho e recusa (exit 1) tudo fora do repositorio/tmp antes deste read
const blocks = md.split(/^### (?=E\d{2,3} · )/m).slice(1);
const errors = [];
const seen = new Set();
for (const b of blocks) {
  const id = b.match(/^E(\d{2,3})/)[1];
  seen.add(Number(id));
  const steps = b.split('**Checklist**')[0].match(/^\d{1,2}\. /gm) || [];
  if (steps.length !== 10) errors.push(`E${id}: ${steps.length} sub-etapas`);
  const nums = steps.map((s) => Number(s));
  if (nums.some((n, i) => n !== i + 1)) errors.push(`E${id}: numeração fora de ordem`);
  // OTH-011: o total do checklist conta itens marcados E nao marcados
  // (`[ ]`, `[x]`, `[X]`); o estado de conclusao nao altera a estrutura exigida.
  const checks = (b.split('**Checklist**')[1] || '').match(/^- \[[ xX]\] /gm) || [];
  if (checks.length < 3) errors.push(`E${id}: checklist com ${checks.length} itens`);
  if (!/\*\*Objetivo:\*\*/.test(b)) errors.push(`E${id}: sem Objetivo`);
}
for (let i = 1; i <= 100; i++) if (!seen.has(i)) errors.push(`E${String(i).padStart(2, '0')}: ausente`);
console.log(`etapas: ${seen.size}/100 · blocos: ${blocks.length}`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('OK: 100 etapas × 10 sub-etapas × checklist');
