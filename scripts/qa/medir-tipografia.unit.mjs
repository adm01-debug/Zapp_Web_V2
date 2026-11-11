import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseLoadedWeights, isWeightLoaded } from './medir-tipografia.cjs';

// `parseLoadedWeights` lia a URL do Google Fonts v2 fazendo
// `m[1].split(':wght@')`, que só casa o eixo ÚNICO "wght@...". O Google
// Fonts também publica combinações de eixo (ex.: família com itálico usa
// "Nome:ital,wght@0,400;1,400" — separador ":ital,wght@", não ":wght@").
// Sem bater no split, a família inteira (nome + eixos + valores) virava a
// CHAVE do objeto — a família real desaparecia de `families`, e
// `scanOrphanWeights` desistia de validar pesos de fonte em silêncio assim
// que essa família ganhasse itálico.
function escreverFixture(html) {
  const dir = mkdtempSync(path.join(tmpdir(), 'medir-tipografia-'));
  const arquivo = path.join(dir, 'index.html');
  writeFileSync(arquivo, html);
  return { dir, arquivo };
}

test('familia com eixo combinado ital,wght e reconhecida pelo nome correto', () => {
  const { dir, arquivo } = escreverFixture(
    '<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,700;1,400&display=swap">',
  );
  try {
    const families = parseLoadedWeights(arquivo);
    assert.ok(
      families['Plus Jakarta Sans'],
      `a familia deveria estar na chave "Plus Jakarta Sans", nao em "${Object.keys(families)[0]}"`,
    );
    assert.deepEqual(families['Plus Jakarta Sans'].exact, [400, 500, 700]);
    assert.equal(isWeightLoaded(families['Plus Jakarta Sans'], 450), false, 'peso intermediario ausente nao pode contar como carregado');
    assert.equal(isWeightLoaded(families['Plus Jakarta Sans'], 400), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('eixo unico wght (formato real do repo) continua funcionando sem mudanca', () => {
  const { dir, arquivo } = escreverFixture(
    '<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@200..800&family=JetBrains+Mono:wght@400;500&display=swap">',
  );
  try {
    const families = parseLoadedWeights(arquivo);
    assert.deepEqual(families['Plus Jakarta Sans'], { min: 200, max: 800, exact: null });
    assert.deepEqual(families['JetBrains Mono'], { min: 400, max: 500, exact: [400, 500] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('familia sem nenhum eixo (so o nome) vira peso estatico 400', () => {
  const { dir, arquivo } = escreverFixture(
    '<link href="https://fonts.googleapis.com/css2?family=Roboto&display=swap">',
  );
  try {
    const families = parseLoadedWeights(arquivo);
    assert.deepEqual(families.Roboto, { min: 400, max: 400, exact: [400] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
