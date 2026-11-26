/**
 * CV-143: a serie de retencao do copiloto. Os helpers sao puros porque a tela
 * depende de tres coisas que erram silenciosamente: o nome do atendente (a ponte
 * e `profiles.user_id`, nao `profiles.id`), a media de temperatura (nao pode ser
 * media de medias) e a contagem por dia (nao pode somar duas vezes o mesmo dia).
 */
import { describe, expect, it } from 'vitest';

import {
  agruparPorAtendente,
  agruparPorDia,
  diaLimite,
  mapLinha,
  resumirRetencao,
  type RetencaoLinha,
} from '../useCopilotRetention';

const NOMES = new Map([
  ['u-ana', 'Ana'],
  ['u-bruno', 'Bruno'],
]);

function linha(parcial: Partial<RetencaoLinha> = {}): RetencaoLinha {
  return {
    profileId: 'u-ana',
    atendente: 'Ana',
    dia: '2026-11-25',
    sessoes: 10,
    ticks: 20,
    insights: 30,
    brindes: 0,
    temperaturaMedia: 18,
    ...parcial,
  };
}

describe('diaLimite', () => {
  it('devolve o primeiro dia da janela, contando o dia de hoje', () => {
    expect(diaLimite(7, new Date(2026, 10, 26))).toBe('2026-11-20');
    expect(diaLimite(1, new Date(2026, 10, 26))).toBe('2026-11-26');
  });

  it('atravessa a virada do mes sem perder o zero a esquerda', () => {
    expect(diaLimite(30, new Date(2026, 0, 5))).toBe('2025-12-07');
  });
});

describe('mapLinha', () => {
  it('resolve o nome pela ponte user_id e converte numeric do PostgREST', () => {
    const mapeada = mapLinha(
      {
        profile_id: 'u-bruno',
        agg_date: '2026-11-24',
        sessions_opened: 45,
        ticks_processed: 88,
        insights_gen: 285,
        brinde_complete: 3,
        avg_temperature: '16.75',
      },
      NOMES,
    );
    expect(mapeada.atendente).toBe('Bruno');
    expect(mapeada.temperaturaMedia).toBeCloseTo(16.75);
    expect(mapeada).toMatchObject({ dia: '2026-11-24', sessoes: 45, ticks: 88, insights: 285, brindes: 3 });
  });

  it('sem nome no perfil nao inventa identidade nem quebra', () => {
    const mapeada = mapLinha(
      {
        profile_id: 'u-desconhecido',
        agg_date: '2026-11-24',
        sessions_opened: 0,
        ticks_processed: 0,
        insights_gen: 0,
        brinde_complete: 0,
        avg_temperature: null,
      },
      NOMES,
    );
    expect(mapeada.atendente).toBe('Atendente sem nome');
    expect(mapeada.temperaturaMedia).toBeNull();
  });
});

describe('resumirRetencao', () => {
  it('soma a janela inteira e conta atendentes e dias distintos', () => {
    const resumo = resumirRetencao([
      linha(),
      linha({ dia: '2026-11-24', sessoes: 5, ticks: 5, insights: 5 }),
      linha({ profileId: 'u-bruno', atendente: 'Bruno', sessoes: 1, ticks: 0, insights: 0 }),
    ]);
    expect(resumo).toMatchObject({
      atendentes: 2,
      diasComDados: 2,
      sessoes: 16,
      ticks: 25,
      insights: 35,
    });
  });

  it('temperatura media e ponderada pelas sessoes, nao media das medias', () => {
    const resumo = resumirRetencao([
      linha({ dia: '2026-11-25', sessoes: 90, temperaturaMedia: 20 }),
      linha({ dia: '2026-11-24', sessoes: 10, temperaturaMedia: 10 }),
    ]);
    // media simples daria 15; ponderada e 19
    expect(resumo.temperaturaMedia).toBeCloseTo(19);
  });

  it('dia sem sessoes nao puxa a temperatura para baixo', () => {
    const resumo = resumirRetencao([
      linha({ dia: '2026-11-25', sessoes: 0, temperaturaMedia: null }),
      linha({ dia: '2026-11-24', sessoes: 4, temperaturaMedia: 25 }),
    ]);
    expect(resumo.temperaturaMedia).toBeCloseTo(25);
  });

  it('janela sem dados devolve zero e temperatura nula', () => {
    expect(resumirRetencao([])).toEqual({
      atendentes: 0,
      sessoes: 0,
      ticks: 0,
      insights: 0,
      brindes: 0,
      temperaturaMedia: null,
      diasComDados: 0,
    });
  });
});

describe('agruparPorAtendente', () => {
  it('ordena pelo mais ativo e conta os dias de cada atendente', () => {
    const grupos = agruparPorAtendente([
      linha({ profileId: 'u-bruno', atendente: 'Bruno', dia: '2026-11-25', sessoes: 2 }),
      linha({ profileId: 'u-ana', atendente: 'Ana', dia: '2026-11-25', sessoes: 10 }),
      linha({ profileId: 'u-ana', atendente: 'Ana', dia: '2026-11-24', sessoes: 8 }),
    ]);
    expect(grupos.map((g) => g.atendente)).toEqual(['Ana', 'Bruno']);
    expect(grupos[0]).toMatchObject({ sessoes: 18, ticks: 40, insights: 60, diasComDados: 2 });
    expect(grupos[1]).toMatchObject({ sessoes: 2, diasComDados: 1 });
  });
});

describe('agruparPorDia', () => {
  it('soma por dia, conta atendentes distintos e vem do mais recente para o mais antigo', () => {
    const dias = agruparPorDia([
      linha({ dia: '2026-11-24', sessoes: 5 }),
      linha({ dia: '2026-11-25', sessoes: 10 }),
      linha({ dia: '2026-11-25', profileId: 'u-bruno', atendente: 'Bruno', sessoes: 3 }),
    ]);
    expect(dias.map((d) => d.dia)).toEqual(['2026-11-25', '2026-11-24']);
    expect(dias[0]).toMatchObject({ sessoes: 13, ticks: 40, insights: 60, atendentes: 2 });
    expect(dias[1]).toMatchObject({ sessoes: 5, atendentes: 1 });
  });
});
