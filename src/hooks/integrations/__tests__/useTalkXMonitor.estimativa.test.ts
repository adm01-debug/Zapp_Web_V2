import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildRateByMinute,
  buildSegmentQueue,
  countRemaining,
  estimateFinishMinutes,
  measureRatePerMinute,
} from '../useTalkXMonitor';

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

/** "Agora" fixo para os testes de média/UTC (sem flutuação de relógio). */
const FIXED_NOW = new Date('2026-10-10T12:00:00.000Z').getTime();
const isoAt = (ms: number) => new Date(ms).toISOString();
const minBefore = (m: number) => isoAt(FIXED_NOW - m * 60_000);

afterEach(() => {
  vi.restoreAllMocks();
});

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

describe('measureRatePerMinute — taxa MÉDIA desde o início (ponto 1)', () => {
  it('sem envios → 0', () => {
    expect(measureRatePerMinute([])).toBe(0);
    expect(measureRatePerMinute([{ sent_at: null, delivered_at: null }])).toBe(0);
  });

  it('campanha longa: total ÷ minutos desde o started_at', () => {
    // 15 envios no total, campanha iniciada há 170 min → 15/170.
    // A janela deslizante diria 5/5 = 1 (só os 5 recentes ÷ 5 min).
    const data = [
      ...Array.from({ length: 10 }, () => ({ sent_at: minBefore(100), delivered_at: null })),
      ...Array.from({ length: 5 }, () => ({ sent_at: minBefore(5), delivered_at: null })),
    ];
    expect(measureRatePerMinute(data, FIXED_NOW, minBefore(170))).toBeCloseTo(15 / 170, 6);
  });

  it('sem started_at, a âncora é o primeiro envio (toda a campanha)', () => {
    // 2 envios (100 e 5 min atrás) → 2/100. A janela diria 1/5.
    const data = [
      { sent_at: minBefore(100), delivered_at: null },
      { sent_at: minBefore(5), delivered_at: null },
    ];
    expect(measureRatePerMinute(data, FIXED_NOW)).toBeCloseTo(2 / 100, 6);
  });

  it('started_at inválido cai no primeiro envio', () => {
    const data = [{ sent_at: minBefore(40), delivered_at: null }];
    expect(measureRatePerMinute(data, FIXED_NOW, 'não-é-data')).toBeCloseTo(1 / 40, 6);
  });
});

