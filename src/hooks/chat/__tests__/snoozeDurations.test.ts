import { describe, it, expect } from 'vitest';
import { snoozeDurationToDate } from '@/hooks/chat/snoozeDurations';

// Datas em hora LOCAL (o alvo do adiamento é a hora local, como o setHours
// original e o resto do app): new Date(ano, mês-1, dia, hora, min).
function local(ano: number, mes: number, dia: number, hora = 10, min = 0): Date {
  return new Date(ano, mes - 1, dia, hora, min, 37, 512);
}

const HORA_ZERADA = [9, 0, 0, 0];

describe('snoozeDurationToDate', () => {
  it("1h e 3h somam exatamente 1h/3h (mantendo os minutos da hora atual)", () => {
    const now = local(2026, 9, 24, 10, 15);
    expect(snoozeDurationToDate('1h', now).getTime() - now.getTime()).toBe(60 * 60 * 1000);
    expect(snoozeDurationToDate('3h', now).getTime() - now.getTime()).toBe(3 * 60 * 60 * 1000);
  });

  it('tomorrow = amanhã às 09:00:00.000, zerando minutos/segundos/ms', () => {
    const now = local(2026, 9, 24, 23, 59); // quinta, 23:59
    const d = snoozeDurationToDate('tomorrow', now);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 9, 25]);
    expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual(HORA_ZERADA);
  });

  it('domingo -> segunda do dia seguinte às 09:00 (não a segunda seguinte)', () => {
    const domingo = local(2026, 9, 27, 10);
    expect(domingo.getDay()).toBe(0);
    const d = snoozeDurationToDate('nextweek', domingo);
    expect(d.getDay()).toBe(1);
    expect([d.getMonth() + 1, d.getDate()]).toEqual([9, 28]);
    expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual(HORA_ZERADA);
  });

  it('segunda -> +7 (próxima segunda)', () => {
    const segunda = local(2026, 9, 28, 10);
    expect(segunda.getDay()).toBe(1);
    const d = snoozeDurationToDate('nextweek', segunda);
    expect(d.getDay()).toBe(1);
    expect([d.getMonth() + 1, d.getDate()]).toEqual([10, 5]);
    expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual(HORA_ZERADA);
  });

  it('sexta -> +3 (próxima segunda)', () => {
    const sexta = local(2026, 10, 2, 10);
    expect(sexta.getDay()).toBe(5);
    const d = snoozeDurationToDate('nextweek', sexta);
    expect(d.getDay()).toBe(1);
    expect([d.getMonth() + 1, d.getDate()]).toEqual([10, 5]);
  });

  it('virada de mês: 30/10 (sexta) -> 02/11 (segunda)', () => {
    const sexta = local(2026, 10, 30, 10);
    const d = snoozeDurationToDate('nextweek', sexta);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 11, 2]);
    expect(d.getDay()).toBe(1);
    expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual(HORA_ZERADA);
  });

  it('virada de mês no tomorrow: 31/10 -> 01/11', () => {
    const now = local(2026, 10, 31, 22);
    const d = snoozeDurationToDate('tomorrow', now);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 11, 1]);
    expect(d.getHours()).toBe(9);
  });

  it('duração desconhecida cai no default de 1h', () => {
    const now = local(2026, 9, 24, 10);
    expect(snoozeDurationToDate('bogus', now).getTime() - now.getTime()).toBe(60 * 60 * 1000);
  });
});
