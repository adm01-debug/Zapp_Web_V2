import assert from 'node:assert/strict';
import test from 'node:test';
import { extrairDocs, extrairNaoEBug } from './render-workflow-docs.mjs';

test('GA98: descricao nao-e-bug continua na linha seguinte', () => {
  const texto = [
    '# docs:',
    '#   gatilho: x',
    '#   prova: y',
    '#   falha: z',
    '#   avisa: w',
    '# nao-e-bug:',
    '#   - item longo: primeira parte',
    '#     segunda parte da mesma descricao',
    '# =================================================',
    'name: X',
  ].join('\n');

  assert.deepEqual(extrairNaoEBug(texto), [
    { chave: 'item longo', descricao: 'primeira parte segunda parte da mesma descricao' },
  ]);
});

test('GA98: bloco docs mantém os quatro campos', () => {
  const texto = '# docs:\n#   gatilho: x\n#   prova: y\n#   falha: z\n#   avisa: w\nname: X\n';
  assert.deepEqual(extrairDocs(texto), { gatilho: 'x', prova: 'y', falha: 'z', avisa: 'w' });
});
