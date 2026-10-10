import { describe, it, expect } from 'vitest';
import { localDayKey, parseDayKey, calendarDayKey } from '@/lib/localDay';

describe('localDayKey — dia no fuso LOCAL do navegador', () => {
  it('usa o dia local, nao a fatia UTC do ISO', () => {
    // 22:30 no fuso do navegador: em UTC-3 isso ja e 01:30Z do dia seguinte.
    const at = new Date(2026, 8, 30, 22, 30);
    expect(localDayKey(at)).toBe('2026-09-30');
    expect(localDayKey(at.toISOString())).toBe('2026-09-30');
  });

  it('fim do dia local continua no proprio dia', () => {
    expect(localDayKey(new Date(2026, 8, 30, 0, 0))).toBe('2026-09-30');
    expect(localDayKey(new Date(2026, 8, 30, 23, 59, 59).toISOString())).toBe('2026-09-30');
  });

  it('devolve null para valor ausente ou invalido (nao estoura)', () => {
    expect(localDayKey(null)).toBeNull();
    expect(localDayKey(undefined)).toBeNull();
    expect(localDayKey('')).toBeNull();
    expect(localDayKey('nao-e-data')).toBeNull();
  });
});

describe('parseDayKey — chave yyyy-MM-dd lida no fuso local', () => {
  it('nao desloca o dia (new Date("yyyy-MM-dd") seria meia-noite UTC)', () => {
    const d = parseDayKey('2026-09-30');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(8);
    expect(d!.getDate()).toBe(30);
    expect(localDayKey(d)).toBe('2026-09-30');
  });

  it('devolve null para chave invalida', () => {
    expect(parseDayKey('30/09/2026')).toBeNull();
    expect(parseDayKey('2026-09')).toBeNull();
    expect(parseDayKey(null)).toBeNull();
  });
});

describe('calendarDayKey — dia de um timestamp gravado sem hora', () => {
  it('data sem hora (meia-noite UTC) mantem o dia escolhido', () => {
    expect(calendarDayKey('2026-09-30T00:00:00.000Z')).toBe('2026-09-30');
  });

  it('instante com hora usa o dia local', () => {
    expect(calendarDayKey(new Date(2026, 8, 30, 22, 30).toISOString())).toBe('2026-09-30');
  });

  it('devolve null para valor ausente ou invalido', () => {
    expect(calendarDayKey(null)).toBeNull();
    expect(calendarDayKey('2026-09-30T10:00:00Z') && 'ok').toBe('ok'); // com hora: nao e date-only
    expect(calendarDayKey('xxx')).toBeNull();
  });
});
