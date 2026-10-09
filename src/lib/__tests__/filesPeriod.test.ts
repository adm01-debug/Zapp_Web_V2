import { describe, it, expect } from 'vitest';
import { buildPeriodRange, filterByPeriod } from '@/lib/filesPeriod';

/**
 * O recorte é por DIA LOCAL do navegador — os instantes aqui são montados com o construtor
 * local (`new Date(ano, mês, dia, hora, ...)`), nunca por `new Date('yyyy-MM-dd')`, justamente
 * o erro que a casa já pagou caro em `localDay.ts`.
 */
function local(
  year: number,
  month: number,
  day: number,
  hours = 0,
  minutes = 0,
  seconds = 0,
  ms = 0,
): Date {
  return new Date(year, month - 1, day, hours, minutes, seconds, ms);
}

const iso = (date: Date) => date.toISOString();

/** 10/03/2026 15:30 (local) — o "agora" de quase todos os casos. */
const NOW = local(2026, 3, 10, 15, 30);

function item(created_at: string, id = created_at) {
  return { id, created_at };
}

describe('filesPeriod — buildPeriodRange', () => {
  it('all (Qualquer data) e last_interaction não filtram', () => {
    expect(buildPeriodRange('all', null, null, NOW)).toBeNull();
    // `last_interaction` não é oferecido na aba Arquivos (não há histórico aqui): cai em sem filtro.
    expect(buildPeriodRange('last_interaction', null, null, NOW)).toBeNull();
  });

  it('Hoje vai da meia-noite ao fim do dia LOCAL', () => {
    expect(buildPeriodRange('today', null, null, NOW)).toEqual({
      from: local(2026, 3, 10, 0, 0, 0, 0).getTime(),
      to: local(2026, 3, 10, 23, 59, 59, 999).getTime(),
    });
  });

  it('Últimos 7 dias começa no início do 7º dia anterior e termina no fim de hoje', () => {
    expect(buildPeriodRange('7d', null, null, NOW)).toEqual({
      from: local(2026, 3, 3, 0, 0, 0, 0).getTime(),
      to: local(2026, 3, 10, 23, 59, 59, 999).getTime(),
    });
  });

  it('Últimos 3/14/30/90 dias contam do início do dia, como os atalhos da IA', () => {
    expect(buildPeriodRange('3d', null, null, NOW)?.from).toBe(local(2026, 3, 7).getTime());
    expect(buildPeriodRange('14d', null, null, NOW)?.from).toBe(local(2026, 2, 24).getTime());
    expect(buildPeriodRange('30d', null, null, NOW)?.from).toBe(local(2026, 2, 8).getTime());
    expect(buildPeriodRange('90d', null, null, NOW)?.from).toBe(local(2025, 12, 10).getTime());
  });

  it('atravessa a virada de MÊS sem escorregar (março -> fevereiro)', () => {
    const range = buildPeriodRange('7d', null, null, local(2026, 3, 3, 9, 0))!;
    expect(range.from).toBe(local(2026, 2, 24).getTime());
    expect(range.to).toBe(local(2026, 3, 3, 23, 59, 59, 999).getTime());
  });

  it('atravessa a virada de ANO sem escorregar (janeiro -> dezembro)', () => {
    const range = buildPeriodRange('7d', null, null, local(2026, 1, 2, 9, 0))!;
    expect(range.from).toBe(local(2025, 12, 26).getTime());
    expect(range.to).toBe(local(2026, 1, 2, 23, 59, 59, 999).getTime());
  });

  it('personalizado inclui o dia inicial e o dia final INTEIROS', () => {
    const range = buildPeriodRange('custom', local(2026, 3, 5), local(2026, 3, 7), NOW)!;
    expect(range.from).toBe(local(2026, 3, 5, 0, 0, 0, 0).getTime());
    expect(range.to).toBe(local(2026, 3, 7, 23, 59, 59, 999).getTime());
  });

  it('personalizado com um dia só (De = Até) vale para o dia inteiro', () => {
    const range = buildPeriodRange('custom', local(2026, 3, 5), local(2026, 3, 5), NOW)!;
    expect(range).toEqual({
      from: local(2026, 3, 5, 0, 0, 0, 0).getTime(),
      to: local(2026, 3, 5, 23, 59, 59, 999).getTime(),
    });
  });

  it('personalizado invertido é normalizado (de <= até)', () => {
    const range = buildPeriodRange('custom', local(2026, 3, 10), local(2026, 3, 5), NOW)!;
    expect(range.from).toBe(local(2026, 3, 5, 0, 0, 0, 0).getTime());
    expect(range.to).toBe(local(2026, 3, 10, 23, 59, 59, 999).getTime());
    expect(Number(range.from)).toBeLessThan(Number(range.to));
  });

  it('personalizado com só uma ponta: o outro lado fica aberto', () => {
    expect(buildPeriodRange('custom', local(2026, 3, 5), null, NOW)).toEqual({
      from: local(2026, 3, 5, 0, 0, 0, 0).getTime(),
      to: null,
    });
    expect(buildPeriodRange('custom', null, local(2026, 3, 7), NOW)).toEqual({
      from: null,
      to: local(2026, 3, 7, 23, 59, 59, 999).getTime(),
    });
  });

  it('personalizado sem nenhuma data escolhida não filtra', () => {
    expect(buildPeriodRange('custom', null, null, NOW)).toBeNull();
    expect(buildPeriodRange('custom', undefined, undefined, NOW)).toBeNull();
  });

  it('data inválida no personalizado é tratada como ausente (nunca NaN no intervalo)', () => {
    const invalida = new Date('nao-e-data');
    expect(buildPeriodRange('custom', invalida, null, NOW)).toBeNull();
    expect(buildPeriodRange('custom', invalida, local(2026, 3, 7), NOW)).toEqual({
      from: null,
      to: local(2026, 3, 7, 23, 59, 59, 999).getTime(),
    });
  });
});

