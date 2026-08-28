#!/usr/bin/env node
/**
 * Diffa duas saidas de manifest.sql.
 *   node scripts/db-audit/diff.mjs /tmp/src.json /tmp/dst.json
 *
 * Sai com 1 se houver qualquer divergencia estrutural.
 */
import fs from 'node:fs';

const [a, b] = process.argv.slice(2);
if (!a || !b) {
  console.error('uso: node diff.mjs <manifesto_a.json> <manifesto_b.json>');
  process.exit(2);
}

const A = JSON.parse(fs.readFileSync(a, 'utf8'));
const B = JSON.parse(fs.readFileSync(b, 'utf8'));

console.log('A = ' + A.db + '  (' + A.when + ')');
console.log('B = ' + B.db + '  (' + B.when + ')');

let problemas = 0;

for (const secao of ['col', 'cons', 'idx', 'pol', 'trg', 'fn']) {
  const SA = A[secao] || {};
  const SB = B[secao] || {};
  const todos = [...new Set([...Object.keys(SA), ...Object.keys(SB)])].sort();
  const soEmA = todos.filter((t) => !(t in SB));
  const soEmB = todos.filter((t) => !(t in SA));
  const diverge = todos.filter((t) => t in SA && t in SB && SA[t] !== SB[t]);
  problemas += soEmA.length + soEmB.length + diverge.length;
  console.log(
    '\n[' + secao + '] so em A: ' + soEmA.length +
    ' | so em B: ' + soEmB.length +
    ' | divergente: ' + diverge.length,
  );
  if (soEmA.length) console.log('  so em A: ' + soEmA.join(', '));
  if (soEmB.length) console.log('  so em B: ' + soEmB.join(', '));
  if (diverge.length) console.log('  divergente: ' + diverge.join(', '));
}

console.log('\n[grants] A=' + A.grants_hash + ' B=' + B.grants_hash +
            (A.grants_hash === B.grants_hash ? '  IDENTICO' : '  DIVERGENTE'));
if (A.grants_hash !== B.grants_hash) problemas++;

console.log('\nTotal de divergencias: ' + problemas);
process.exit(problemas ? 1 : 0);
