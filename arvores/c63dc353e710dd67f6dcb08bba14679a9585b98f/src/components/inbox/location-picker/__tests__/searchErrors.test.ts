import { describe, it, expect } from 'vitest';
import { searchFailureText, pausedNoticeText, type SearchFailureKind } from '../searchErrors';

/**
 * E24 — o texto de cada causa de falha mora aqui, não espalhado pelos componentes. O teste trava as
 * três coisas que já quebraram: (a) toda causa conhecida tem texto próprio (nunca o genérico),
 * (b) `cost_guard` é pausa e diz o que continua funcionando, e (c) nenhum texto cita o termo
 * digitado (E39: o que o operador escreve não sai do navegador).
 */
const CAUSAS: SearchFailureKind[] = ['network', 'timeout', 'http', 'rate_limited', 'cost_guard', 'not_found', 'aborted'];

describe('searchErrors (E24)', () => {
  it('toda causa conhecida tem texto próprio, não vazio', () => {
    for (const causa of CAUSAS) {
      const texto = searchFailureText(causa);
      expect(texto.trim().length, `texto vazio para ${causa}`).toBeGreaterThan(0);
      expect(texto).toMatch(/[.!]$/);
    }
  });

  it('429 e teto de custo dizem coisas diferentes (o operador precisa saber o que fazer)', () => {
    expect(searchFailureText('rate_limited')).toContain('Limite de buscas');
    expect(searchFailureText('cost_guard')).toContain('Enter continua');
    expect(searchFailureText('rate_limited')).not.toBe(searchFailureText('cost_guard'));
  });

  it('nenhum texto carrega o termo digitado (E39)', () => {
    for (const causa of CAUSAS) {
      expect(searchFailureText(causa).toLowerCase()).not.toContain('xbz');
      expect(searchFailureText(causa)).not.toContain('rua ');
    }
  });

  it('o aviso de pausa traz a contagem quando existe e não vira "Nada encontrado" quando não existe', () => {
    expect(pausedNoticeText('rate_limited', 45)).toContain('45 s');
    expect(pausedNoticeText('rate_limited', 45)).toContain('Enter continua');
    expect(pausedNoticeText('cost_guard', null)).toBe('Sugestões pausadas este mês (busca por Enter continua).');
    expect(pausedNoticeText(null, null)).not.toMatch(/Nada encontrado/i);
    expect(pausedNoticeText(null, null).trim().length).toBeGreaterThan(0);
  });
});
