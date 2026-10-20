/**
 * U7 (paridade V3→V2, doc 11) — `localInstantFromDayAndTime` (`src/lib/localDay.ts:66-79`)
 * não tinha teste na V2 (a V3 tinha `ScheduleMessageDialog.timezone`, 4 casos).
 *
 * Cobre hora vazia/malformada, valor fora da faixa (25:00, 12:60) e o dia de
 * calendário inexistente (2026-02-31) — este último é o que a auditoria pediu para
 * rejeitar e a implementação NÃO rejeita (o `parseDayKey` só valida o formato, não o
 * dia real), por isso fica como `it.fails` com o motivo.
 */
import { describe, it, expect } from 'vitest';
import { localInstantFromDayAndTime } from '@/lib/localDay';

describe('localInstantFromDayAndTime — instante local (U7)', () => {
  it('monta o instante no fuso local com o dia e a hora escolhidos', () => {
    const d = localInstantFromDayAndTime('2026-10-03', '09:30');
    expect(d).not.toBeNull();
    // O dia/hora do relógio do usuário é o que sai — nada de meia-noite UTC deslocando o dia.
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(9); // outubro
    expect(d!.getDate()).toBe(3);
    expect(d!.getHours()).toBe(9);
    expect(d!.getMinutes()).toBe(30);
    expect(d!.getSeconds()).toBe(0);
  });

  it('aceita hora com um dígito só', () => {
    const d = localInstantFromDayAndTime('2026-10-03', '9:05');
    expect(d).not.toBeNull();
    expect(d!.getHours()).toBe(9);
    expect(d!.getMinutes()).toBe(5);
  });

  it('devolve null para dia ausente ou inválido', () => {
    expect(localInstantFromDayAndTime(null, '09:30')).toBeNull();
    expect(localInstantFromDayAndTime('', '09:30')).toBeNull();
    expect(localInstantFromDayAndTime('03/10/2026', '09:30')).toBeNull();
    expect(localInstantFromDayAndTime('2026-1-3', '09:30')).toBeNull();
  });

  it('devolve null para hora ausente, vazia ou malformada', () => {
    expect(localInstantFromDayAndTime('2026-10-03', null)).toBeNull();
    expect(localInstantFromDayAndTime('2026-10-03', '')).toBeNull();
    expect(localInstantFromDayAndTime('2026-10-03', '   ')).toBeNull();
    expect(localInstantFromDayAndTime('2026-10-03', '9h30')).toBeNull();
  });

  it('recusa hora e minuto fora da faixa (25:00 e 12:60)', () => {
    expect(localInstantFromDayAndTime('2026-10-03', '25:00')).toBeNull();
    expect(localInstantFromDayAndTime('2026-10-03', '24:00')).toBeNull();
    expect(localInstantFromDayAndTime('2026-10-03', '12:60')).toBeNull();
  });

  it('aceita os limites exatos (00:00 e 23:59)', () => {
    const inicio = localInstantFromDayAndTime('2026-10-03', '00:00');
    expect(inicio?.getHours()).toBe(0);
    expect(inicio?.getMinutes()).toBe(0);
    const fim = localInstantFromDayAndTime('2026-10-03', '23:59');
    expect(fim?.getHours()).toBe(23);
    expect(fim?.getMinutes()).toBe(59);
  });

  // A auditoria pediu rejeitar data inválida do calendário; a implementação só valida o
  // formato (yyyy-MM-dd) e deixa o rollover do Date acontecer. Bug real do produto.
  it.fails('rejeita dia de calendário inexistente (2026-02-31)', () => {
    expect(localInstantFromDayAndTime('2026-02-31', '10:00')).toBeNull();
  });
});
