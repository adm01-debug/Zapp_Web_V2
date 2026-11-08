import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  measure,
  measureBadges,
  parseBadges,
  parseThemes,
} from './contraste-contatos.mjs';
import {
  medir,
  parseTemas,
} from './contraste-combobox.mjs';

const tokensCss = readFileSync('src/styles/tokens.css', 'utf8');
const a11yCss = readFileSync('src/styles/accessibility.css', 'utf8');
const config = readFileSync('src/components/contacts/contactTypeConfig.tsx', 'utf8');

test('badges atuais por tokens CSS sao medidos e todos preservam AA', () => {
  const themes = parseThemes(tokensCss);
  const badges = parseBadges(config);
  assert.equal(badges.length, 6);
  const rows = measureBadges(themes, badges);
  assert.equal(rows.length, 12);
  assert.deepEqual(rows.filter((row) => row.ratio < 4.5), []);
});

test('medidor de badges continua acusando contraste insuficiente', () => {
  const themes = parseThemes(tokensCss);
  const badges = parseBadges(config);
  const adulterado = {
    ...themes,
    claro: {
      ...themes.claro,
      'primary-text': themes.claro.card,
      primary: themes.claro.card,
    },
  };
  const clienteClaro = measureBadges(adulterado, badges)
    .find((row) => row.theme === 'claro' && row.label.includes('Cliente'));
  assert.ok(clienteClaro.ratio < 4.5, `controle deveria reprovar, ratio=${clienteClaro.ratio}`);
});

test('pares gerais de Contatos permanecem AA', () => {
  assert.deepEqual(measure(parseThemes(tokensCss)).filter((row) => row.ratio < 4.5), []);
});

test('alto contraste escuro le tokens com !important e permanece AA', () => {
  const rows = medir(parseTemas(tokensCss, a11yCss))
    .filter((row) => row.tema === 'altoContrasteEscuro');
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.filter((row) => row.ratio < 4.5), []);
  assert.ok(rows.every((row) => row.ratio > 7), 'os tokens reais devem superar AAA neste tema');
});
