import { describe, expect, it } from 'vitest';
import { buildPeriodRange, filterByPeriod, type PeriodRange } from '@/lib/filesPeriod';

/**
 * F07 — casos ADVERSARIAIS do recorte por DATA da aba Arquivos (`src/lib/filesPeriod.ts`).
 *
 * Complementa `filesPeriod.test.ts` (F01) atacando o que aquela bateria não cobre: o fuso do
 * navegador contra a fatia UTC do ISO, as viradas de dia/mês/ano nos extremos, o intervalo
 * invertido no extremo do milissegundo, as pontas inclusivas e a data inválida do arquivo.
 *
 * Todos os instantes são montados com o construtor LOCAL (`new Date(ano, mês, dia, ...)`), nunca
 * por `new Date('yyyy-MM-dd')` — é justamente essa diferença que a casa já pagou caro em
 * `localDay.ts` e que o primeiro bloco abaixo prova.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

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

function item(created_at: string, id = created_at) {
  return { id, created_at };
}

/** O dia LOCAL inteiro (00:00:00.000 .. 23:59:59.999), como o período personalizado de um dia. */
function dia(year: number, month: number, day: number): PeriodRange {
  return {
    from: local(year, month, day).getTime(),
    to: local(year, month, day, 23, 59, 59, 999).getTime(),
  };
}

/**
 * O mesmo dia, mas com as PONTAS VINDAS DA PRODUÇÃO (`buildPeriodRange('custom', d, d)`) — é o
 * que faz o teste de fuso depender do construtor de limites de verdade, e não de uma conta feita
 * aqui dentro.
 */
function diaDaProducao(year: number, month: number, day: number): PeriodRange {
  return buildPeriodRange('custom', local(year, month, day), local(year, month, day), NOW)!;
}

/** 10/03/2026 15:30 (local) — o "agora" de quase todos os casos de atalho. */
const NOW = local(2026, 3, 10, 15, 30);

describe('filesPeriod (adversarial) — fuso: o corte é o dia LOCAL, não a fatia UTC do ISO', () => {
  /**
   * A suíte roda em `America/Sao_Paulo` (UTC-3) — o MESMO fuso que `localDay.test.ts` já assume
   * no repositório. Só a oeste de UTC existe o caso adversarial deste bloco: um instante do fim
   * do dia local tem a fatia UTC já no dia SEGUINTE. Se esta premissa falhar, o resto do bloco
   * não mede nada — por isso ela é uma asserção, e não um comentário.
   */
  it('premissa: a suíte roda a oeste de UTC (UTC-3)', () => {
    expect(new Date(2026, 2, 5, 12, 0).getTimezoneOffset()).toBe(180);
  });

  it('o último milissegundo do dia local entra, mesmo com a fatia UTC já no dia seguinte', () => {
    const ultimo = local(2026, 3, 5, 23, 59, 59, 999);
    // Em UTC-3 o ISO (UTC) deste instante já é 06/03: quem cortasse pelo ISO/UTC o perderia.
    expect(ultimo.toISOString().slice(0, 10)).toBe('2026-03-06');
    expect(
      filterByPeriod([item(iso(ultimo), 'ultimo')], diaDaProducao(2026, 3, 5)).map((i) => i.id),
    ).toEqual(['ultimo']);
  });

  it('o primeiro milissegundo do dia local entra (fatia UTC ainda é o MESMO dia, em UTC-3)', () => {
    const primeiro = local(2026, 3, 5, 0, 0, 0, 0);
    expect(primeiro.toISOString().slice(0, 10)).toBe('2026-03-05');
    expect(
      filterByPeriod([item(iso(primeiro), 'primeiro')], diaDaProducao(2026, 3, 5)).map((i) => i.id),
    ).toEqual(['primeiro']);
  });

  it('data só com dia ("2026-03-06", meia-noite UTC) é recortada pelo dia LOCAL do instante', () => {
    // `new Date('yyyy-MM-dd')` é meia-noite UTC — o erro clássico da casa. O dia local desse
    // instante (05/03 em UTC-3) é quem decide; a expectativa sai do PRÓPRIO instante e das pontas
    // da produção, então o caso vale em qualquer fuso.
    const instante = new Date('2026-03-06');
    const y = instante.getFullYear();
    const m = instante.getMonth() + 1;
    const d = instante.getDate();
    expect(
      filterByPeriod([item(instante.toISOString(), 'so-dia')], diaDaProducao(y, m, d)).map((i) => i.id),
    ).toEqual(['so-dia']);

    // O dia SEGUINTE (o dia da fatia UTC) não o contém.
    const seguinte = new Date(y, m - 1, d + 1);
    expect(
      filterByPeriod(
        [item(instante.toISOString(), 'so-dia')],
        diaDaProducao(seguinte.getFullYear(), seguinte.getMonth() + 1, seguinte.getDate()),
      ),
    ).toEqual([]);
  });
});

