import { describe, expect, it } from 'vitest';

import { periodStartIso } from '@/pages/admin-telemetria/telemetryUtils';

/**
 * "7d" = 7 DIAS DE CALENDARIO (hoje + 6 anteriores) ancorados em America/Sao_Paulo — o mesmo
 * recorte que o servidor aplica em `in_last_days`/`not_in_last_days`
 * (supabase/migrations/20261002391230_talkx_audience_rpc.sql) e o mesmo recorte do R3-06 na
 * timeline do Historico. Antes o `else` devolvia 604_800_000 (168 h corridas): as 22h30 em Sao
 * Paulo a janela alcancava o 8o dia de calendario.
 *
 * Como o fuso agora e FIXO (PERIOD_TIMEZONE), estes testes valem em qualquer fuso de processo —
 * inclusive no UTC do CI — e por isso nao existe mais camada pulada por `TZ`.
 *
 * Cenario dos testes: 30/09/2026 22:30 em Sao Paulo (= 01/10 01:30Z).
 */
const AS_2230_SP = new Date('2026-09-30T22:30:00-03:00');

/** Chave `yyyy-MM-dd` do dia de CALENDARIO em Sao Paulo — independente do fuso do processo. */
const diaSP = (valor: string | Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(typeof valor === 'string' ? new Date(valor) : valor);

/** Distancia em dias de CALENDARIO entre duas chaves `yyyy-MM-dd` (aritmetica de chave, sem hora). */
const diasEntre = (de: string, ate: string) => (Date.parse(ate) - Date.parse(de)) / 86_400_000;

describe('periodStartIso — 7d em dias de calendario ancorados em America/Sao_Paulo', () => {
  it('7d comeca na virada do dia em Sao Paulo (00:00 SP = 03:00Z)', () => {
    // 22:30 em SP ainda e 30/09, entao o 7d tem de comecar em 24/09 — e nao em 168 h corridas
    // (que alcancariam o 8o dia).
    expect(periodStartIso('7d', AS_2230_SP)).toBe('2026-09-24T03:00:00.000Z');
    expect(diaSP(periodStartIso('7d', AS_2230_SP))).toBe('2026-09-24');
  });

  it('7d cobre exatamente 7 dias de calendario, hoje incluso (6 dias atras)', () => {
    const inicio = periodStartIso('7d', AS_2230_SP);
    expect(diasEntre(diaSP(inicio), diaSP(AS_2230_SP))).toBe(6);
  });

  it('7d nao alcanca o 8o dia de calendario (o defeito das 22h30 em SP)', () => {
    const inicio = diaSP(periodStartIso('7d', AS_2230_SP));
    const oitavoDiaAtras = diaSP(new Date(AS_2230_SP.getTime() - 7 * 86_400_000));
    expect(inicio).not.toBe(oitavoDiaAtras);
  });

  it('um minuto na virada da meia-noite (SP) move o inicio em um dia inteiro', () => {
    // Prova comportamental de calendario: uma janela corrida nao mudaria de dia assim.
    const meiaNoiteSP = new Date('2026-10-01T00:00:00-03:00');
    const antes = new Date(meiaNoiteSP.getTime() - 60_000);
    const depois = new Date(meiaNoiteSP.getTime() + 60_000);
    const dAntes = diaSP(periodStartIso('7d', antes));
    const dDepois = diaSP(periodStartIso('7d', depois));
    expect(diasEntre(dAntes, dDepois)).toBe(1);
  });

  it('7d de manha comeca no mesmo 7o dia de calendario (25/09 00:00 em SP)', () => {
    expect(periodStartIso('7d', new Date('2026-10-01T09:00:00-03:00'))).toBe(
      '2026-09-25T03:00:00.000Z'
    );
  });

  it('1h/6h/24h continuam janelas corridas (o rotulo promete horas)', () => {
    expect(periodStartIso('1h', AS_2230_SP)).toBe(
      new Date(AS_2230_SP.getTime() - 3_600_000).toISOString()
    );
    expect(periodStartIso('6h', AS_2230_SP)).toBe(
      new Date(AS_2230_SP.getTime() - 6 * 3_600_000).toISOString()
    );
    expect(periodStartIso('24h', AS_2230_SP)).toBe(
      new Date(AS_2230_SP.getTime() - 24 * 3_600_000).toISOString()
    );
  });
});
