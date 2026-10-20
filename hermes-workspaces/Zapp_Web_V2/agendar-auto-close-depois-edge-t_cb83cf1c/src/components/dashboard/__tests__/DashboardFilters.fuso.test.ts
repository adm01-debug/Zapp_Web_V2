import { describe, expect, it } from 'vitest';

import { getDefaultFilters } from '@/components/dashboard/dashboardFilterDefaults';

/**
 * O recorte padrão do Dashboard é "hoje" e tem de ser o dia de calendário no **fuso do app**
 * (America/Sao_Paulo) — o mesmo que o servidor usa em `in_last_days` —, não o dia do navegador de
 * quem está olhando. Com o fuso do navegador, o mesmo "hoje" recortava janelas diferentes para
 * pessoas em fusos diferentes e não batia com os números contados no banco.
 *
 * Como o fuso é fixo, a expectativa vale em qualquer fuso de processo (inclusive o UTC do CI), e
 * por isso o teste falha se alguém voltar a usar `startOfDay`/`endOfDay` do date-fns aqui.
 *
 * Cenário: 30/09/2026 22:30 em São Paulo (= 01/10 01:30Z). São Paulo é UTC-3 o ano todo.
 */
const AS_2230_SP = new Date('2026-09-30T22:30:00-03:00');

describe('getDefaultFilters — recorte padrão no fuso do app', () => {
  it('"hoje" vai de 00:00 a 23:59:59.999 de São Paulo', () => {
    const { dateRange } = getDefaultFilters(AS_2230_SP);
    expect(dateRange.from.toISOString()).toBe('2026-09-30T03:00:00.000Z');
    expect(dateRange.to.toISOString()).toBe('2026-10-01T02:59:59.999Z');
  });

  it('às 22:30 em SP o recorte ainda é o dia 30/09 (não vira 01/10)', () => {
    const { dateRange } = getDefaultFilters(AS_2230_SP);
    const diaEmSP = (d: Date) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
    expect(diaEmSP(dateRange.from)).toBe('2026-09-30');
    expect(diaEmSP(dateRange.to)).toBe('2026-09-30');
  });

  it('o recorte cobre 24 h (fim - início = 86 399 999 ms)', () => {
    const { dateRange } = getDefaultFilters(AS_2230_SP);
    expect(dateRange.to.getTime() - dateRange.from.getTime()).toBe(86_399_999);
  });
});
