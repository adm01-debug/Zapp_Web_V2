import { describe, it, expect } from 'vitest';
import {
  buildRateByMinute,
  buildSegmentQueue,
  estimateFinishMinutes,
  measureRatePerMinute,
} from '../useTalkXMonitor';

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

describe('estimateFinishMinutes — término estimado (X147)', () => {
  it('taxa constante: restantes ÷ taxa', () => {
    // 300 enviadas em 30 min = 10/min; 200 restantes → 20 min
    expect(estimateFinishMinutes(200, 10)).toBeCloseTo(20, 6);
  });

  it('arredonda no formato: 7 restantes a 2/min → 3.5 min', () => {
    expect(estimateFinishMinutes(7, 2)).toBeCloseTo(3.5, 6);
  });

  it('sem taxa (> 0) não há estimativa', () => {
    expect(estimateFinishMinutes(500, 0)).toBeNull();
  });

  it('fila já vencida → 0 min', () => {
    expect(estimateFinishMinutes(0, 10)).toBe(0);
    expect(estimateFinishMinutes(-5, 10)).toBe(0);
  });
});

describe('measureRatePerMinute — taxa medida na janela', () => {
  it('sem envios na janela → 0', () => {
    expect(measureRatePerMinute([])).toBe(0);
    expect(measureRatePerMinute([{ sent_at: null, delivered_at: null }])).toBe(0);
  });

  it('envios fora da janela de 60 min não contam', () => {
    const data = [
      { sent_at: minutesAgo(90), delivered_at: null },
      { sent_at: minutesAgo(30), delivered_at: null },
    ];
    // só 1 envio dentro da janela, na marca de 30 min → 1/30
    expect(measureRatePerMinute(data)).toBeCloseTo(1 / 30, 6);
  });
});

describe('buildRateByMinute — série Previsto (X147)', () => {
  it('Previsto é a média medida quando não há teto configurado', () => {
    const data = [
      { sent_at: minutesAgo(2), delivered_at: null },
      { sent_at: minutesAgo(1), delivered_at: null },
    ];
    const pontos = buildRateByMinute(data);
    expect(pontos).toHaveLength(2);
    for (const p of pontos) {
      expect(p.Previsto).toBe(1); // 2 envios / 2 min de janela
      expect(p.Enviadas).toBe(1);
    }
  });

  it('Previsto nunca passa do teto (max_per_minute) da campanha', () => {
    const data = [
      { sent_at: minutesAgo(2), delivered_at: null },
      { sent_at: minutesAgo(1), delivered_at: null },
    ];
    const pontos = buildRateByMinute(data, { throttlePerMinute: 0.5 });
    expect(pontos.every((p) => p.Previsto === 0.5)).toBe(true);
  });

  it('acima do teto, Previsto segue a média medida', () => {
    const data = [
      { sent_at: minutesAgo(2), delivered_at: null },
      { sent_at: minutesAgo(1), delivered_at: null },
    ];
    const pontos = buildRateByMinute(data, { throttlePerMinute: 20 });
    expect(pontos.every((p) => p.Previsto === 1)).toBe(true);
  });

  it('sem envios na janela → série vazia', () => {
    expect(buildRateByMinute([{ sent_at: null, delivered_at: null }])).toEqual([]);
  });
});

describe('buildSegmentQueue — Fila por Segmento (T11-046..052)', () => {
  const names = new Map([['seg-a', 'Clientes VIP'], ['seg-b', 'Novos']]);

  it('agrupa por segment_id com total/enviadas/restante/progresso', () => {
    const fila = buildSegmentQueue(
      [
        { segment_id: 'seg-a', status: 'delivered' },
        { segment_id: 'seg-a', status: 'pending' },
        { segment_id: 'seg-b', status: 'sent' },
      ],
      names,
    );

    expect(fila).toEqual([
      { segmentId: 'seg-a', name: 'Clientes VIP', total: 2, sent: 1, remaining: 1, progress: 50 },
      { segmentId: 'seg-b', name: 'Novos', total: 1, sent: 1, remaining: 0, progress: 100 },
    ]);
  });

  it('destinatário sem segmento cai em "Sem segmento" e vai por último', () => {
    const fila = buildSegmentQueue(
      [
        { segment_id: null, status: 'pending' },
        { segment_id: 'seg-b', status: 'pending' },
      ],
      names,
    );
    expect(fila.map((f) => f.name)).toEqual(['Novos', 'Sem segmento']);
    expect(fila[1]).toMatchObject({ segmentId: null, total: 1, sent: 0, remaining: 1, progress: 0 });
  });

  it('sem nome conhecido, usa o id curto como fallback', () => {
    const fila = buildSegmentQueue([{ segment_id: 'abcdef123456', status: 'pending' }]);
    expect(fila[0].name).toBe('abcdef12');
  });

  it('fila vazia → lista vazia', () => {
    expect(buildSegmentQueue([])).toEqual([]);
  });
});
