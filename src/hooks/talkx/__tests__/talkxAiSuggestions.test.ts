import { describe, it, expect } from 'vitest';

import {
  SUGESTAO_MAX_CONDICOES,
  SUGESTAO_MAX_GRUPOS,
  SUGESTAO_MAX_PEDIDO,
  pedidoDeSegmentoValido,
  regraParaExplicar,
  sugestaoParaRegras,
} from '../talkxAiSuggestions';

/**
 * X076/IA-161 — os dois kinds da `talkx-ai` que nao tinham tela.
 *
 * O que importa provar aqui e a REJEICAO: a IA pode devolver campo inventado,
 * operador que o tipo do campo nao aceita ou condicao sem valor. Aplicar meia
 * regra e pior que nao aplicar nada, porque o segmento passa a filtrar errado
 * em silencio. Cada teste A monta o defeito, B prova o contrato.
 */
describe('sugestaoParaRegras', () => {
  it('A: saida fora do formato nao vira regra', () => {
    expect(sugestaoParaRegras(null).ok).toBe(false);
    expect(sugestaoParaRegras('texto solto').ok).toBe(false);
    expect(sugestaoParaRegras([]).ok).toBe(false);
    expect(sugestaoParaRegras({}).ok).toBe(false);
  });

  it('A: campo que nao existe no catalogo e descartado, nao aplicado', () => {
    const r = sugestaoParaRegras({
      groups: [{ match: 'and', rules: [{ field: 'cpf_do_cliente', op: 'eq', value: 'x' }] }],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain('cpf_do_cliente');
  });

  it('A: operador invalido para o tipo do campo e recusado (uuid nao aceita contem)', () => {
    const r = sugestaoParaRegras({
      groups: [{ match: 'and', rules: [{ field: 'assigned_to', op: 'contains', value: 'x' }] }],
    });
    expect(r.ok).toBe(false);
  });

  it('A: condicao sem valor nao entra (filtro que parece existir e nao recorta)', () => {
    const r = sugestaoParaRegras({
      groups: [{ match: 'and', rules: [{ field: 'city', op: 'eq', value: '   ' }] }],
    });
    expect(r.ok).toBe(false);
  });

  it('A: mais grupos que o teto e recusado inteiro, nunca truncado', () => {
    const groups = Array.from({ length: SUGESTAO_MAX_GRUPOS + 1 }, (_, i) => ({
      match: 'and',
      rules: [{ field: 'city', op: 'eq', value: `cidade-${i}` }],
    }));
    expect(sugestaoParaRegras({ groups }).ok).toBe(false);
  });

  it('A: mais condicoes que o teto e recusado inteiro', () => {
    const rules = Array.from({ length: SUGESTAO_MAX_CONDICOES + 1 }, () => ({ field: 'city', op: 'eq', value: 'sp' }));
    expect(sugestaoParaRegras({ groups: [{ match: 'and', rules }] }).ok).toBe(false);
  });

  it('B: sugestao valida vira SegmentRules com ids novos e join ou', () => {
    const r = sugestaoParaRegras({
      groups: [
        { match: 'and', rules: [{ field: 'tags', op: 'contains', value: 'vip' }, { field: 'city', op: 'eq', value: 'São Paulo' }] },
        { match: 'or', rules: [{ field: 'lead_score', op: 'gte', value: 70 }] },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sugestao.rules.groups).toHaveLength(2);
    expect(r.sugestao.rules.join).toBe('or');
    expect(r.sugestao.condicoes).toBe(3);
    expect(r.sugestao.descartadas).toEqual([]);
    const [g1, g2] = r.sugestao.rules.groups;
    expect(g1.match).toBe('and');
    expect(g2.match).toBe('or');
    // ids sao gerados no cliente, nao vem do modelo
    expect(g1.id).toBeTruthy();
    expect(g1.rules[0].id).toBeTruthy();
    expect(g1.rules[0].id).not.toBe(g1.rules[1].id);
  });

  it('B: value numerico vira texto, que e o que o banco guarda', () => {
    const r = sugestaoParaRegras({ groups: [{ match: 'and', rules: [{ field: 'lead_score', op: 'gte', value: 70 }] }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sugestao.rules.groups[0].rules[0].value).toBe('70');
  });

  it('B: operador sem valor (is_empty) passa sem exigir valor', () => {
    const r = sugestaoParaRegras({ groups: [{ match: 'and', rules: [{ field: 'city', op: 'is_empty' }] }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sugestao.rules.groups[0].rules[0].value).toBe('');
  });

  it('B: aceita `rules` na raiz (modelo esquece o envolucro de groups)', () => {
    const r = sugestaoParaRegras({ rules: [{ field: 'company', op: 'contains', value: 'ltda' }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sugestao.rules.groups).toHaveLength(1);
    expect(r.sugestao.rules.groups[0].match).toBe('and');
  });

  it('C: mistura de valida e invalida mantem a valida e lista o descarte', () => {
    const r = sugestaoParaRegras({
      groups: [{ match: 'and', rules: [
        { field: 'city', op: 'eq', value: 'Rio' },
        { field: 'campo_inventado', op: 'eq', value: 'x' },
      ] }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sugestao.condicoes).toBe(1);
    expect(r.sugestao.descartadas).toHaveLength(1);
    expect(r.sugestao.descartadas[0]).toContain('campo_inventado');
  });
});

describe('regraParaExplicar', () => {
  it('B: monta a entrada calculada do insight_text sem dado pessoal', () => {
    const regra = regraParaExplicar({
      type: 'timing',
      title: 'Melhor horário',
      description: 'Terças às 10h respondem mais.',
      priority: 'high',
      meta: { hour: 10, replyRate: 0.31 },
    });
    expect(regra).toMatchObject({ tipo: 'timing', prioridade: 'high', dados: { hour: 10, replyRate: 0.31 } });
  });

  it('B: sem meta nao inclui a chave dados', () => {
    const regra = regraParaExplicar({ type: 'links', title: 't', description: 'd', priority: 'low' });
    expect('dados' in regra).toBe(false);
  });
});

describe('pedidoDeSegmentoValido', () => {
  it('A: pedido vazio e recusado antes da chamada paga', () => {
    expect(pedidoDeSegmentoValido('   ')).toBeTruthy();
  });

  it('A: pedido acima do teto da edge e recusado no cliente', () => {
    expect(pedidoDeSegmentoValido('a'.repeat(SUGESTAO_MAX_PEDIDO + 1))).toBeTruthy();
  });

  it('B: pedido normal passa', () => {
    expect(pedidoDeSegmentoValido('clientes de São Paulo sem compra há 30 dias')).toBeNull();
  });
});
