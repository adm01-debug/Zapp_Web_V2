import { describe, it, expect } from 'vitest';
import { aggregateCrm360 } from '@/hooks/crm/useContactCrm360';

describe('aggregateCrm360', () => {
  it('retorna estado vazio honesto quando nao ha dados', () => {
    const result = aggregateCrm360({ deals: [], stages: [], tagNames: [], activities: [], events: [] });
    expect(result.currentStage).toBeNull();
    expect(result.currentDeal).toBeNull();
    expect(result.interesses).toEqual([]);
    expect(result.pipeline).toEqual({
      propostas: { total: 0, count: 0 },
      negociacao: { total: 0, count: 0 },
      ganhos: { total: 0, count: 0 },
    });
    expect(result.resumo).toEqual({ propostas: 0, emAberto: 0 });
  });

  it('agrupa deals abertos em propostas (etapa com nome "propost") vs negociação', () => {
    const stages = [
      { id: 's1', name: 'Lead', position: 1, is_active: true },
      { id: 's2', name: 'Proposta enviada', position: 2, is_active: true },
      { id: 's3', name: 'Negociação', position: 3, is_active: true },
    ];
    const deals = [
      { id: 'd1', title: 'Deal proposta', value: 1000, status: 'open', stage_id: 's2', expected_close_date: null, updated_at: '2026-09-01' },
      { id: 'd2', title: 'Deal negociação', value: 2000, status: 'open', stage_id: 's3', expected_close_date: null, updated_at: '2026-09-02' },
      { id: 'd3', title: 'Deal ganho', value: 3000, status: 'won', stage_id: 's3', expected_close_date: null, updated_at: '2026-09-03' },
    ];
    const result = aggregateCrm360({ deals, stages, tagNames: [], activities: [], events: [] });
    expect(result.pipeline.propostas).toEqual({ total: 1000, count: 1 });
    expect(result.pipeline.negociacao).toEqual({ total: 2000, count: 1 });
    expect(result.pipeline.ganhos).toEqual({ total: 3000, count: 1 });
    // etapa atual = deal aberto com updated_at mais recente
    expect(result.currentDeal?.id).toBe('d2');
    expect(result.currentStage?.id).toBe('s3');
  });

  it('últimas interações mescla atividades de deal + eventos de transferência/encerramento, mais recentes primeiro, limitado a 4', () => {
    const events = [
      { id: 'e1', event_type: 'transfer', created_at: '2026-09-05T10:00:00Z' },
      { id: 'e2', event_type: 'assign', created_at: '2026-09-06T10:00:00Z' }, // filtrado: nao é transfer/close/reopen
    ];
    const activities = [
      { id: 'a1', deal_id: 'd1', activity_type: 'note', description: 'Ligação realizada', created_at: '2026-09-04T10:00:00Z' },
    ];
    const result = aggregateCrm360({ deals: [], stages: [], tagNames: [], activities, events });
    expect(result.interacoes.map((i) => i.id)).toEqual(['event-e1', 'activity-a1']);
  });

  it('produtos de interesse: dedup e limitado a 3', () => {
    const result = aggregateCrm360({
      deals: [], stages: [],
      tagNames: ['VIP', 'VIP', 'Catálogo', 'Personalização', 'Alta prioridade'],
      activities: [], events: [],
    });
    expect(result.interesses).toEqual(['VIP', 'Catálogo', 'Personalização']);
  });
});
