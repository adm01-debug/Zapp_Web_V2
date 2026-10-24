/**
 * Z01 (plano de consistência de 07/10/2026, D01) — EQUIVALÊNCIA entre as duas telas que filtram
 * por período: o Journey (`src/lib/journey/periodRange.ts`, a fonte única do cálculo) e a aba
 * Arquivos (`src/lib/filesPeriod.ts`, adaptador fino sobre ele).
 *
 * Fuso do aparelho fixado em São Paulo (UTC-3), como no resto do produto: é onde o recorte diário
 * se separa do recorte em UTC. As armadilhas que estes testes discriminam:
 *   1. `new Date('yyyy-MM-dd')` = meia-noite UTC (em UTC-3, o dia anterior) contra meia-noite
 *      LOCAL, o defeito já registrado em `src/lib/localDay.ts`;
 *   2. janela de N×24 h contra N dias de CALENDÁRIO.
 */
process.env.TZ = 'America/Sao_Paulo';

import { describe, it, expect } from 'vitest';
import { buildPeriodRange, filterByPeriod, type PeriodRange } from '@/lib/filesPeriod';
import {
  resolveLastDays,
  resolveRange,
  isWithin,
  type JourneyPeriodPreset,
  type JourneyRange,
} from '@/lib/journey/periodRange';
import type { AnalysisPeriod } from '@/components/inbox/ai-tools/PeriodFilterSelector';

const DIA_MS = 24 * 60 * 60 * 1000;

/** 07/10/2026 12:00 no relógio do aparelho — longe de qualquer borda. */
const MEIO_DIA = new Date(2026, 9, 7, 12, 0, 0, 0);

