import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/lib/supabaseHelpers', () => ({ fromTable: vi.fn() }));

import { supabase } from '@/integrations/supabase/client';
import { fromTable } from '@/lib/supabaseHelpers';
import {
  pickBestHour,
  pickBestTemplate,
  countLowClickCampaigns,
  buildInsights,
  estimateLiftPct,
  fetchInsightData,
  CLICK_SAMPLE_LIMIT,
  HOUR_MIN_SAMPLE,
  LIFT_MAX,
  LIFT_MIN_FINISHED_CAMPAIGNS,
  METRIC_MIN_SENT,
  TALKX_COMPLETED_STATUS,
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
    lowClickCampaigns: 0, finishedCampaigns: 0, avgClickRate: 0, avgReplyRate: 0,
    clicksTruncated: false, clickError: false, campaignsTruncated: false,
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

  it('conjunto de cliques truncado no teto NÃO gera conclusão de baixo clique', () => {
    const out = buildInsights({ ...base, avgClickRate: 0.01, lowClickCampaigns: 9, finishedCampaigns: 12, clicksTruncated: true });
    expect(out.find((i) => i.id === 'low-clicks')).toBeUndefined();
  });

  it('falha na consulta de cliques NÃO gera conclusão de baixo clique', () => {
    const out = buildInsights({ ...base, avgClickRate: 0.01, lowClickCampaigns: 9, finishedCampaigns: 12, clickError: true });
    expect(out.find((i) => i.id === 'low-clicks')).toBeUndefined();
  });
});

// ─── Recusa do item #135: erro, truncagem e caminhos de fetchInsightData ──────
// Sem prova, as consultas novas podiam falhar e virar "nenhum insight" (zero
// silencioso), e o teto de cliques podia ser lido como total. Aqui cada caminho
// tem teste com uma consulta simulada.
type Res = { data?: unknown; count?: number | null; error?: unknown };

/** Builder encadeável e "thenable": simula o PostgREST sem rede. */
function chain(res: Res) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'not', 'gte', 'order', 'limit', 'lt', 'eq', 'in']) b[m] = () => b;
  b.then = (onOk: (v: Res) => unknown, onErr?: (e: unknown) => unknown) => Promise.resolve(res).then(onOk, onErr);
  return b;
}

const fromMock = supabase.from as unknown as ReturnType<typeof vi.fn>;
const fromTableMock = fromTable as unknown as ReturnType<typeof vi.fn>;

/** Filas de resposta por tabela; o join de cliques (fromTable) usa sufixo `_join`. */
function mockQueries(overrides: Record<string, Res[]> = {}) {
  const idx: Record<string, number> = {};
  const take = (key: string): Res => {
    const fila = overrides[key] ?? [{ data: [], error: null }];
    const i = idx[key] ?? 0;
    idx[key] = i + 1;
    return fila[Math.min(i, fila.length - 1)];
  };
  fromMock.mockImplementation((t: string) => chain(take(t)));
  fromTableMock.mockImplementation((t: string) => chain(take(`${t}_join`)));
}

const CONCLUIDAS = [
  { id: 'c1', sent_count: 100 },
  { id: 'c2', sent_count: 100 },
  { id: 'c3', sent_count: 100 },
];

const baseOk: Record<string, Res[]> = {
  talkx_recipients: [{ data: [], error: null }, { count: 200, error: null }],
  talkx_campaign_metrics: [{ data: [{ id: 'c1', campaign_name: 'A', replied_count: 9, sent_count: 20 }], error: null }],
  contacts: [{ count: 100, error: null }, { count: 50, error: null }],
  talkx_link_clicks: [{ count: 3, error: null }],
  talkx_campaigns: [{ data: CONCLUIDAS, error: null }],
  talkx_link_clicks_join: [{
    data: [
      { link_id: 'l1', talkx_links: { campaign_id: 'c1' } },
      { link_id: 'l1', talkx_links: { campaign_id: 'c1' } },
      { link_id: 'l2', talkx_links: { campaign_id: 'c2' } },
    ],
    error: null,
  }],
};

