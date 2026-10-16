import { describe, it, expect } from 'vitest';
import { appDayStart, appWeekStart, appWeekEnd, appDayKey } from '@/lib/localDay';
import { getDateRange } from '@/hooks/analytics/useGoalsDashboard';
import { goalPeriodRange } from '@/hooks/analytics/useGoalNotifications';
import { getPeriodStart } from '@/hooks/sla/useSLAMetrics';
import { historyWindowStart } from '@/hooks/sla/useSLAHistory';
import { csatPeriodStarts } from '@/hooks/business/useCSAT';

/**
 * Um fuso e uma semana para todos os painéis (15/10/2026).
 *
 * O defeito: cada painel cortava o dia/semana pelo relógio do aparelho e a semana começava no
 * domingo em Metas e na segunda no SLA — o mesmo atendente via números diferentes conforme o
 * painel e o fuso da máquina. Aqui provamos, com instantes perto da meia-noite UTC e na virada
 * de semana, que TODOS os painéis (Metas, notificações de meta, SLA, histórico de SLA e CSAT)
 * recortam no fuso do app (America/Sao_Paulo) e com a semana começando na SEGUNDA.
 */

const iso = (d: Date | null | undefined) => d?.toISOString();

/** 30/09/2026 22:30 em São Paulo = 01/10/2026 01:30Z — o dia UTC já virou, o dia do app não. */
const NOITE_SP = new Date('2026-09-30T22:30:00-03:00');
/** Domingo 04/10 23:30 SP (05/10 02:30Z): última hora da semana que começou em 28/09. */
const DOMINGO_NOITE = new Date('2026-10-04T23:30:00-03:00');
/** Segunda 05/10 00:30 SP: a semana virou. */
const SEGUNDA_MADRUGADA = new Date('2026-10-05T00:30:00-03:00');

/** Segunda 00:00 de São Paulo, como instante ISO. */
const SEGUNDA_28_09 = '2026-09-28T03:00:00.000Z';
const SEGUNDA_05_10 = '2026-10-05T03:00:00.000Z';

describe('um fuso e uma semana para todos os painéis', () => {
  it('a semana começa na SEGUNDA, no fuso do app, em todos os painéis', () => {
    expect(iso(appWeekStart(NOITE_SP))).toBe(SEGUNDA_28_09);
    expect(iso(getPeriodStart('week', NOITE_SP))).toBe(SEGUNDA_28_09); // SLA
    expect(iso(getDateRange('week', NOITE_SP).from)).toBe(SEGUNDA_28_09); // Metas
    expect(iso(goalPeriodRange('weekly', NOITE_SP).start)).toBe(SEGUNDA_28_09); // Notificações de meta
    expect(iso(appWeekEnd(NOITE_SP))).toBe('2026-10-05T02:59:59.999Z'); // domingo 23:59:59.999 SP
  });

  it('perto da meia-noite UTC o dia é o MESMO (30/09) em todos os painéis', () => {
    const inicioDoDia = '2026-09-30T03:00:00.000Z';

    expect(iso(appDayStart(0, NOITE_SP))).toBe(inicioDoDia);
    expect(iso(getPeriodStart('today', NOITE_SP))).toBe(inicioDoDia); // SLA
    expect(iso(getDateRange('today', NOITE_SP).from)).toBe(inicioDoDia); // Metas
    expect(iso(getDateRange('today', NOITE_SP).to)).toBe('2026-10-01T02:59:59.999Z');
    expect(iso(goalPeriodRange('daily', NOITE_SP).start)).toBe(inicioDoDia); // Notificações de meta

    // Janelas de N dias ancoradas no 00:00 de São Paulo (não em d*24h do relógio do aparelho).
    expect(iso(historyWindowStart('7d', NOITE_SP))).toBe('2026-09-24T03:00:00.000Z'); // 24/09 00:00 SP
    expect(iso(csatPeriodStarts(7, NOITE_SP).currentStart)).toBe('2026-09-24T03:00:00.000Z');
    expect(iso(csatPeriodStarts(7, NOITE_SP).previousStart)).toBe('2026-09-17T03:00:00.000Z');
  });

  it('o mesmo instante é 30/09 no app mesmo sendo 01/10 em UTC (a chave antiga errava)', () => {
    expect(NOITE_SP.toISOString().slice(0, 10)).toBe('2026-10-01');
    expect(appDayKey(NOITE_SP)).toBe('2026-09-30');
  });

  it('na virada da semana: o domingo fecha a semana de segunda e a segunda abre outra', () => {
    // Domingo 23:30 ainda pertence à semana que começou na segunda 28/09.
    expect(iso(appWeekStart(DOMINGO_NOITE))).toBe(SEGUNDA_28_09);
    expect(iso(getPeriodStart('week', DOMINGO_NOITE))).toBe(SEGUNDA_28_09);
    expect(iso(getDateRange('week', DOMINGO_NOITE).from)).toBe(SEGUNDA_28_09);

    // Segunda 00:30: todos os painéis viraram juntos.
    expect(iso(appWeekStart(SEGUNDA_MADRUGADA))).toBe(SEGUNDA_05_10);
    expect(iso(getPeriodStart('week', SEGUNDA_MADRUGADA))).toBe(SEGUNDA_05_10);
    expect(iso(getDateRange('week', SEGUNDA_MADRUGADA).from)).toBe(SEGUNDA_05_10);
    expect(iso(goalPeriodRange('weekly', SEGUNDA_MADRUGADA).start)).toBe(SEGUNDA_05_10);
  });

  it('o mês é o mês de calendário do app, o mesmo para todos os painéis', () => {
    expect(iso(getPeriodStart('month', NOITE_SP))).toBe('2026-09-01T03:00:00.000Z');
    expect(iso(getDateRange('month', NOITE_SP).from)).toBe('2026-09-01T03:00:00.000Z');
    expect(iso(getDateRange('month', NOITE_SP).to)).toBe('2026-10-01T02:59:59.999Z');
    expect(iso(goalPeriodRange('monthly', NOITE_SP).start)).toBe('2026-09-01T03:00:00.000Z');
  });
});