/** `yyyy-MM-dd` de um dia de outubro/2026 (negativo e >31 andam pelos meses vizinhos). */
function chaveDeOutubro(dia: number): string {
  const d = new Date(2026, 9, dia);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const diaMes = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${diaMes}`;
}

/** O Journey devolve `Date`; a aba Arquivos trabalha em epoch ms. Mesmo instante, sem fuso no meio. */
function comoPeriodRange(range: JourneyRange): PeriodRange {
  return {
    from: range.from ? range.from.getTime() : null,
    to: range.to ? range.to.getTime() : null,
  };
}

/** Mesmo recorte do adaptador quando ele só devolveu número. */
function item(created_at: string, id = created_at) {
  return { id, created_at };
}

describe('Z01 — o mesmo período dá o mesmo intervalo nas duas telas', () => {
  it('"Hoje" é exatamente o mesmo intervalo', () => {
    expect(buildPeriodRange('today', null, null, MEIO_DIA)).toEqual(
      comoPeriodRange(resolveRange({ preset: 'today' }, MEIO_DIA)),
    );
  });

  it('cada atalho de Arquivos é a MESMA janela explícita do Journey', () => {
    // A janela explícita equivalente ao atalho: começa `diasAtras` dias antes de hoje e vai até o
    // fim de hoje — os dois lados têm de concordar instante a instante.
    const atalhos: { period: AnalysisPeriod; diasAtras: number }[] = [
      { period: 'today', diasAtras: 0 },
      { period: '3d', diasAtras: 3 },
      { period: '7d', diasAtras: 7 },
      { period: '14d', diasAtras: 14 },
      { period: '30d', diasAtras: 30 },
      { period: '90d', diasAtras: 90 },
    ];

    for (const { period, diasAtras } of atalhos) {
      const explicito = resolveRange(
        { preset: 'custom', from: chaveDeOutubro(7 - diasAtras), to: chaveDeOutubro(7) },
        MEIO_DIA,
      );
      expect(buildPeriodRange(period, null, null, MEIO_DIA)).toEqual(comoPeriodRange(explicito));
      expect(explicito.invalid).toBe(false);
    }
  });

  it('a diferença entre os atalhos de mesmo nome é de exatamente 1 dia (documentada, não acidental)', () => {
    const arquivos = buildPeriodRange('7d', null, null, MEIO_DIA)!;
    const journey = resolveRange({ preset: '7d' }, MEIO_DIA);
    // Arquivos (e a aba IA) contam "últimos 7 dias" como hoje + os 7 anteriores (8 dias de
    // calendário); o Journey conta 7 dias de calendário (hoje + os 6 anteriores). As duas telas
    // sempre terminam no fim de hoje: só o início muda, e muda 1 dia.
    expect(arquivos.to).toBe(journey.to!.getTime());
    expect(arquivos.from).toBe(journey.from!.getTime() - DIA_MS);
  });

  it('De/Até é o mesmo intervalo, inclusive com só uma ponta ou invertido', () => {
    expect(buildPeriodRange('custom', new Date(2026, 9, 1), new Date(2026, 9, 7), MEIO_DIA)).toEqual(
      comoPeriodRange(resolveRange({ preset: 'custom', from: '2026-10-01', to: '2026-10-07' }, MEIO_DIA)),
    );

    // Invertido: normalizado dos dois lados.
    expect(buildPeriodRange('custom', new Date(2026, 9, 7), new Date(2026, 9, 1), MEIO_DIA)).toEqual(
      comoPeriodRange(resolveRange({ preset: 'custom', from: '2026-10-07', to: '2026-10-01' }, MEIO_DIA)),
    );

    // Só "De" (fim em aberto) e só "Até" (início em aberto).
    expect(buildPeriodRange('custom', new Date(2026, 9, 1), null, MEIO_DIA)).toEqual(
      comoPeriodRange(resolveRange({ preset: 'custom', from: '2026-10-01' }, MEIO_DIA)),
    );
    expect(buildPeriodRange('custom', null, new Date(2026, 9, 5), MEIO_DIA)).toEqual(
      comoPeriodRange(resolveRange({ preset: 'custom', to: '2026-10-05' }, MEIO_DIA)),
    );

    // Nenhuma data escolhida: as duas tratam como "sem filtro".
    expect(buildPeriodRange('custom', null, null, MEIO_DIA)).toBeNull();
    expect(resolveRange({ preset: 'custom' }, MEIO_DIA)).toEqual({ from: null, to: null, invalid: false });
  });

  it('"Qualquer data" não limita nada em nenhuma das duas', () => {
    expect(buildPeriodRange('all', null, null, MEIO_DIA)).toBeNull();
    expect(resolveRange({ preset: 'any' }, MEIO_DIA)).toEqual({ from: null, to: null, invalid: false });
  });

  it('atalho sem filtro em Arquivos também casa com o intervalo aberto do Journey', () => {
    // `last_interaction` não é oferecido na aba Arquivos (não há histórico ali): cai em sem filtro.
    expect(buildPeriodRange('last_interaction', null, null, MEIO_DIA)).toBeNull();
  });

  it('resolveLastDays é a mesma conta que o atalho do Journey usa', () => {
    const atalhos: { preset: JourneyPeriodPreset; dias: number }[] = [
      { preset: 'today', dias: 1 },
      { preset: '3d', dias: 3 },
      { preset: '7d', dias: 7 },
      { preset: '14d', dias: 14 },
      { preset: '30d', dias: 30 },
      { preset: '90d', dias: 90 },
    ];
    for (const { preset, dias } of atalhos) {
      expect(resolveRange({ preset }, MEIO_DIA)).toEqual(resolveLastDays(dias, MEIO_DIA));
    }
  });
});

describe('Z01 — o mesmo recorte de itens nas duas telas', () => {
  // Período ativo começando em 30/09/2026 00:00 local (07/10 menos 7 dias, janela de Arquivos).
  const range = buildPeriodRange('7d', null, null, MEIO_DIA)!;
  const bounds = { from: new Date(range.from!), to: new Date(range.to!) };

  const itens = [
    item('2026-09-30', 'dia-puro-no-limite'),
    item(new Date(2026, 8, 30, 0, 0, 0, 0).toISOString(), 'iso-no-limite'),
    item('2026-09-29', 'dia-puro-um-dia-antes'),
    item(new Date(2026, 9, 7, 23, 59, 59, 999).toISOString(), 'iso-ultimo-instante'),
    item('nao-e-data', 'lixo'),
    item('', 'vazio'),
  ];

  it('filterByPeriod (Arquivos) casa item a item com isWithin (Journey)', () => {
    const porArquivos = filterByPeriod(itens, range).map((i) => i.id);
    const porJourney = itens.filter((i) => isWithin(i.created_at, bounds)).map((i) => i.id);
    expect(porArquivos).toEqual(porJourney);
  });

  it('o dia puro na borda do período é o dia do APARELHO, não o dia UTC', () => {
    // 30/09 como meia-noite UTC é 29/09 21:00 em UTC-3: quem cortasse em UTC perderia este item.
    expect(filterByPeriod(itens, range).map((i) => i.id)).toEqual([
      'dia-puro-no-limite',
      'iso-no-limite',
      'iso-ultimo-instante',
    ]);
  });

  it('sem período ativo devolve a MESMA lista (contrato do FilesTab)', () => {
    expect(filterByPeriod(itens, null)).toBe(itens);
  });
});