describe('filesPeriod (adversarial) — viradas de dia, mês e ano', () => {
  it('"Hoje" vale o dia INTEIRO de `now`, pedido às 23:59, e não alcança amanhã', () => {
    const range = buildPeriodRange('today', null, null, local(2026, 3, 10, 23, 59, 59, 999))!;
    expect(range.from).toBe(local(2026, 3, 10).getTime());
    expect(range.to).toBe(local(2026, 3, 10, 23, 59, 59, 999).getTime());

    const itens = [
      item(iso(local(2026, 3, 9, 23, 59, 59, 999)), 'ontem'),
      item(iso(local(2026, 3, 10, 0, 0, 0, 0)), 'meia-noite'),
      item(iso(local(2026, 3, 10, 23, 59, 59, 999)), 'ultimo'),
      item(iso(local(2026, 3, 11, 0, 0, 0, 0)), 'amanha'),
    ];
    expect(filterByPeriod(itens, range).map((i) => i.id)).toEqual(['meia-noite', 'ultimo']);
  });

  it('atravessa o mês CURTO (fevereiro de 28 dias): 30d pedido em 01/03/2026 começa em 30/01', () => {
    expect(buildPeriodRange('30d', null, null, local(2026, 3, 1, 12, 0))!.from).toBe(
      local(2026, 1, 30).getTime(),
    );
  });

  it('ano BISSEXTO: 30d pedido em 01/03/2024 começa em 31/01 (fevereiro tem 29)', () => {
    expect(buildPeriodRange('30d', null, null, local(2024, 3, 1, 12, 0))!.from).toBe(
      local(2024, 1, 31).getTime(),
    );
  });

  it('atravessa a virada de ANO para trás: 3d pedido em 01/01/2026 começa em 29/12/2025', () => {
    const range = buildPeriodRange('3d', null, null, local(2026, 1, 1, 9, 0))!;
    expect(range.from).toBe(local(2025, 12, 29).getTime());
    expect(range.to).toBe(local(2026, 1, 1, 23, 59, 59, 999).getTime());
  });

  it('90d pedido em 31/03/2026 volta a 31/12/2025 sem pular dia (3 meses de 31/28/31)', () => {
    expect(buildPeriodRange('90d', null, null, local(2026, 3, 31, 10, 0))!.from).toBe(
      local(2025, 12, 31).getTime(),
    );
  });
});

