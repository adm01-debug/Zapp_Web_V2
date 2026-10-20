import { describe, it, expect } from 'vitest';
import { periodoParaIntervalo, KPI_ZERADO } from '../useCallsKpi';

/**
 * T37 — o risco de verdade desta etapa e a JANELA de datas, nao a chamada da RPC.
 * Por isso `periodoParaIntervalo` e pura e testada com "agora" fixo: limite do dia,
 * dia anterior, e a virada de mes do "mes_passado" (que e onde um off-by-one passa
 * despercebido).
 */
const AGORA = new Date('2026-10-02T14:30:00.000-03:00');
//  corta os limites do dia em hora LOCAL e serializa em UTC.
// Construir a expectativa tambem em hora local deixa o teste valido em qualquer fuso
// (a primeira versao comparava com 'T00:00:00' literal e caia em UTC).
const local = (y: number, m: number, d: number, h = 0, mi = 0, s = 0, ms = 0) =>
  new Date(y, m - 1, d, h, mi, s, ms).toISOString();
const diaInteiro = (y: number, m: number, d: number) =>
  new Date(y, m - 1, d, 23, 59, 59, 999).getTime() - new Date(y, m - 1, d, 0, 0, 0, 0).getTime();

describe('periodoParaIntervalo (T37)', () => {
  it('hoje comeca a meia-noite e termina no fim do dia', () => {
    const { from, to } = periodoParaIntervalo('hoje', AGORA);
    expect(from).toBe(local(2026, 10, 2));
    expect(to).toBe(local(2026, 10, 2, 23, 59, 59, 999));
  });

  it('ontem e um dia inteiro, nao duas horas do dia de hoje', () => {
    const { from, to } = periodoParaIntervalo('ontem', AGORA);
    expect(from).toBe(local(2026, 10, 1));
    expect(to).toBe(local(2026, 10, 1, 23, 59, 59, 999));
    expect(new Date(to).getTime() - new Date(from).getTime()).toBe(diaInteiro(2026, 10, 1));
  });

  it('7d cobre 7 dias contando hoje', () => {
    const { from } = periodoParaIntervalo('7d', AGORA);
    expect(from).toBe(local(2026, 9, 26));
  });

  it('30d cobre 30 dias contando hoje', () => {
    const { from } = periodoParaIntervalo('30d', AGORA);
    expect(from).toBe(local(2026, 9, 3));
  });

  it('mes comeca no dia 1 do mes corrente', () => {
    const { from, to } = periodoParaIntervalo('mes', AGORA);
    expect(from).toBe(local(2026, 10, 1));
    expect(to).toBe(local(2026, 10, 2, 23, 59, 59, 999));
  });

  it('mes_passado pega o mes ANTERIOR inteiro (virada de mes)', () => {
    const { from, to } = periodoParaIntervalo('mes_passado', AGORA);
    expect(from).toBe(local(2026, 9, 1));
    expect(to).toBe(local(2026, 9, 30, 23, 59, 59, 999));
  });

  it('periodo desconhecido cai no default de 7 dias', () => {
    const { from } = periodoParaIntervalo('qualquer_coisa', AGORA);
    expect(from).toBe(local(2026, 9, 26));
  });

  it('os zeros ficam explicitos (a UI nunca recebe undefined)', () => {
    expect(Object.values(KPI_ZERADO).every((v) => v === 0)).toBe(true);
    expect(Object.keys(KPI_ZERADO)).toEqual([
      'total', 'answered', 'missed_inbound', 'inbound', 'outbound', 'avg_talk_seconds',
    ]);
  });
});
