import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CHECKS_E5,
  ESPECIFICACAO_E2,
  avaliarAxe,
  avaliarE2,
  avaliarE3,
  avaliarLinhaE2,
  prepararE3,
} from './especificacao.mjs';
import { deltaE, dentroDaTolerancia, medir, resumo, rgbDoCss, triplaHslParaRgb } from './regras.mjs';

// Prova do NÚCLEO PURO dos scripts de QA da Telefonia (T81-T84). Roda offline
// (`node --test qa/tel/lib/especificacao.unit.mjs`): nenhum browser, nenhuma
// fixture. Os números esperados vêm de FORA deste código — do plano
// (contentX=278±6 do T33, painel 408±8 do T55/T77, ΔE≤2 do T82) e da própria
// colorimetria (branco × preto = ΔE 100 em CIE76).

describe('limite de tolerância', () => {
  it('aceita o limite exato e reprova um pixel além', () => {
    // 278 ± 6: o limite é inclusivo, como o plano escreve ("278 ±6").
    assert.equal(dentroDaTolerancia(278, 278, 6), true);
    assert.equal(dentroDaTolerancia(284, 278, 6), true);
    assert.equal(dentroDaTolerancia(272, 278, 6), true);
    assert.equal(dentroDaTolerancia(285, 278, 6), false, '285 está a 7 do alvo');
    assert.equal(dentroDaTolerancia(271, 278, 6), false, '271 está a 7 do alvo');
  });

  it('nunca aprova valor não medido', () => {
    for (const v of [NaN, undefined, null, Infinity, '278']) {
      assert.equal(dentroDaTolerancia(v, 278, 6), false, `${String(v)} não é medida`);
    }
    const c = medir('contentX', NaN, 278, 6);
    assert.equal(c.ok, false);
    assert.equal(c.motivo, 'não medido');
  });
});

describe('geometria E.2', () => {
  const medido = (valor) => ({ valor });

  it('aprova a tela conforme e reprova as duas bordas', () => {
    assert.equal(avaliarLinhaE2('contentX', medido(278)).ok, true);
    assert.equal(avaliarLinhaE2('contentX', medido(284)).ok, true);
    assert.equal(avaliarLinhaE2('contentX', medido(285)).ok, false);
    assert.equal(avaliarLinhaE2('contentX', medido(271)).ok, false);
  });

  it('a linha reprovada diz o número medido e o alvo', () => {
    const c = avaliarLinhaE2('contentX', medido(300));
    assert.equal(c.valor, 300);
    assert.equal(c.alvo, 278);
    assert.match(c.motivo, /\|300 - 278\| > 6/);
  });

  it('eixo ausente da medição reprova — não vira verde mudo', () => {
    const checks = avaliarE2({ contentX: { valor: 278 } });
    assert.equal(checks.length, ESPECIFICACAO_E2.length);
    const ausentes = checks.filter((c) => c.motivo === 'não medido').map((c) => c.eixo);
    assert.ok(ausentes.includes('panel'), 'painel não medido tem de reprovar');
    assert.equal(checks.find((c) => c.eixo === 'contentX').ok, true);
  });

  it('piso (min) e teto (max) não são a mesma conta', () => {
    // rows: piso de 44 por linha; key: 46 ± 2; scrollW/innerW: teto 0.
    assert.equal(avaliarLinhaE2('rows', { valor: 44 }).ok, true);
    assert.equal(avaliarLinhaE2('rows', { valor: 43 }).ok, false);
    assert.equal(avaliarLinhaE2('key', { valor: 48 }).ok, true);
    assert.equal(avaliarLinhaE2('key', { valor: 48.1 }).ok, false);
    assert.equal(avaliarLinhaE2('scrollW/innerW', { valor: 0 }).ok, true);
    assert.equal(avaliarLinhaE2('scrollW/innerW', { valor: 17 }).ok, false);
  });

  it('eixo condicional ausente diz por quê, em vez de reprovar o vazio', () => {
    const semLinhas = avaliarLinhaE2('rows', { valor: null, skip: true, motivo: 'histórico vazio: nenhuma linha para medir' });
    assert.equal(semLinhas.ok, true);
    assert.equal(semLinhas.motivo, 'histórico vazio: nenhuma linha para medir');
  });
});

