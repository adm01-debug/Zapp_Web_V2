import test from 'node:test';
import assert from 'node:assert/strict';
import { Linter } from 'eslint';
import rule from './no-secret-compare.js';

const linter = new Linter();
const config = {
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: { local: { rules: { 'no-secret-compare': rule } } },
  rules: { 'local/no-secret-compare': 'error' },
};

function lint(code) {
  return linter.verify(code, config).filter((m) => m.ruleId === 'local/no-secret-compare');
}

test('pega comparação direta de credencial (===/!==)', () => {
  assert.equal(lint('if (token !== serviceRole) {}').length, 1);
  assert.equal(lint('if (req.apiKey === expected) {}').length, 1);
  assert.equal(lint('if (password === input) {}').length, 1);
});

test('NÃO pega modificadores de teclado/mouse do DOM (falso positivo conhecido)', () => {
  assert.equal(lint("if (e.key === 'Enter') {}").length, 0);
  assert.equal(lint('if (event.ctrlKey === true) {}').length, 0);
  assert.equal(lint('if (event.shiftKey !== otherEvent.shiftKey) {}').length, 0);
  assert.equal(lint('if (event.altKey === other.altKey) {}').length, 0);
  assert.equal(lint('if (event.metaKey === other.metaKey) {}').length, 0);
});

test('ainda pega nomes que contêm "key" mas não são o modificador exato', () => {
  assert.equal(lint('if (apiKey === expected) {}').length, 1);
  assert.equal(lint('if (req.apiKey === expected) {}').length, 1);
});

test('NÃO pega literais e comparações sem nome legível', () => {
  assert.equal(lint("if (a === 'x') {}").length, 0);
  assert.equal(lint('if (1 === 2) {}').length, 0);
});
