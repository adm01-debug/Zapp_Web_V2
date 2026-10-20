import { describe, expect, it } from 'vitest';

import {
  APP_TIMEZONE,
  appDayEnd,
  appDayEndOfKey,
  appDayEndOfLocalDate,
  appDayKey,
  appDayKeyLabel,
  appDayStart,
  appDayStartOfLocalDate,
  appMonthEnd,
  appMonthStart,
  appShiftDayKey,
  appWeekEnd,
  appWeekStart,
} from '@/lib/localDay';

/**
 * Recortes por dia de calendário ancorados em America/Sao_Paulo — o fuso do servidor
 * (`in_last_days`/`not_in_last_days`, `conversation_closure_day`). Como o fuso é FIXO, estas
 * expectativas valem em qualquer fuso de processo, inclusive no UTC do CI: é exatamente a prova
 * de que o recorte não depende de quem está olhando.
 *
 * Cenário: 30/09/2026 22:30 em São Paulo (= 01/10 01:30Z). São Paulo é UTC-3 o ano todo.
 * 30/09/2026 é uma quarta-feira; a semana (domingo primeiro, como no ptBR do date-fns) vai de
 * domingo 27/09 a sábado 03/10.
 */
const AS_2230_SP = new Date('2026-09-30T22:30:00-03:00');

describe('recortes por dia de calendário no fuso do app', () => {
  it('APP_TIMEZONE é o mesmo fuso que o servidor usa', () => {
    expect(APP_TIMEZONE).toBe('America/Sao_Paulo');
  });

  it('appDayStart/appDayEnd recortam 22:30 em SP como 30/09 (não 01/10)', () => {
    expect(appDayStart(0, AS_2230_SP).toISOString()).toBe('2026-09-30T03:00:00.000Z');
    expect(appDayEnd(0, AS_2230_SP).toISOString()).toBe('2026-10-01T02:59:59.999Z');
  });

  it('"7 dias" cobre 7 dias de calendário (hoje + 6 atrás), não 168 h corridas', () => {
    expect(appDayStart(6, AS_2230_SP).toISOString()).toBe('2026-09-24T03:00:00.000Z');
    // 168 h corridas cairiam em 24/09 01:30Z, que em SP ainda é 23/09 — o 8º dia de calendário.
    expect(appDayKey('2026-09-24T01:30:00.000Z')).toBe('2026-09-23');
  });

  it('appDayKey devolve o dia em SP, não o dia UTC', () => {
    expect(appDayKey(AS_2230_SP)).toBe('2026-09-30');
    expect(appDayKey('2026-10-01T01:30:00.000Z')).toBe('2026-09-30');
  });

  it('appDayKeyLabel devolve dd/MM a partir da chave', () => {
    expect(appDayKeyLabel('2026-09-24')).toBe('24/09');
    expect(appDayKeyLabel('2026-10-01')).toBe('01/10');
  });

  it('appShiftDayKey anda em dias de calendário, inclusive em viradas', () => {
    expect(appShiftDayKey('2026-09-30', 1)).toBe('2026-10-01');
    expect(appShiftDayKey('2026-01-01', -1)).toBe('2025-12-31');
    expect(appShiftDayKey('2026-09-30', -6)).toBe('2026-09-24');
  });

  it('appDayEndOfKey fecha o dia em 23:59:59.999 em SP', () => {
    expect(appDayEndOfKey('2026-09-30').toISOString()).toBe('2026-10-01T02:59:59.999Z');
  });

  it('appDayStartOfLocalDate usa o dia do seletor, com o recorte no fuso do app', () => {
    // O calendário da tela devolve meia-noite no relógio do usuário.
    const escolhidoNoSeletor = new Date(2026, 8, 30);
    expect(appDayStartOfLocalDate(escolhidoNoSeletor).toISOString()).toBe('2026-09-30T03:00:00.000Z');
    expect(appDayEndOfLocalDate(escolhidoNoSeletor).toISOString()).toBe('2026-10-01T02:59:59.999Z');
  });

  it('appWeekStart/appWeekEnd vão de domingo a sábado, como o ptBR do date-fns', () => {
    expect(appWeekStart(AS_2230_SP).toISOString()).toBe('2026-09-27T03:00:00.000Z');
    expect(appWeekEnd(AS_2230_SP).toISOString()).toBe('2026-10-04T02:59:59.999Z');
  });

  it('appMonthStart/appMonthEnd cobrem o mês corrente em SP', () => {
    expect(appMonthStart(AS_2230_SP).toISOString()).toBe('2026-09-01T03:00:00.000Z');
    expect(appMonthEnd(AS_2230_SP).toISOString()).toBe('2026-10-01T02:59:59.999Z');
  });
});
