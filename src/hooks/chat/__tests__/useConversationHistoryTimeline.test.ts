import { describe, it, expect } from 'vitest';
import { buildTimeline, type TimelineRawRows } from '@/hooks/chat/useConversationHistoryTimeline';

function emptyRows(overrides: Partial<TimelineRawRows> = {}): TimelineRawRows {
  return { messages: [], events: [], notes: [], tasks: [], deals: [], activities: [], ...overrides };
}

describe('buildTimeline', () => {
  it('agrupa mensagens consecutivas do mesmo remetente em <=10min numa unica rajada', () => {
    const rows = emptyRows({
      messages: [
        { id: 'm1', sender: 'contact', content: 'Oi', media_url: null, media_filename: null, media_size: null, created_at: '2026-09-08T10:00:00Z' },
        { id: 'm2', sender: 'contact', content: 'Tudo bem?', media_url: null, media_filename: null, media_size: null, created_at: '2026-09-08T10:05:00Z' },
        { id: 'm3', sender: 'agent', content: 'Oi! Tudo sim', media_url: null, media_filename: null, media_size: null, created_at: '2026-09-08T10:20:00Z' },
      ],
    });
    const { days } = buildTimeline(rows);
    const events = days.flatMap((d) => d.events);
    expect(events).toHaveLength(2);
    const burst = events.find((e) => e.count === 2);
    expect(burst?.title).toBe('2 mensagens recebidas');
    expect(burst?.kind).toBe('message_in');
  });

  it('nao agrupa mensagens do mesmo remetente além de 10 minutos', () => {
    const rows = emptyRows({
      messages: [
        { id: 'm1', sender: 'contact', content: 'Oi', media_url: null, media_filename: null, media_size: null, created_at: '2026-09-08T10:00:00Z' },
        { id: 'm2', sender: 'contact', content: 'Ainda aí?', media_url: null, media_filename: null, media_size: null, created_at: '2026-09-08T10:15:00Z' },
      ],
    });
    const { days } = buildTimeline(rows);
    const events = days.flatMap((d) => d.events);
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.count === undefined)).toBe(true);
  });

  it('agrupa eventos por dia (yyyy-MM-dd)', () => {
    const rows = emptyRows({
      messages: [
        { id: 'm1', sender: 'contact', content: 'Dia 1', media_url: null, media_filename: null, media_size: null, created_at: '2026-09-07T10:00:00Z' },
        { id: 'm2', sender: 'contact', content: 'Dia 2', media_url: null, media_filename: null, media_size: null, created_at: '2026-09-08T10:00:00Z' },
      ],
    });
    const { days } = buildTimeline(rows);
    expect(days.map((d) => d.date).sort()).toEqual(['2026-09-07', '2026-09-08']);
  });

  it('filtra por tipo — "notes" só retorna eventos de nota', () => {
    const rows = emptyRows({
      messages: [{ id: 'm1', sender: 'contact', content: 'oi', media_url: null, media_filename: null, media_size: null, created_at: '2026-09-08T10:00:00Z' }],
      notes: [{ id: 'n1', content: 'nota', created_at: '2026-09-08T11:00:00Z' }],
    });
    const { days } = buildTimeline(rows, { type: 'notes' });
    const events = days.flatMap((d) => d.events);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('note');
  });

  it('tempo médio de resposta: média dos deltas contact -> próxima mensagem do agente', () => {
    const rows = emptyRows({
      messages: [
        { id: 'm1', sender: 'contact', content: 'oi', media_url: null, media_filename: null, media_size: null, created_at: '2026-09-08T10:00:00Z' },
        { id: 'm2', sender: 'agent', content: 'oi!', media_url: null, media_filename: null, media_size: null, created_at: '2026-09-08T10:05:00Z' }, // 5min
        { id: 'm3', sender: 'contact', content: 'tudo bem?', media_url: null, media_filename: null, media_size: null, created_at: '2026-09-08T11:00:00Z' },
        { id: 'm4', sender: 'agent', content: 'sim', media_url: null, media_filename: null, media_size: null, created_at: '2026-09-08T11:15:00Z' }, // 15min
      ],
    });
    const { metrics } = buildTimeline(rows);
    expect(metrics.avgResponseMin).toBe(10); // (5+15)/2
  });

  it('resoluções conta event_type=close (nao existe resolve/resolved no schema real)', () => {
    const rows = emptyRows({
      events: [
        { id: 'e1', event_type: 'close', created_at: '2026-09-08T10:00:00Z' },
        { id: 'e2', event_type: 'reopen', created_at: '2026-09-08T11:00:00Z' },
        { id: 'e3', event_type: 'close', created_at: '2026-09-08T12:00:00Z' },
      ],
    });
    const { metrics } = buildTimeline(rows);
    expect(metrics.resolutions).toBe(2);
  });

  it('limite de 200 eventos define hasMore', () => {
    const messages = Array.from({ length: 250 }, (_, i) => ({
      id: `m${i}`, sender: i % 2 === 0 ? 'contact' : 'agent', content: `msg ${i}`,
      media_url: null, media_filename: null, media_size: null,
      created_at: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString(),
    }));
    const { hasMore, days } = buildTimeline(emptyRows({ messages }), { limit: 200 });
    expect(hasMore).toBe(true);
    expect(days.flatMap((d) => d.events).length).toBeLessThanOrEqual(200);
  });

  it('sem dados: dias vazios e métricas honestas (null, nao inventadas)', () => {
    const { days, metrics } = buildTimeline(emptyRows());
    expect(days).toEqual([]);
    expect(metrics).toEqual({ total: 0, lastContactAt: null, avgResponseMin: null, avgResponsePrevMin: null, resolutions: 0 });
  });
});
