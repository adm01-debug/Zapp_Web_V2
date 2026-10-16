import { describe, it, expect } from 'vitest';
import { localDayKey, parseDayKey, calendarDayKey, goalPeriodRange } from '@/lib/localDay';

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

  it('rejeita dia inexistente no calendario em vez de rolar para o mes seguinte', () => {
    // `new Date(2026, 1, 31)` rola para 03/03 e `new Date(2026, 8, 31)` para 01/10.
    expect(parseDayKey('2026-02-31')).toBeNull();
    expect(parseDayKey('2026-09-31')).toBeNull();
    expect(parseDayKey('2026-04-31')).toBeNull();
  });

  it('rejeita mes fora de 01-12 em vez de rolar o ano', () => {
    // `new Date(2026, 12, 01)` rola para 01/01/2027 e `new Date(2026, -1, 10)` para 10/12/2025.
    expect(parseDayKey('2026-13-01')).toBeNull();
    expect(parseDayKey('2026-00-10')).toBeNull();
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

describe('goalPeriodRange — a janela unica do painel e do aviso de conquista', () => {
  it('a semana comeca na SEGUNDA e termina no domingo (igual a SLA, nao o domingo do date-fns)', () => {
    const quarta = new Date(2026, 8, 30, 15, 0, 0);
    const { from, to } = goalPeriodRange('week', quarta);
    expect(from.getDay()).toBe(1); // segunda
    expect(from.getHours()).toBe(0);
    expect(from.getTime()).toBeLessThanOrEqual(quarta.getTime());
    expect(quarta.getTime()).toBeLessThanOrEqual(to.getTime());
    expect(to.getDay()).toBe(0); // domingo
    expect(to.getHours()).toBe(23);
    // nunca mais de 6 dias entre a segunda e o instante consultado
    expect((quarta.getTime() - from.getTime()) / 86_400_000).toBeLessThan(7);
  });

  it('o domingo pertence a semana que comecou na segunda anterior', () => {
    const domingo = new Date(2026, 9, 4, 10, 0, 0);
    const { from } = goalPeriodRange('week', domingo);
    expect(from.getDay()).toBe(1);
    expect((domingo.getTime() - from.getTime()) / 86_400_000).toBeLessThan(7);
  });

  it('o dia e o dia local inteiro e o mes comeca no dia 1o', () => {
    const d = new Date(2026, 8, 30, 15, 0, 0);
    const dia = goalPeriodRange('today', d);
    expect(dia.from.getHours()).toBe(0);
    expect(dia.from.getDate()).toBe(30);
    expect(dia.to.getDate()).toBe(30);
    expect(dia.to.getHours()).toBe(23);
    expect(dia.to.getMinutes()).toBe(59);

    const mes = goalPeriodRange('month', d);
    expect(mes.from.getDate()).toBe(1);
    expect(mes.from.getMonth()).toBe(8);
    expect(mes.to.getDate()).toBe(30);
  });

  it('periodo desconhecido cai em hoje (nao estoura nem conta vazio)', () => {
    const d = new Date(2026, 8, 30, 15, 0, 0);
    expect(goalPeriodRange('trimestre', d).from.toISOString()).toBe(goalPeriodRange('today', d).from.toISOString());
    expect(goalPeriodRange('trimestre', d).to.toISOString()).toBe(goalPeriodRange('today', d).to.toISOString());
  });
});