describe('fetchInsightData — robustez das consultas (recusa #135)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('1) erro da consulta principal sobe como erro em vez de virar insight zerado', async () => {
    mockQueries({ ...baseOk, talkx_recipients: [{ data: null, error: { message: 'boom' } }] });
    await expect(fetchInsightData()).rejects.toThrow(/falha ao consultar/);
  });

  it('2) erro no join de cliques marca clickError e suprime o baixo clique', async () => {
    mockQueries({ ...baseOk, talkx_link_clicks_join: [{ data: null, error: { message: 'rls negou' } }] });
    const raw = await fetchInsightData();
    expect(raw.clickError).toBe(true);
    expect(raw.clicksTruncated).toBe(false);
    expect(raw.lowClickCampaigns).toBe(0);
    const out = buildInsights({ ...raw, avgClickRate: 0.01, lowClickCampaigns: 5 });
    expect(out.find((i) => i.id === 'low-clicks')).toBeUndefined();
  });

  it('3) teto de cliques atingido é truncagem: suprime a conclusão de baixo clique', async () => {
    const rows = Array.from({ length: CLICK_SAMPLE_LIMIT }, (_, i) => ({ link_id: `l${i}`, talkx_links: { campaign_id: 'c1' } }));
    mockQueries({ ...baseOk, talkx_link_clicks_join: [{ data: rows, error: null }] });
    const raw = await fetchInsightData();
    expect(raw.clicksTruncated).toBe(true);
    const out = buildInsights({ ...raw, avgClickRate: 0.01, lowClickCampaigns: 5 });
    expect(out.find((i) => i.id === 'low-clicks')).toBeUndefined();
  });

  it('4) conjunto íntegro alimenta o insight, com contagens coerentes', async () => {
    mockQueries(baseOk);
    const raw = await fetchInsightData();
    expect(raw.clickError).toBe(false);
    expect(raw.clicksTruncated).toBe(false);
    expect(raw.bestTemplate?.campaignId).toBe('c1');
    expect(raw.inactiveContactPct).toBeCloseTo(0.5, 5);
    expect(raw.finishedCampaigns).toBe(3); // campanhas concluídas (status='completed')
    expect(raw.lowClickCampaigns).toBe(3); // c1 2/100, c2 1/100, c3 0/100 — todos < 5%
    expect(buildInsights(raw).find((i) => i.id === 'low-clicks')).toBeDefined();
    expect(fromMock.mock.calls.some(([t]) => t === 'talkx_campaigns')).toBe(true);
  });

  it('5) teto de 500 campanhas concluídas não é tratado como conjunto íntegro', async () => {
    const campaignsAtLimit = Array.from({ length: 500 }, (_, i) => ({ id: `c${i}`, sent_count: 100 }));
    mockQueries({ ...baseOk, talkx_campaigns: [{ data: campaignsAtLimit, error: null }] });

    const raw = await fetchInsightData();

    expect(raw.finishedCampaigns).toBe(500);
    expect(raw.lowClickCampaigns).toBe(500);
    expect(buildInsights(raw).find((i) => i.id === 'low-clicks')).toBeUndefined();
  });
});

