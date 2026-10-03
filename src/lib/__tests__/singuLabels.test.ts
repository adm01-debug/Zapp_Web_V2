import { describe, expect, it } from 'vitest';
import {
  BUDGET_AUTHORITY_LABELS, DISC_LABELS, discLabel, enneagramLabel, labelOrRaw, summarizeMetaprograms,
  TEMPERAMENT_LABELS, VAK_LABELS,
} from '../singuLabels';

describe('singuLabels — dicionários', () => {
  it('valor conhecido devolve o rótulo pt-BR', () => {
    expect(discLabel('D')).toBe('D Dominante');
    expect(discLabel('D', 'DI')).toBe('D Dominante (DI)');
    expect(discLabel('X')).toBe('X');
    expect(discLabel(null)).toBeNull();
    expect(labelOrRaw(VAK_LABELS, 'visual')).toBe('Visual');
    expect(labelOrRaw(VAK_LABELS, 'auditivo')).toBe('Auditivo');
    expect(labelOrRaw(VAK_LABELS, 'K')).toBe('Cinestésico');
    expect(labelOrRaw(TEMPERAMENT_LABELS, 'sanguine')).toBe('Sanguíneo');
    expect(labelOrRaw(TEMPERAMENT_LABELS, 'melancolico')).toBe('Melancólico');
    expect(labelOrRaw(BUDGET_AUTHORITY_LABELS, 'aprovador_final')).toBe('Aprovador final');
  });

  it('valor desconhecido devolve o valor cru, nunca quebra', () => {
    expect(labelOrRaw(VAK_LABELS, 'olfativo')).toBe('olfativo');
    expect(labelOrRaw(BUDGET_AUTHORITY_LABELS, 'texto_livre')).toBe('texto_livre');
    expect(labelOrRaw(TEMPERAMENT_LABELS, 'xyz')).toBe('xyz');
  });

  it('null/vazio devolve null', () => {
    expect(labelOrRaw(VAK_LABELS, null)).toBeNull();
    expect(labelOrRaw(VAK_LABELS, '')).toBeNull();
  });

  it('DISC expõe nome e descrição', () => {
    expect(DISC_LABELS.D.name).toBe('Dominante');
    expect(DISC_LABELS.C.name).toBe('Conforme');
  });

  it('enneagramLabel monta "Tipo N – Nome" com asa opcional', () => {
    expect(enneagramLabel(3)).toBe('Tipo 3 – O Realizador');
    expect(enneagramLabel(3, 2)).toBe('Tipo 3 – O Realizador (asa 2)');
    expect(enneagramLabel(9)).toBe('Tipo 9 – O Pacificador');
    expect(enneagramLabel(null)).toBeNull();
    expect(enneagramLabel(10)).toBe('Tipo 10');
  });
});

describe('summarizeMetaprograms', () => {
  it('produz até 2 leituras na ordem dos eixos', () => {
    expect(summarizeMetaprograms({ toward: 80, away_from: 20, proactive: 90, reactive: 10 }))
      .toBe('Foco em resultados, Pró-ativo');
  });

  it('corta no segundo eixo quando há 3 eixos decisivos', () => {
    expect(summarizeMetaprograms({
      toward: 80, away_from: 20, internal: 70, external: 30, detail: 90, global: 10,
    })).toBe('Foco em resultados, Referência interna');
  });

  it('empate não emite leitura', () => {
    expect(summarizeMetaprograms({ toward: 50, away_from: 50 })).toBeNull();
  });

  it('lado vencedor de cada eixo lê corretamente', () => {
    expect(summarizeMetaprograms({ away_from: 90, toward: 10 })).toBe('Foco em evitar problemas');
    expect(summarizeMetaprograms({ external: 90, internal: 10 })).toBe('Referência externa');
    expect(summarizeMetaprograms({ procedures: 90, options: 10 })).toBe('Segue procedimentos');
    expect(summarizeMetaprograms({ reactive: 90, proactive: 10 })).toBe('Reativo');
    expect(summarizeMetaprograms({ detail: 90, global: 10 })).toBe('Detalhista');
  });

  it('eixo com um só score preenchido emite a leitura desse lado', () => {
    expect(summarizeMetaprograms({ internal: 80 })).toBe('Referência interna');
    expect(summarizeMetaprograms({ global: 60, detail: null })).toBe('Visão global');
  });

  it('tudo nulo devolve null', () => {
    expect(summarizeMetaprograms({})).toBeNull();
    expect(summarizeMetaprograms(null)).toBeNull();
    expect(summarizeMetaprograms(undefined)).toBeNull();
  });
});
