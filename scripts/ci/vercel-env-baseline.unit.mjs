// V070: Testes do baseline de variáveis de ambiente do Vercel.
// Compatível com `node --test scripts/ci/*.unit.mjs`.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadBaseline, checkVars } from './vercel-env-baseline.mjs';

test('baseline JSON parses e tem os targets esperados', () => {
  const b = loadBaseline();
  assert.ok(b.production, 'target production ausente');
  assert.ok(b.preview, 'target preview ausente');
  assert.ok(b.development, 'target development ausente');
});

test('production tem vars obrigatórias de VITE_SUPABASE_*', () => {
  const b = loadBaseline();
  const req = new Set(b.production.required || []);
  assert.ok(req.has('VITE_SUPABASE_URL'), 'VITE_SUPABASE_URL deve ser obrigatória em production');
  assert.ok(req.has('VITE_SUPABASE_ANON_KEY'), 'VITE_SUPABASE_ANON_KEY deve ser obrigatória em production');
});

test('production forbidden_nonvite inclui chaves de servidor críticas', () => {
  const b = loadBaseline();
  const fn = b.production.forbidden_nonvite || [];
  for (const k of ['SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY']) {
    assert.ok(fn.includes(k), `${k} deve estar em forbidden_nonvite de production`);
  }
});

test('checkVars detecta var proibida', () => {
  const b = loadBaseline();
  const errors = checkVars(b, 'production', ['SUPABASE_SERVICE_ROLE_KEY']);
  assert.ok(errors.length > 0, 'deve reportar erro para var proibida');
  assert.ok(errors.some(e => e.includes('SUPABASE_SERVICE_ROLE_KEY')));
});

test('checkVars passa para conjunto de vars apenas obrigatórias', () => {
  const b = loadBaseline();
  const required = b.production.required || [];
  const errors = checkVars(b, 'production', required);
  assert.deepEqual(errors, [], 'vars obrigatórias e só elas devem passar sem erro');
});

test('nenhuma var obrigatória está também proibida (integridade do baseline)', () => {
  const b = loadBaseline();
  for (const target of ['production', 'preview', 'development']) {
    const tc = b[target] || {};
    const required = new Set(tc.required || []);
    const forbidden = new Set([...(tc.forbidden || []), ...(tc.forbidden_nonvite || [])]);
    for (const k of required) {
      assert.ok(
        !forbidden.has(k),
        `"${k}" está ao mesmo tempo em required e forbidden para target="${target}"`
      );
    }
  }
});

test('target preview tem subconjunto menor de obrigatórias que production', () => {
  const b = loadBaseline();
  assert.ok(
    (b.preview.required || []).length <= (b.production.required || []).length,
    'preview não deve exigir mais vars que production'
  );
});