describe('cor E.3 (ΔE CIE76 ≤ 2)', () => {
  it('a mesma cor tem ΔE 0 e o extremo branco×preto dá 100', () => {
    assert.equal(deltaE([255, 255, 255], [255, 255, 255]), 0);
    assert.ok(Math.abs(deltaE([255, 255, 255], [0, 0, 0]) - 100) < 0.5, 'branco × preto = 100 em CIE76');
  });

  it('lê o token no formato dos tokens.css e no formato rgb()', () => {
    // --card: 0 0% 100% (styles/tokens.css) = branco
    assert.deepEqual(triplaHslParaRgb('0 0% 100%'), [255, 255, 255]);
    // --success (tema claro): 160 70% 27% = rgb(21, 117, 85)
    assert.deepEqual(triplaHslParaRgb('160 70% 27%'), [21, 117, 85]);
    assert.deepEqual(rgbDoCss('rgb(21, 117, 85)'), [21, 117, 85]);
    assert.deepEqual(rgbDoCss('rgba(21, 117, 85, 0.5)'), [21, 117, 85]);
    assert.equal(rgbDoCss('hsl(160 70% 27%)'), null, 'rgb() não aceita hsl() — quem trata é o token');
  });

  it('aprova a pintura fiel ao token e reprova a que fugiu', () => {
    const fiel = prepararE3({ 'cta/success': { pintado: 'rgb(21, 117, 85)', token: '160 70% 27%' } });
    assert.equal(avaliarE3(fiel).find((c) => c.eixo === 'cta/success').ok, true);

    const fugiu = prepararE3({ 'cta/success': { pintado: 'rgb(56, 132, 255)', token: '160 70% 27%' } });
    const c = avaliarE3(fugiu).find((x) => x.eixo === 'cta/success');
    assert.equal(c.ok, false);
    assert.ok(c.valor > 2, `ΔE medido ${c.valor} tinha de passar de 2`);
  });

  it('token ou pintura ausente reprova, com motivo', () => {
    const semToken = avaliarE3(prepararE3({ 'cta/success': { pintado: 'rgb(21, 117, 92)', token: '' } }));
    const c = semToken.find((x) => x.eixo === 'cta/success');
    assert.equal(c.ok, false);
    assert.equal(c.motivo, 'cor não medida');
  });
});

describe('relatório agregado', () => {
  it('conta os aprovados, lista os reprovados e conta os erros de console', () => {
    const checks = [medir('a', 1, 1, 0), medir('b', 2, 1, 0), medir('c', 10, 10, 0)];
    const r = resumo('teste', checks, ['erro 1', 'erro 2']);
    assert.deepEqual(r.fail, ['b']);
    assert.equal(r.ok, 2);
    assert.equal(r.total, 3);
    assert.equal(r.consoleErrors, 2);
  });

  it('erro de console sozinho não aprova: o aceite exige os dois zerados', () => {
    const r = resumo('teste', [medir('a', 1, 1, 0)], ['boom']);
    assert.deepEqual(r.fail, []);
    assert.equal(r.consoleErrors, 1);
  });

  it('skip explícito não entra na contagem de aprovados', () => {
    const r = resumo('teste', [medir('a', 1, 1, 0), medir('b', NaN, 1, 0, { skip: true, motivo: 'não aplicável' })]);
    assert.deepEqual(r.fail, []);
    assert.deepEqual(r.skip, ['b']);
    assert.equal(r.ok, 1);
    assert.equal(r.skipped, 1);
    assert.equal(r.total, 2);
  });
});

describe('contrato do E.5', () => {
  it('são exatamente os 20 passos do T83, sem repetição', () => {
    assert.equal(CHECKS_E5.length, 20);
    assert.equal(new Set(CHECKS_E5).size, 20);
    assert.deepEqual([...CHECKS_E5].slice(-2), ['console sem error', 'sem overflow horizontal']);
  });

  it('só serious/critical bloqueiam o axe', () => {
    const r = avaliarAxe([
      { id: 'button-name', impact: 'serious', nodes: [{}, {}] },
      { id: 'region', impact: 'moderate', nodes: [{}] },
      { id: 'color-contrast', impact: 'critical', nodes: [{}] },
    ]);
    assert.deepEqual(r.bloqueantes.map((v) => v.id), ['button-name', 'color-contrast']);
    assert.equal(r.total, 3);
  });
});
