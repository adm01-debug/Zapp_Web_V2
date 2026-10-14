// O hook de previsão de demanda deixou de ler 7 dias de linhas cruas de `messages`
// (o corte silencioso de 1000 do PostgREST encurtava a janela) e passou a consumir a
// RPC dashboard_heatmap, agregada por (dia da semana, hora) no fuso do APP.
//
// TZ forçado a UTC de propósito: com Date#getHours (fuso do dispositivo) os rótulos
// da previsão sairiam em outro fuso e o VolumeChart plotaria o pico na hora errada.
process.env.TZ = 'UTC';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { TestQueryWrapper } from '@/test/mocks/queryClient';
import {
  buildDemandInsights,
  generatePredictionFromHistory,
  hourlyProfileFromHeatmap,
  useDemandPrediction,
} from '../useDemandPrediction';

const h = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: h.rpc,
    from: () => {
      throw new Error('a previsão nao pode mais ler `messages` direto no cliente');
    },
  },
}));

describe('useDemandPrediction — dados do servidor (dashboard_heatmap)', () => {
  beforeEach(() => {
    h.rpc.mockReset();
  });

  it('media por hora = soma da hora no bucket do servidor / 28 dias', () => {
    const perfil = hourlyProfileFromHeatmap(
      [
        { dow: 1, hour: 9, value: 14 },
        { dow: 3, hour: 9, value: 14 },
        { dow: 0, hour: 23, value: 28 },
      ],
      28,
    );

    expect(perfil).toHaveLength(24);
    expect(perfil[9]).toEqual({ hour: 9, count: 1 });
    expect(perfil[23]).toEqual({ hour: 23, count: 1 });
    expect(perfil[0]).toEqual({ hour: 0, count: 0 });
  });

  it('rotula a linha do tempo na hora do APP, nao no fuso do dispositivo (TZ=UTC)', () => {
    // 2026-10-14T02:30Z = 13/10/2026 23:30 em America/Sao_Paulo (UTC-3).
    const now = new Date('2026-10-14T02:30:00.000Z');
    const pontos = generatePredictionFromHistory([{ hour: 23, count: 5 }], now);

    // 5 horas observadas + 4 previstas
    expect(pontos.map(p => p.time)).toEqual([
      '19:00', '20:00', '21:00', '22:00', '23:00', '00:00', '01:00', '02:00', '03:00',
    ]);

    // a hora corrente de Sao Paulo e 23h, e e ali que esta a mensagem — com getHours()
    // (UTC) o ponto corrente seria rotulado 02:00 e a contagem cairia na hora errada.
    const corrente = pontos.find(p => !p.isPrediction && p.time === '23:00');
    expect(corrente?.actual).toBe(5);
    expect(pontos[pontos.length - 1].isPrediction).toBe(true);
  });

  it('sem previsao devolve Estavel e zeros, nunca NaN/Infinity nem TypeError', () => {
    const insights = buildDemandInsights([], 35);

    expect(insights).toEqual({
      maxPredicted: 0, avgPredicted: 0, currentActual: 0,
      trend: 'stable', peakTime: '', capacityRisk: false,
    });
    expect(Number.isNaN(insights.maxPredicted)).toBe(false);
    expect(Number.isFinite(insights.avgPredicted)).toBe(true);
  });

  it('com previsao acima da atual aponta tendencia de alta e risco de capacidade', () => {
    // a ultima hora prevista (03:00 em SP) tem 40 mensagens contra 0 na hora observada
    const pontos = generatePredictionFromHistory([{ hour: 3, count: 40 }], new Date('2026-10-14T02:30:00.000Z'));
    const insights = buildDemandInsights(pontos, 35);

    expect(insights.trend).toBe('up');
    expect(insights.capacityRisk).toBe(true);
    expect(insights.maxPredicted).toBe(40);
    expect(insights.peakTime).toBe('03:00');
  });

  it('o hook real consome a RPC com a janela de 28 dias e nao toca em `messages`', async () => {
    h.rpc.mockResolvedValue({ data: [{ dow: 1, hour: 9, value: 28 }], error: null });

    const { result } = renderHook(() => useDemandPrediction(), { wrapper: TestQueryWrapper });

    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith('dashboard_heatmap', { dias: 28 }));
    await waitFor(() => expect(result.current.data).toHaveLength(9));
  });
});
