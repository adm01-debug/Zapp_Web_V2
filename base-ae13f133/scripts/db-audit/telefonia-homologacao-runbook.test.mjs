// Guarda do roteiro de homologação de áudio da Telefonia (T87 / TEL-RUNTIME-001).
//
// O achado TEL-RUNTIME-001 diz que a persistência SIP (T11) e o código de
// gravação (T71–T74) existem, mas NÃO encerram a homologação real: falta o
// roteiro com os 9 cenários e os recibos por cenário, e falta a chamada real
// com a operadora/linha. Na máquina o que dá para entregar de forma honesta é o
// roteiro; este teste trava esse artefato para ele não desaparecer nem ficar
// incompleto em silêncio.
//
// Vermelho antes de `docs/telefonia/HOMOLOGACAO.md` existir; verde depois.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ROTEIRO = path.join(RAIZ, 'docs/telefonia/HOMOLOGACAO.md');

/** Os 9 cenários da etapa 100/T96 (Apêndice G do plano anterior). */
const CENARIOS = [
  'VoIP saída atendida',
  'VoIP saída não atendida',
  'VoIP saída cancelada',
  'VoIP saída ocupado',
  'VoIP entrada atendida',
  'VoIP entrada recusada',
  'VoIP entrada perdida',
  'WhatsApp entrada',
  'Navegação',
];

/** Colunas do recibo que a etapa 100 exige por cenário. */
const COLUNAS_RECIBO = [
  'id',
  'canal',
  'direção',
  'cenário',
  'status',
  'end_reason',
  'talk_seconds',
  'recording_status',
];

function lerRoteiro() {
  assert.ok(fs.existsSync(ROTEIRO), `roteiro de homologação ausente: ${ROTEIRO}`);
  return fs.readFileSync(ROTEIRO, 'utf8');
}

test('TEL-RUNTIME-001: o roteiro existe e cobre os 9 cenários do aceite', () => {
  const texto = lerRoteiro();
  for (const cenario of CENARIOS) {
    assert.ok(texto.includes(cenario), `cenário ausente no roteiro: ${cenario}`);
  }
});

test('TEL-RUNTIME-001: o roteiro traz as colunas do recibo por cenário', () => {
  const texto = lerRoteiro();
  for (const coluna of COLUNAS_RECIBO) {
    assert.ok(texto.includes(coluna), `coluna do recibo ausente: ${coluna}`);
  }
});

test('TEL-RUNTIME-001: o roteiro traz a consulta de conferência e as seções honestas', () => {
  const texto = lerRoteiro();
  assert.match(texto, /from\s+calls/i, 'falta a consulta de conferência sobre `calls`');
  assert.match(texto, /Bloqueios/i, 'falta a seção Bloqueios');
  assert.match(texto, /Pendências/i, 'falta a seção Pendências/resíduos');
});

test('TEL-RUNTIME-001: o roteiro registra os 3 critérios de encerramento do achado', () => {
  const texto = lerRoteiro();
  assert.match(texto, /mesmo UUID/i, 'falta o critério "início/atendimento/fim no mesmo UUID"');
  assert.match(texto, /áudio correto|audio correto/i, 'falta o critério de áudio correto');
  assert.match(texto, /zero linhas novas presas/i, 'falta o critério de zero linhas presas');
});
