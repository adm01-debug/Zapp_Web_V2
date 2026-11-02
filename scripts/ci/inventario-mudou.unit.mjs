// Contrato de scripts/inventario/mudou-conteudo.mjs: o workflow semanal so abre PR quando o
// inventario mudou alem das datas — inclusive no edges.json, que e gravado numa linha so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mudou, semCarimbos } from '../inventario/mudou-conteudo.mjs';

const ler = (mapa) => (f) => (f in mapa ? mapa[f] : null);

test('so a data mudou (edges.json numa linha so): nao abre PR', () => {
  const antes = { 'e.json': JSON.stringify({ gerado_em: '2026-11-01T00:00:00Z', total: 85, sem_chamador_no_repo: ['a'] }) + '\n' };
  const depois = { 'e.json': JSON.stringify({ gerado_em: '2026-11-08T00:00:00Z', total: 85, sem_chamador_no_repo: ['a'] }) + '\n' };
  assert.equal(mudou(['e.json'], ler(antes), ler(depois)), false);
});

test('mudanca real no edges.json, na mesma linha da data: abre PR', () => {
  const antes = { 'e.json': JSON.stringify({ gerado_em: '2026-11-01T00:00:00Z', total: 85 }) };
  const depois = { 'e.json': JSON.stringify({ gerado_em: '2026-11-08T00:00:00Z', total: 86 }) };
  assert.equal(mudou(['e.json'], ler(antes), ler(depois)), true);
});

test('medido_em aninhado e ordem de chaves nao contam; valor aninhado conta', () => {
  const a = JSON.stringify({ x: { medido_em: '1', n: 1 }, y: 2 }, null, 2);
  const b = JSON.stringify({ y: 2, x: { n: 1, medido_em: '2' } });
  assert.equal(semCarimbos(a), semCarimbos(b));
  assert.equal(mudou(['f'], ler({ f: a }), ler({ f: JSON.stringify({ x: { n: 2 }, y: 2 }) })), true);
});

test('arquivo novo ou apagado conta como mudanca', () => {
  assert.equal(mudou(['f'], ler({}), ler({ f: '{}' })), true);
  assert.equal(mudou(['f'], ler({ f: '{}' }), ler({})), true);
  assert.equal(mudou(['f'], ler({}), ler({})), false);
});