// ─── Cartão #223 (R2-API-049): métrica de engajamento, status vigente e erro ──
// A prova comportamental (pelo hook público, com o MESMO teste vermelho no código
// antigo) está em useTalkXInsights.engajamento.test.tsx. Aqui ficam as provas de
// unidade que vieram do trabalho anterior, reconciliadas com a implementação
// vigente do dia (denominador mínimo, desempate explícito, status 'completed',
// erro de leitura que sobe em vez de virar "sem dado").
describe('pickBestTemplate — métrica de engajamento e desempate (cartão #223)', () => {
  it('4/10 (40%) vence 5/100 (5%) mesmo com menos respostas', () => {
    expect(
      pickBestTemplate([
        { id: 'volume', campaign_name: 'Volume', replied_count: 5, sent_count: 100 },
        { id: 'taxa', campaign_name: 'Taxa', replied_count: 4, sent_count: 10 },
      ]),
    ).toEqual({ name: 'Taxa', replyRate: 0.4, campaignId: 'taxa', sent: 10, replied: 4 });
  });

  it('respeita a amostra mínima de envios', () => {
    expect(METRIC_MIN_SENT).toBe(10);
    expect(
      pickBestTemplate([{ id: 'a', campaign_name: 'A', replied_count: 9, sent_count: 9 }]),
    ).toBeNull();
    expect(
      pickBestTemplate([{ id: 'a', campaign_name: 'A', replied_count: 1, sent_count: 10 }]),
    ).toEqual({ name: 'A', replyRate: 0.1, campaignId: 'a', sent: 10, replied: 1 });
  });

  it('desempata por nº de respostas e depois por nº de envios (determinístico)', () => {
    expect(
      pickBestTemplate([
        { id: 'poucos', campaign_name: 'Poucos', replied_count: 5, sent_count: 10 },
        { id: 'muitos', campaign_name: 'Muitos', replied_count: 10, sent_count: 20 },
      ]),
    ).toEqual({ name: 'Muitos', replyRate: 0.5, campaignId: 'muitos', sent: 20, replied: 10 });
  });

  it('é determinístico para taxas iguais e mesmo tamanho (nome/id)', () => {
    const rows = [
      { id: 'z', campaign_name: 'Zeta', replied_count: 5, sent_count: 10 },
      { id: 'a', campaign_name: 'Alfa', replied_count: 5, sent_count: 10 },
    ];
    expect(pickBestTemplate(rows)?.campaignId).toBe('a');
    expect(pickBestTemplate([...rows].reverse())?.campaignId).toBe('a');
  });

  it('sem candidatos elegíveis devolve null (ausência real de dado)', () => {
    expect(pickBestTemplate([])).toBeNull();
    expect(
      pickBestTemplate([{ id: 'a', campaign_name: 'A', replied_count: 0, sent_count: 50 }]),
    ).toBeNull();
  });
});

describe('fetchInsightData — conjunto coerente (cartão #223)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cliques e enviados falam do mesmo conjunto: concluídas da janela, com amostra', async () => {
    mockQueries({
      talkx_recipients: [{ data: [], error: null }, { count: 40, error: null }],
      talkx_campaign_metrics: [{ data: [], error: null }],
      contacts: [{ count: 100, error: null }, { count: 10, error: null }],
      talkx_link_clicks: [{ count: 1, error: null }],
      talkx_link_clicks_join: [{ data: [], error: null }],
      talkx_campaigns: [{ data: CONCLUIDAS, error: null }],
    });

    const raw = await fetchInsightData();

    expect(TALKX_COMPLETED_STATUS).toBe('completed');
    expect(raw.finishedCampaigns).toBe(3);
    expect(raw.lowClickCampaigns).toBe(3);
    expect(raw.avgClickRate).toBeCloseTo(1 / 40, 10);
    expect(buildInsights(raw).find((i) => i.id === 'low-clicks')).toBeDefined();
  });

  it('propaga o erro em vez de devolver "sem dado"', async () => {
    mockQueries({ talkx_campaign_metrics: [{ data: null, error: { message: 'relation does not exist' } }] });

    await expect(fetchInsightData()).rejects.toThrow(/métricas de campanha/);
  });

  it('propaga erro também na leitura das campanhas concluídas', async () => {
    mockQueries({ talkx_campaigns: [{ data: null, error: { message: 'permission denied' } }] });

    await expect(fetchInsightData()).rejects.toThrow(/concluídas/);
  });
});

// ─── TL-173 (X188): ação de cada recomendação, janela da tela e Resumo ────────
// Antes: `applyLabel` vinha sem ação (o botão nunca aparecia na tela) e não havia
// Resumo. Aqui o hook declara a AÇÃO de cada regra e o ganho estimado condicionado.
const okRaw: InsightRaw = {
  bestHour: { hour: 9, replyRate: 0.2, sample: 50 },
  bestTemplate: { name: 'Taxa', replyRate: 0.4, campaignId: 'c1', sent: 20, replied: 8 },
  inactiveContactPct: 0.3,
  lowClickCampaigns: 4,
  finishedCampaigns: 12,
  avgClickRate: 0.01,
  avgReplyRate: 0.1,
  clicksTruncated: false,
  clickError: false,
  campaignsTruncated: false,
};