describe('countRemaining — restante real exclui entrega incerta (ponto 2)', () => {
  it('outcome_unknown saiu da fila: não é restante', () => {
    const recipients = [
      { status: 'pending' },
      { status: 'sending' },
      { status: 'sent' },
      { status: 'delivered' },
      { status: 'failed' },
      { status: 'outcome_unknown' },
      { status: 'skipped' },
    ];
    // restantes: pending + sending + failed + skipped = 4
    expect(countRemaining(recipients)).toBe(4);
  });

  it('só incertos → restante zero (há o que confirmar, não o que enviar)', () => {
    expect(countRemaining([{ status: 'outcome_unknown' }, { status: 'sent' }])).toBe(0);
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
      expect(p.Previsto).toBe(1); // 2 envios / 2 min desde o primeiro envio
      expect(p.Enviadas).toBe(1);
    }
  });

  it('Previsto usa a média desde o started_at em campanha longa (ponto 1)', () => {
    // 10 envios no total, início há 170 min → média 10/170 ≈ 0.059 → 0.1.
    // Só o envio recente aparece nos buckets, mas a média conta tudo.
    const data = [
      ...Array.from({ length: 9 }, () => ({ sent_at: minBefore(100), delivered_at: null })),
      { sent_at: minBefore(5), delivered_at: null },
    ];
    const pontos = buildRateByMinute(data, { startedAt: minBefore(170), now: FIXED_NOW });
    expect(pontos).toHaveLength(1);
    expect(pontos[0].Previsto).toBe(0.1);
  });

  it('rótulos em UTC (HH:MM), imunes ao fuso local (ponto 3)', () => {
    // Sabota o relógio local: se o código usar getHours/getMinutes, sai "99:99".
    vi.spyOn(Date.prototype, 'getHours').mockReturnValue(99);
    vi.spyOn(Date.prototype, 'getMinutes').mockReturnValue(99);
    const now = new Date('2026-10-10T12:10:00.000Z').getTime();
    const pontos = buildRateByMinute(
      [
        { sent_at: '2026-10-10T11:55:00.000Z', delivered_at: null },
        { sent_at: '2026-10-10T12:05:00.000Z', delivered_at: null },
      ],
      { now },
    );
    expect(pontos.map((p) => p.label)).toEqual(['11:55', '12:05']);
  });

  it('Previsto arredonda para 1 casa: 10 envios em 3 min → 3.3 (ponto 4)', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      sent_at: isoAt(FIXED_NOW - (180 - i * 18) * 1000),
      delivered_at: null,
    }));
    const pontos = buildRateByMinute(data, { now: FIXED_NOW });
    expect(pontos.length).toBeGreaterThan(0);
    for (const p of pontos) expect(p.Previsto).toBe(3.3); // 10/3 = 3.333…
  });

  it('Previsto é sempre o ritmo total medido (B1: nenhum teto limita a série)', () => {
    // média: 2 envios / 2 min desde o primeiro envio = 1, com ou sem opções.
    const mk = () => [
      { sent_at: minBefore(2), delivered_at: null },
      { sent_at: minBefore(1), delivered_at: null },
    ];
    for (const opts of [undefined, {}, { now: FIXED_NOW }]) {
      const pontos = buildRateByMinute(mk(), { ...opts, now: FIXED_NOW });
      expect(pontos).toHaveLength(2);
      expect(pontos.every((p) => p.Previsto === 1)).toBe(true);
    }
  });

  it('com started_at, Previsto usa a média desde o início (B1)', () => {
    // 2 envios, início há 30 min → 2/30 ≈ 0.067 → 0.1.
    const data = [
      { sent_at: minBefore(2), delivered_at: null },
      { sent_at: minBefore(1), delivered_at: null },
    ];
    const pontos = buildRateByMinute(data, { startedAt: minBefore(30), now: FIXED_NOW });
    expect(pontos).toHaveLength(2);
    expect(pontos.every((p) => p.Previsto === 0.1)).toBe(true);
  });

  it('Previsto do gráfico converge com a taxa do painel (mesma média, ponto 4)', () => {
    // A taxa do painel e o Previsto do gráfico bebem da mesma média: o
    // Previsto de cada ponto é a taxa arredondada para 1 casa.
    const data = [
      ...Array.from({ length: 9 }, () => ({ sent_at: minBefore(100), delivered_at: null })),
      { sent_at: minBefore(5), delivered_at: null },
    ];
    const startedAt = minBefore(170);
    const taxa = measureRatePerMinute(data, FIXED_NOW, startedAt);
    const pontos = buildRateByMinute(data, { startedAt, now: FIXED_NOW });
    expect(pontos.length).toBeGreaterThan(0);
    for (const p of pontos) expect(p.Previsto).toBe(Math.round(taxa * 10) / 10);
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

  it('outcome_unknown não conta como restante do segmento (ponto 2)', () => {
    const fila = buildSegmentQueue(
      [
        { segment_id: 'seg-a', status: 'outcome_unknown' },
        { segment_id: 'seg-a', status: 'pending' },
      ],
      names,
    );
    expect(fila).toEqual([
      { segmentId: 'seg-a', name: 'Clientes VIP', total: 2, sent: 0, remaining: 1, progress: 0 },
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

  it('duas páginas: o mesmo segmento soma ao cruzar as páginas (ponto 3)', () => {
    // A rolagem pagina a fila: a prova combina as duas páginas como o hook entrega.
    const pagina1 = [
      { segment_id: 'seg-a', status: 'sent' },
      { segment_id: 'seg-a', status: 'pending' },
    ];
    const pagina2 = [
      { segment_id: 'seg-a', status: 'pending' },
      { segment_id: 'seg-b', status: 'sent' },
    ];
    // Sozinha, a página 1 diria total 2 para seg-a — sem cruzar, a fila mente.
    expect(buildSegmentQueue(pagina1, names).find((f) => f.segmentId === 'seg-a')?.total).toBe(2);
    const fila = buildSegmentQueue([...pagina1, ...pagina2], names);
    expect(fila.find((f) => f.segmentId === 'seg-a')).toMatchObject({ total: 3, sent: 1, remaining: 2 });
    expect(fila.find((f) => f.segmentId === 'seg-b')).toMatchObject({ total: 1, sent: 1, remaining: 0 });
  });
});

describe('término estimado exclui entrega incerta (pontos 2+4)', () => {
  it('outcome_unknown não entra no restante nem no término (E[X] exclui X)', () => {
    // 6 envios em 6 min → 1/min; 2 pendentes + 1 incerto na fila.
    const enviados = Array.from({ length: 6 }, (_, i) => ({
      status: 'sent',
      sent_at: minBefore(6 - i),
      delivered_at: null,
    }));
    const fila = [
      ...enviados,
      { status: 'pending', sent_at: null, delivered_at: null },
      { status: 'pending', sent_at: null, delivered_at: null },
      { status: 'outcome_unknown', sent_at: null, delivered_at: null },
    ];
    const restante = countRemaining(fila);
    expect(restante).toBe(2); // o incerto saiu da fila: não soma no restante
    const taxa = measureRatePerMinute(fila, FIXED_NOW, minBefore(6));
    expect(taxa).toBeCloseTo(1, 6);
    // Se o incerto contasse, o término diria 3 min; diz 2.
    expect(estimateFinishMinutes(restante, taxa)).toBeCloseTo(2, 6);
  });
});