describe('filesPeriod (adversarial) — intervalo personalizado nos extremos', () => {
  it('invertido no extremo (De no último ms do dia 10, Até no primeiro ms do dia 5) normaliza 05..10', () => {
    const range = buildPeriodRange(
      'custom',
      local(2026, 3, 10, 23, 59, 59, 999),
      local(2026, 3, 5, 0, 0, 0, 0),
      NOW,
    )!;
    expect(range).toEqual({
      from: local(2026, 3, 5, 0, 0, 0, 0).getTime(),
      to: local(2026, 3, 10, 23, 59, 59, 999).getTime(),
    });
  });

  it('as pontas são INCLUSIVAS ao milissegundo: from entra, from-1 fica fora, to entra, to+1 fica fora', () => {
    const range = buildPeriodRange('custom', local(2026, 3, 5), local(2026, 3, 7), NOW)!;
    const itens = [
      item(new Date(range.from! - 1).toISOString(), 'um-ms-antes'),
      item(new Date(range.from!).toISOString(), 'no-from'),
      item(new Date(range.to!).toISOString(), 'no-to'),
      item(new Date(range.to! + 1).toISOString(), 'um-ms-depois'),
    ];
    expect(filterByPeriod(itens, range).map((i) => i.id)).toEqual(['no-from', 'no-to']);
  });

  it('"all" e "last_interaction" ignoram datas residuais do calendário', () => {
    // O seletor limpa as datas ao sair de "custom", mas o estado pode carregar resíduo de um
    // caminho que não limpou: "Qualquer data" tem de vencer mesmo com as pontas preenchidas.
    expect(buildPeriodRange('all', local(2026, 3, 5), local(2026, 3, 7), NOW)).toBeNull();
    expect(buildPeriodRange('last_interaction', local(2026, 3, 5), local(2026, 3, 7), NOW)).toBeNull();
  });

  it('não muta os Dates recebidos (o calendário segue com a data que o operador escolheu)', () => {
    const from = local(2026, 3, 5, 15, 30);
    const to = local(2026, 3, 7, 9, 15);
    buildPeriodRange('custom', from, to, NOW);
    expect([from.getHours(), from.getMinutes(), from.getSeconds()]).toEqual([15, 30, 0]);
    expect([to.getHours(), to.getMinutes(), to.getSeconds()]).toEqual([9, 15, 0]);
  });

  it('com só "Até" (De aberto) os antigos entram e os posteriores ao limite ficam fora', () => {
    const range = buildPeriodRange('custom', null, local(2026, 3, 7), NOW)!;
    expect(range.from).toBeNull();
    const itens = [
      item(iso(local(2026, 3, 8, 0, 0, 0, 0)), 'posterior'),
      item(iso(local(2026, 3, 7, 23, 59, 59, 999)), 'no-limite'),
      item(iso(local(2020, 1, 1)), 'muito-antigo'),
    ];
    expect(filterByPeriod(itens, range).map((i) => i.id)).toEqual(['no-limite', 'muito-antigo']);
  });

  it('sem intervalo devolve a MESMA referência (nem cópia, nem filtro)', () => {
    const itens = [item(iso(local(2026, 3, 6, 12, 0)), 'a'), item('lixo', 'b')];
    expect(filterByPeriod(itens, null)).toBe(itens);
  });

  it('preserva a ORDEM recebida (a lista já chega em `created_at desc` do keyset)', () => {
    const itens = [
      item(iso(local(2026, 3, 6, 18, 0)), 'c'),
      item(iso(local(2026, 3, 6, 9, 0)), 'b'),
      item(iso(local(2026, 3, 6, 15, 0)), 'a'),
    ];
    expect(filterByPeriod(itens, dia(2026, 3, 6)).map((i) => i.id)).toEqual(['c', 'b', 'a']);
  });

  it('puro: duas chamadas iguais devolvem o mesmo intervalo', () => {
    expect(buildPeriodRange('7d', null, null, NOW)).toEqual(buildPeriodRange('7d', null, null, NOW));
  });

  it('o intervalo dos atalhos cresce com os dias (3d < 7d < 30d < 90d, todos terminando no fim de hoje)', () => {
    const from = (period: '3d' | '7d' | '30d' | '90d') => buildPeriodRange(period, null, null, NOW)!.from!;
    expect(from('3d')).toBeGreaterThan(from('7d'));
    expect(from('7d')).toBeGreaterThan(from('30d'));
    expect(from('30d')).toBeGreaterThan(from('90d'));
    const fimDeHoje = local(2026, 3, 10, 23, 59, 59, 999).getTime();
    for (const period of ['3d', '7d', '30d', '90d'] as const) {
      expect(buildPeriodRange(period, null, null, NOW)!.to).toBe(fimDeHoje);
    }
    // Nenhum atalho recorta "de hoje em diante": os 4 começam no início de um dia LOCAL.
    for (const period of ['3d', '7d', '30d', '90d'] as const) {
      const inicio = new Date(from(period));
      expect([inicio.getHours(), inicio.getMinutes(), inicio.getSeconds(), inicio.getMilliseconds()]).toEqual([0, 0, 0, 0]);
    }
  });
});

describe('filesPeriod (adversarial) — data do ARQUIVO inválida, vazia ou ausente', () => {
  const range = dia(2026, 3, 6);

  it('lixo, vazio, undefined e mês fora do calendário ficam FORA — com o arquivo bom ainda dentro', () => {
    const itens = [
      item('', 'vazio'),
      item('nao-e-data', 'lixo'),
      item('2026-13-45T00:00:00.000Z', 'mes-invalido'),
      item(undefined as unknown as string, 'sem-data'),
      item(iso(local(2026, 3, 6, 12, 0)), 'bom'),
    ];
    expect(filterByPeriod(itens, range).map((i) => i.id)).toEqual(['bom']);
  });

  it('a lista inteira sem data válida devolve [] (nunca a lista cheia)', () => {
    const itens = [item('', 'a'), item('nada', 'b'), item('0000-00-00', 'c')];
    expect(filterByPeriod(itens, range)).toEqual([]);
  });

  it('a data inválida não "vaza" para o intervalo dos atalhos do mês', () => {
    const atalho = buildPeriodRange('7d', null, null, local(2026, 3, 6, 12, 0))!;
    const itens = [item('nao-e-data', 'lixo'), item(iso(local(2026, 3, 4, 10, 0)), 'dentro')];
    expect(filterByPeriod(itens, atalho).map((i) => i.id)).toEqual(['dentro']);
  });
});
