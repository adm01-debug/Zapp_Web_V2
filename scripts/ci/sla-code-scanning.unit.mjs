import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { avaliarSla, nivel, relatorio } from './sla-code-scanning.mjs';

const AGORA = Date.parse('2026-10-15T12:00:00Z');
const diasAtras = (d) => new Date(AGORA - d * 86_400_000).toISOString();
const alerta = (number, rule, dias) => ({ number, rule, created_at: diasAtras(dias), most_recent_instance: { location: { path: 'src/x.ts' } } });

test('nível vem de security_severity_level; sem ele, error conta como alto (o defeito de rule.severity)', () => {
  assert.equal(nivel({ rule: { security_severity_level: 'high', severity: 'warning' } }), 'high');
  assert.equal(nivel({ rule: { security_severity_level: 'Critical' } }), 'critical');
  assert.equal(nivel({ rule: { severity: 'error' } }), 'high');
  assert.equal(nivel({ rule: { severity: 'warning' } }), 'low');
  assert.equal(nivel({}), 'low');
});

test('high vence com 15 dias; medium só depois de 30', () => {
  const r = avaliarSla([
    alerta(1, { id: 'js/a', security_severity_level: 'high' }, 15),
    alerta(2, { id: 'js/b', security_severity_level: 'high' }, 14),
    alerta(3, { id: 'js/c', security_severity_level: 'medium' }, 29),
    alerta(4, { id: 'js/d', security_severity_level: 'medium' }, 31),
  ], AGORA);
  assert.equal(r.total, 4);
  assert.deepEqual(r.violacoes, [
    'HIGH (15d > 14d) — #1: js/a em src/x.ts',
    'MEDIUM (31d > 30d) — #4: js/d em src/x.ts',
  ]);
});

test('relatório: sem violação diz isso; com violação lista em bloco', () => {
  assert.match(relatorio({ total: 0, violacoes: [] }), /Alertas abertos: 0[\s\S]*Nenhuma violação/);
  assert.match(relatorio({ total: 1, violacoes: ['HIGH x'] }), /Violações de SLA[\s\S]*HIGH x/);
});

const SCRIPT = new URL('./sla-code-scanning.mjs', import.meta.url).pathname;
const cli = (entrada) => spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', input: entrada });

test('CLI: lê o JSON do stdin, sai 1 com violação e 0 sem', () => {
  const r1 = cli(JSON.stringify([{ number: 9, rule: { id: 'js/z', security_severity_level: 'high' }, created_at: '2020-01-01T00:00:00Z' }]));
  assert.equal(r1.status, 1);
  assert.match(r1.stdout, /#9: js\/z/);
  assert.match(r1.stderr, /::error::W83/);
  const r0 = cli('[]');
  assert.equal(r0.status, 0);
  assert.match(r0.stdout, /Nenhuma violação/);
});

test('CLI: resposta que não é lista (erro de permissão) ou JSON inválido avisa e não bloqueia', () => {
  for (const entrada of [JSON.stringify({ message: 'Resource not accessible by integration' }), 'não é json', '']) {
    const r = cli(entrada);
    assert.equal(r.status, 0, entrada);
    assert.match(r.stderr, /::warning::W83/);
  }
});

test('o workflow passa os alertas pelo stdin e não tem mais Node inline', () => {
  const wf = readFileSync(new URL('../../.github/workflows/branch-hygiene-audit.yml', import.meta.url), 'utf8');
  assert.match(wf, /node scripts\/ci\/sla-code-scanning\.mjs < "\$ARQUIVO"/);
  assert.doesNotMatch(wf, /NODE_EOF/);
  assert.doesNotMatch(wf, /node --input-type=module/);
});
