import assert from 'node:assert/strict';
import test from 'node:test';

import {
  etapaIdDoTitulo,
  secao,
  temTelaVisual,
  verificarCorpo,
} from './check-talkx-pr-body.mjs';

const ETAPA_SEM_TELA = {
  id: 'X005',
  titulo: 'Exigir a definição de pronto no corpo da PR de cada etapa do V4',
  tela: '—',
  ddl: false,
  edge: false,
  fecha: [],
};

const ETAPA_COM_TELA = {
  id: 'X006',
  titulo: 'Corrigir unidade (ms × s) e efeito da velocidade no modal "Editar limites"',
  tela: '12',
  ddl: false,
  edge: false,
  fecha: ['T12-058', 'T12-011'],
};

const ETAPA_COM_DDL = {
  id: 'X009',
  titulo: 'Aceitar rascunho sem mensagem e gravar passo e responsável na RPC de rascunho',
  tela: '08',
  ddl: true,
  edge: false,
  fecha: ['T08-064'],
};

const ETAPA_COM_EDGE = {
  id: 'X011',
  titulo: 'Processar a campanha em lotes com orçamento de tempo no `talkx-send`',
  tela: 'motor',
  ddl: false,
  edge: true,
  fecha: ['CAP-007'],
};

function corpoCompleto(etapa, { evidencia, print, banco, edge } = {}) {
  const sec = (nome, valor) => `## ${nome}\n${valor}`;
  const partes = [
    sec('Etapa', `${etapa.id} · ${etapa.titulo}`),
    sec('Fecha', (etapa.fecha ?? []).join(', ') || '—'),
    sec('Evidência', evidencia ?? 'teste X falha antes e passa agora'),
  ];
  if (temTelaVisual(etapa.tela)) partes.push(sec('Print', print ?? 'regua-visual-talkx'));
  partes.push(sec('Banco', banco ?? (etapa.ddl ? '20261001_foo.sql — aplicada no ledger' : 'sem DDL')));
  partes.push(sec('Edge', edge ?? (etapa.edge ? 'run 123456 do deploy-functions.yml' : 'sem edge')));
  return partes.join('\n\n');
}

test('título sem (X<NNN>) → verificador não se aplica', () => {
  const r = verificarCorpo({ titulo: 'fix(talkx): ajusta coisa', corpo: '', etapa: null });
  assert.equal(r.aplica, false);
  assert.deepEqual(r.violacoes, []);
});

test('extrai o id da etapa do título', () => {
  assert.equal(etapaIdDoTitulo('fix(talkx): ... (X006)'), 'X006');
  assert.equal(etapaIdDoTitulo('docs: sem etapa'), null);
});

test('corpo sem ## Evidência → falha', () => {
  const corpo = [
    '## Etapa\nX005 · ' + ETAPA_SEM_TELA.titulo,
    '## Fecha\n—',
    '## Banco\nsem DDL',
    '## Edge\nsem edge',
  ].join('\n\n');
  const r = verificarCorpo({ titulo: 'test(talkx): ... (X005)', corpo, etapa: ETAPA_SEM_TELA });
  assert.equal(r.aplica, true);
  assert.ok(r.violacoes.some((v) => v.includes('Evidência')), `violações: ${r.violacoes}`);
});

test('etapa com DDL e ## Banco vazio → falha', () => {
  const corpo = corpoCompleto(ETAPA_COM_DDL, { banco: '' });
  const r = verificarCorpo({ titulo: 'fix(talkx): ... (X009)', corpo, etapa: ETAPA_COM_DDL });
  assert.ok(r.violacoes.some((v) => v.includes('## Banco')), `violações: ${r.violacoes}`);
});

test('etapa com DDL e ## Banco "sem DDL" → falha', () => {
  const corpo = corpoCompleto(ETAPA_COM_DDL, { banco: 'sem DDL' });
  const r = verificarCorpo({ titulo: 'fix(talkx): ... (X009)', corpo, etapa: ETAPA_COM_DDL });
  assert.ok(r.violacoes.some((v) => v.includes('sem DDL')), `violações: ${r.violacoes}`);
});

test('etapa com tela e sem ## Print → falha', () => {
  const corpo = [
    '## Etapa\nX006 · ' + ETAPA_COM_TELA.titulo,
    '## Fecha\nT12-058, T12-011',
    '## Evidência\nteste X',
    '## Banco\nsem DDL',
    '## Edge\nsem edge',
  ].join('\n\n');
  const r = verificarCorpo({ titulo: 'fix(talkx): ... (X006)', corpo, etapa: ETAPA_COM_TELA });
  assert.ok(r.violacoes.some((v) => v.includes('## Print')), `violações: ${r.violacoes}`);
});

test('## Fecha sem um dos IDs da etapa → falha', () => {
  const corpo = corpoCompleto(ETAPA_COM_TELA, {}).replace('T12-058, T12-011', 'T12-058');
  const r = verificarCorpo({ titulo: 'fix(talkx): ... (X006)', corpo, etapa: ETAPA_COM_TELA });
  assert.ok(r.violacoes.some((v) => v.includes('T12-011')), `violações: ${r.violacoes}`);
});

test('etapa com edge e ## Edge "sem edge" → falha', () => {
  const corpo = corpoCompleto(ETAPA_COM_EDGE, { edge: 'sem edge' });
  const r = verificarCorpo({ titulo: 'feat(talkx): ... (X011)', corpo, etapa: ETAPA_COM_EDGE });
  assert.ok(r.violacoes.some((v) => v.includes('## Edge')), `violações: ${r.violacoes}`);
});

test('título (X999) com etapa inexistente → falha', () => {
  const r = verificarCorpo({ titulo: 'fix: ... (X999)', corpo: '', etapa: null });
  assert.equal(r.aplica, true);
  assert.ok(r.violacoes.some((v) => v.includes('não existe')), `violações: ${r.violacoes}`);
});

test('PR de etapa completa → passa', () => {
  for (const etapa of [ETAPA_SEM_TELA, ETAPA_COM_TELA, ETAPA_COM_DDL, ETAPA_COM_EDGE]) {
    const corpo = corpoCompleto(etapa);
    const r = verificarCorpo({ titulo: `feat(talkx): ... (${etapa.id})`, corpo, etapa });
    assert.equal(r.aplica, true);
    assert.deepEqual(r.violacoes, [], `etapa ${etapa.id}: ${r.violacoes.join('; ')}`);
  }
});

test('secao() extrai o conteúdo sob o cabeçalho e ignora o seguinte', () => {
  const corpo = '## Banco\nsem DDL\n\n## Edge\nsem edge';
  assert.equal(secao(corpo, 'Banco'), 'sem DDL');
  assert.equal(secao(corpo, 'Edge'), 'sem edge');
  assert.equal(secao(corpo, 'Print'), null);
});

test('temTelaVisual distingue tela visual de motor/dados/—', () => {
  assert.equal(temTelaVisual('12'), true);
  assert.equal(temTelaVisual('01–17'), true);
  assert.equal(temTelaVisual('motor'), false);
  assert.equal(temTelaVisual('dados'), false);
  assert.equal(temTelaVisual('—'), false);
});
