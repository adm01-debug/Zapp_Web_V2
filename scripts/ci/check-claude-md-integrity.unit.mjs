// GA02: trava anti-apagao do CLAUDE.md — mutacao (arquivo com
// 'placeholder') reprova; arquivo com as 3 secoes passa.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { avaliarClaudeMd, REQUIRED_SECTIONS } from './check-claude-md-integrity.mjs';

test('GA02: arquivo placeholder reprova (wipe de 15/10)', () => {
  const r = avaliarClaudeMd('placeholder', 'x'.repeat(50000));
  assert.equal(r.ok, false);
  assert.match(r.motivo, /secao obrigatoria ausente/);
});

test('GA02: arquivo sem uma secao reprova', () => {
  const r = avaliarClaudeMd('Banco de dados OFICIAL\nPerímetro do GitHub\n', null);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /um PR por lote/);
});

test('GA02: arquivo encolhido >30% vs HEAD reprova', () => {
  const base = 'Banco de dados OFICIAL\nPerímetro do GitHub\num PR por lote\n' + 'x'.repeat(10000);
  const r = avaliarClaudeMd(REQUIRED_SECTIONS.join('\n'), base);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /encolheu/);
});

test('GA02: CLAUDE.md real passa com as 3 secoes', () => {
  const real = readFileSync('CLAUDE.md', 'utf8');
  for (const s of REQUIRED_SECTIONS) assert.ok(real.includes(s), 'falta: ' + s);
  const r = avaliarClaudeMd(real, real);
  assert.equal(r.ok, true);
});