describe('filesPeriod — filterByPeriod', () => {
  const range = { from: local(2026, 3, 5, 0, 0, 0, 0).getTime(), to: local(2026, 3, 7, 23, 59, 59, 999).getTime() };

  it('sem intervalo devolve a MESMA lista (inclusive itens sem data válida)', () => {
    const items = [item('nada'), item(iso(local(2020, 1, 1)))];
    expect(filterByPeriod(items, null)).toBe(items);
  });

  it('inclui as pontas exatas do dia de envio e exclui a hora antes e a hora depois', () => {
    const dentro = [
      item(iso(local(2026, 3, 5, 0, 0, 0, 0)), 'inicio'),
      item(iso(local(2026, 3, 6, 12, 0)), 'meio'),
      item(iso(local(2026, 3, 7, 23, 59, 59, 999)), 'fim'),
    ];
    const fora = [
      item(iso(local(2026, 3, 4, 23, 59, 59, 999)), 'antes'),
      item(iso(local(2026, 3, 8, 0, 0, 0, 0)), 'depois'),
    ];
    const ids = filterByPeriod([...fora, ...dentro], range).map((i) => i.id);
    expect(ids).toEqual(['inicio', 'meio', 'fim']);
  });

  it('data ausente ou inválida fica FORA quando há período ativo', () => {
    const items = [item(''), item('nao-e-data', 'lixo'), item(iso(local(2026, 3, 6))), item(undefined as unknown as string, 'sem')];
    expect(filterByPeriod(items, range).map((i) => i.id)).toEqual([iso(local(2026, 3, 6))]);
  });

  it('a virada do dia é a do fuso LOCAL, não o corte UTC do ISO', () => {
    // 31/12/2025 22:00 local, que em UTC-3 é 01/01/2026T01:00Z: quem cortasse o ISO em UTC
    // jogaria este arquivo para o ano seguinte e o perderia no filtro do dia 31.
    const reveillon = item(iso(local(2025, 12, 31, 22, 0)));
    const so31 = { from: local(2025, 12, 31, 0, 0, 0, 0).getTime(), to: local(2025, 12, 31, 23, 59, 59, 999).getTime() };
    expect(filterByPeriod([reveillon], so31)).toHaveLength(1);
  });

  it('respeita as pontas abertas (De sem Até, Até sem De)', () => {
    const items = [item(iso(local(2026, 1, 1)), 'janeiro'), item(iso(local(2026, 3, 6)), 'março'), item(iso(local(2026, 12, 31)), 'dezembro')];
    expect(filterByPeriod(items, { from: local(2026, 3, 1).getTime(), to: null }).map((i) => i.id)).toEqual(['março', 'dezembro']);
    expect(filterByPeriod(items, { from: null, to: local(2026, 1, 31).getTime() }).map((i) => i.id)).toEqual(['janeiro']);
  });
});
