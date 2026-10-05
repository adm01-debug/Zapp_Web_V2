import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/lib/supabaseHelpers', () => ({ fromTable: vi.fn() }));

import {
  pickBestHour,
  pickBestTemplate,
  countLowClickCampaigns,
  buildInsights,
  HOUR_MIN_SAMPLE,
  type InsightRaw,
} from '@/hooks/integrations/useTalkXInsights';

// IA-TALKX-001 (IA-167): a hora sugerida era lida no fuso do dispositivo e a
// amostra (teto de 2000 envios) não era exposta. Aqui: hora em America/Sao_Paulo,
// amostra mínima por hora e abstenção quando não há base suficiente.
describe('pickBestHour (IA-167)', () => {
  // 2026-10-04T01:30Z = 2026-10-03 22:30 em America/Sao_Paulo (UTC-3).
  const AT_22H_SP = '2026-10-04T01:30:00.000Z';
  const AT_00H_SP = '2026-10-04T03:00:00.000Z';

  it('usa a hora em America/Sao_Paulo e expõe a amostra', () => {
    const rows = [
      ...Array.from({ length: 9 }, () => ({ sent_at: AT_22H_SP, replied_at: null })),
      { sent_at: AT_22H_SP, replied_at: AT_22H_SP },
      { sent_at: AT_22H_SP, replied_at: AT_22H_SP },
      { sent_at: AT_22H_SP, replied_at: AT_22H_SP },
      // hora 00:00 de São Paulo (03:00Z) — sem amostra mínima, não concorre
      { sent_at: AT_00H_SP, replied_at: AT_00H_SP },
    ];
    const best = pickBestHour(rows);
    expect(best?.hour).toBe(22);
    expect(best?.sample).toBe(12);
    expect(best?.replyRate).toBeCloseTo(3 / 12, 5);
  });

  it('abstém-se quando nenhuma hora alcança a amostra mínima', () => {
    const rows = Array.from({ length: HOUR_MIN_SAMPLE - 1 }, () => ({ sent_at: AT_22H_SP, replied_at: AT_22H_SP }));
    expect(pickBestHour(rows)).toBeNull();
  });
});

// IA-TALKX-001 (IA-168): "maior engajamento" era escolhido por número absoluto de
// respostas, não por taxa. A seleção passa a usar replied/sent com denominador mínimo.
describe('pickBestTemplate (IA-168)', () => {
  it('escolhe pela taxa com denominador, não pelo volume absoluto de respostas', () => {
    const best = pickBestTemplate([
      { id: 'grande', campaign_name: 'Grande', replied_count: 50, sent_count: 1000 }, // 5%
      { id: 'pequena', campaign_name: 'Pequena', replied_count: 9, sent_count: 20 },  // 45%
      { id: 'sem_envios', campaign_name: 'Mínima', replied_count: 9, sent_count: 9 }, // < mínimo
    ]);
    expect(best?.campaignId).toBe('pequena');
    expect(best?.sent).toBe(20);
    expect(best?.replied).toBe(9);
  });

  it('sem nenhuma resposta fica nulo', () => {
    expect(pickBestTemplate([{ id: 'a', campaign_name: 'A', replied_count: 0, sent_count: 100 }])).toBeNull();
  });
});

// IA-TALKX-001 (IA-168): lowClickCampaigns contava TODA campanha "finished" — o
// rótulo dizia "baixo clique" sem medir clique. Agora filtra por taxa de clique.
describe('countLowClickCampaigns (IA-168)', () => {
  const campaigns = [
    { id: 'a', sent_count: 100 }, // 1 clique → 1% baixo
    { id: 'b', sent_count: 100 }, // 10 cliques → 10% ok
    { id: 'c', sent_count: 100 }, // 4 cliques → 4% baixo
    { id: 'd', sent_count: 5 },   // abaixo do mínimo de envios → fora
  ];

  it('conta só campanhas com taxa de clique baixa', () => {
    const clicks = new Map<string, number>([['a', 1], ['b', 10], ['c', 4], ['d', 0]]);
    expect(countLowClickCampaigns(campaigns, clicks)).toBe(2);
  });

  it('sem clique algum, toda campanha elegível conta como baixo clique', () => {
    expect(countLowClickCampaigns(campaigns, new Map())).toBe(3);
  });
});

// IA-TALKX-001: o nome do insight tem de corresponder ao cálculo e expor a amostra.
describe('buildInsights (rótulos correspondem ao cálculo)', () => {
  const base: InsightRaw = {
    bestHour: null, bestTemplate: null, inactiveContactPct: null,
    lowClickCampaigns: 0, finishedCampaigns: 0, avgClickRate: 0,
  };

  it('insight de template expõe a amostra (replied de sent)', () => {
    const out = buildInsights({ ...base, bestTemplate: { name: 'X', replyRate: 0.4, campaignId: 'c1', sent: 20, replied: 8 } });
    const t = out.find((i) => i.id === 'best-template');
    expect(t?.description).toContain('8 de 20 envios');
  });

  it('insight de horário declara correlação (não promessa) e a amostra', () => {
    const out = buildInsights({ ...base, bestHour: { hour: 22, replyRate: 0.1, sample: 42 } });
    const t = out.find((i) => i.id === 'best-hour');
    expect(t?.description).toContain('amostra: 42 envios');
    expect(t?.description).toContain('correlação histórica');
  });

  it('insight de baixo clique expõe concluídas e quantas ficaram abaixo', () => {
    const out = buildInsights({ ...base, avgClickRate: 0.02, lowClickCampaigns: 3, finishedCampaigns: 7 });
    const t = out.find((i) => i.id === 'low-clicks');
    expect(t?.description).toContain('Nas 7 campanhas concluídas');
    expect(t?.description).toContain('3 ficaram abaixo');
  });
});