describe('buildInsights — ação de cada recomendação (TL-173)', () => {
  it('toda recomendação traz rótulo E destino do botão', () => {
    const out = buildInsights(okRaw);
    expect(out.map((i) => [i.id, i.applyLabel, i.action])).toEqual([
      ['best-hour', 'Aplicar sugestão', 'new-campaign'],
      ['best-template', 'Ver templates', 'templates'],
      ['inactive-contacts', 'Criar campanha de reativação', 'new-campaign'],
      ['low-clicks', 'Ver campanhas', 'campaigns'],
    ]);
  });

  it('o texto usa a janela pedida (período da tela), não um valor fixo', () => {
    const out = buildInsights(okRaw, 30);
    expect(out.find((i) => i.id === 'best-hour')?.description).toContain('Nos últimos 30 dias');
    expect(out.find((i) => i.id === 'low-clicks')?.description).toContain('últimos 30 dias');
  });

  it('sem o período informado, mantém a janela padrão do módulo', () => {
    const out = buildInsights(okRaw);
    expect(out.find((i) => i.id === 'best-hour')?.description).toContain('Nos últimos 90 dias');
  });
});

describe('estimateLiftPct — estimativa condicionada (TL-173)', () => {
  it('exige o piso de campanhas concluídas na janela', () => {
    const raw = { ...okRaw, finishedCampaigns: LIFT_MIN_FINISHED_CAMPAIGNS - 1 };
    expect(estimateLiftPct(raw)).toBeNull();
  });

  it('sem taxa de resposta média medida não publica percentual', () => {
    expect(estimateLiftPct({ ...okRaw, avgReplyRate: 0 })).toBeNull();
  });

  it('sem recomendação acima da média não publica percentual', () => {
    const raw = { ...okRaw, bestHour: { hour: 9, replyRate: 0.05, sample: 50 }, bestTemplate: null };
    expect(estimateLiftPct(raw)).toBeNull();
  });

  it('publica o maior ganho medido, limitado ao teto', () => {
    // hora: 0.2 contra 0.1 → +100% (corta no teto de 50%).
    expect(estimateLiftPct(okRaw)).toBe(LIFT_MAX);
    // template: 0.13 contra 0.1 → +30%.
    expect(estimateLiftPct({ ...okRaw, bestHour: null, bestTemplate: { name: 'T', replyRate: 0.13, campaignId: 'c1', sent: 20, replied: 3 } })).toBeCloseTo(0.3, 10);
  });
});

describe('fetchInsightData — janela da tela (TL-173)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('a janela pedida define o corte das consultas', async () => {
    const calls: Array<[string, unknown[]]> = [];
    const recording = (res: Res) => {
      const b: Record<string, unknown> = {};
      for (const m of ['select', 'not', 'gte', 'order', 'limit', 'lt', 'eq', 'in']) {
        b[m] = (...args: unknown[]) => { calls.push([m, args]); return b; };
      }
      b.then = (onOk: (v: Res) => unknown, onErr?: (e: unknown) => unknown) => Promise.resolve(res).then(onOk, onErr);
      return b;
    };
    fromMock.mockImplementation(() => recording({ data: [], count: 0, error: null }));
    fromTableMock.mockImplementation(() => recording({ data: [], count: 0, error: null }));

    await fetchInsightData(7);

    const sents = calls
      .filter(([m, a]) => m === 'gte' && a[0] === 'sent_at')
      .map(([, a]) => String(a[1]));
    const seteDiasAtras = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const noventaDiasAtras = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
    expect(sents.length).toBeGreaterThan(0);
    expect(sents.every((iso) => iso.startsWith(seteDiasAtras))).toBe(true);
    expect(sents.some((iso) => iso.startsWith(noventaDiasAtras))).toBe(false);
  });
});
