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

// ─── T96 (SL-019) — o recibo precisa coletar o que o aceite exige ───
//
// O aceite do T96 e o critério 1 do TEL-RUNTIME-001 pedem, por cenário, a linha real
// com `id, status, end_reason, talk_seconds, provider_call_id`. O recibo era a peça
// que a execução preenche, e ele não pedia o `provider_call_id`: a homologação seria
// feita e o aceite não teria como ser conferido depois — retrabalho com o agente ao
// telefone. Estes dois testes travam isso (vermelho antes, verde depois).

/** Campos que o aceite do T96 exige em cada linha real de `calls`. */
const CAMPOS_DO_ACEITE_T96 = [
  'id',
  'status',
  'end_reason',
  'talk_seconds',
  'provider_call_id',
];

/** Colunas do CABEÇALHO da tabela que a execução preenche (não qualquer menção no texto). */
function colunasDaTabelaDeRecibos(texto) {
  const linhas = texto.split(/\r?\n/);
  const inicio = linhas.findIndex((l) => /^##\s+Tabela de recibos/i.test(l));
  assert.ok(inicio >= 0, 'não achei a seção "Tabela de recibos" no roteiro');
  for (let i = inicio + 1; i < linhas.length; i += 1) {
    const linha = linhas[i].trim();
    if (/^##\s/.test(linha)) break; // fim da seção sem tabela
    if (linha.startsWith('|')) {
      return linha.split('|').map((celula) => celula.trim()).filter((celula) => celula.length > 0);
    }
  }
  assert.fail('não achei a tabela de recibos abaixo da seção');
}

test('T96: o cabeçalho do recibo coleta os campos do aceite, inclusive `provider_call_id`', () => {
  const colunas = colunasDaTabelaDeRecibos(lerRoteiro());
  for (const campo of CAMPOS_DO_ACEITE_T96) {
    assert.ok(
      colunas.includes(campo),
      `campo do aceite ausente no cabeçalho do recibo: ${campo} (cabeçalho: ${colunas.join(' | ')})`,
    );
  }
});

test('T96: o filtro da consulta de recibo usa o UUID do agente (a coluna `agent_id` é uuid)', () => {
  const consulta = /where\s+agent_id\s*=\s*'([^']*)'/i.exec(lerRoteiro());
  assert.ok(consulta, 'falta o filtro `where agent_id = ...` na consulta de recibo');
  assert.match(
    consulta[1],
    /uuid/i,
    `o filtro casa agent_id (uuid) com "${consulta[1]}": um nome de perfil ali não roda na consulta`,
  );
});
