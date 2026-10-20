#!/usr/bin/env node
// Valida docs/catalogo/PLANO_IMPLEMENTACAO_CATALOGO_100.md: 100 etapas, 10 sub-etapas e checklist em cada.
import { readFileSync } from 'node:fs';
const path = process.argv[2] || 'docs/catalogo/PLANO_IMPLEMENTACAO_CATALOGO_100.md';
const md = readFileSync(path, 'utf8');
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
  const checks = (b.split('**Checklist**')[1] || '').match(/^- \[ \] /gm) || [];
  if (checks.length < 3) errors.push(`E${id}: checklist com ${checks.length} itens`);
  if (!/\*\*Objetivo:\*\*/.test(b)) errors.push(`E${id}: sem Objetivo`);
}
for (let i = 1; i <= 100; i++) if (!seen.has(i)) errors.push(`E${String(i).padStart(2, '0')}: ausente`);
console.log(`etapas: ${seen.size}/100 · blocos: ${blocks.length}`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('OK: 100 etapas × 10 sub-etapas × checklist');
