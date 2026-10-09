import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';

/**
 * X092 / TL-124 — painel lateral da tela 04 (Templates).
 *
 * O painel era um `RailCard` "Mais usados" ordenado por `use_count`, com o rótulo
 * "Do zero ou com IA" (IA que não existe) e sem "Mais convertidos" nem "Sugestões".
 * Aqui se prova, no componente REAL, o que o painel passou a fazer:
 *
 *   1. "Mais convertidos" é ranking por TAXA DE RESPOSTA (base mínima A9) — o
 *      template de maior taxa vem primeiro, mesmo com MENOS usos que os outros;
 *   2. sem base mínima, o painel diz "sem dados ainda" — nunca "mais usados" sob o
 *      mesmo título;
 *   3. "Ver todos" leva a galeria para a ordem por taxa de resposta;
 *   4. "Sugestões" traz a regra real (variação A/B abaixo da média) e o botão abre o
 *      editor do template certo já na área de variações A/B;
 *   5. o `HeroCard` traz o texto do mock e "Criar template" não promete IA.
 *
 * Só o hook de dados é mockado (com as mutações espiadas); o componente é o real.
 */

const mocks = vi.hoisted(() => {
  const base = {
    description: null, category: 'geral', media_url: null, media_type: null,
    tags: [] as string[], status: 'approved' as const, created_by: null,
    custom_variables: [] as string[], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  };
  return {
    // A ordem da LISTA é a do banco (por `use_count`): "Boas-vindas" lidera com 90 usos.
    // O ranking por taxa de resposta tem que reordenar isso.
    templates: [
      { ...base, id: 'tpl-baixo', name: 'Boas-vindas', content: 'Olá {{nome}}', use_count: 90 },
      { ...base, id: 'tpl-alto', name: 'Oferta VIP', content: 'Oferta VIP: 20% off', use_count: 3 },
      { ...base, id: 'tpl-meio', name: 'Pós-venda', content: 'Como foi a sua compra?', use_count: 30 },
    ],
    conversion: {
      ranking: null as unknown,
      isLoading: false,
      isError: false,
      error: null as Error | null,
    },
    fetchVariants: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({
  useTalkXTemplates: () => ({
    templates: mocks.templates,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    createTemplate: { mutate: vi.fn(), mutateAsync: vi.fn() },
    updateTemplate: { mutate: vi.fn(), mutateAsync: vi.fn() },
    deleteTemplate: { mutate: vi.fn() },
    duplicateTemplate: { mutate: vi.fn() },
    testTemplate: vi.fn(),
    conversion: mocks.conversion,
    fetchVersionHistory: vi.fn().mockResolvedValue([]),
    fetchVariants: mocks.fetchVariants,
    saveVariant: vi.fn(),
    deleteVariant: vi.fn(),
    countVariantRecipients: vi.fn(),
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => supa.chain } }));

const supa = vi.hoisted(() => {
  const state = { data: [] as Array<Record<string, unknown>> | null, error: null as unknown };
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    select: self,
    gte: self,
    order: self,
    limit: () => Promise.resolve({ data: state.data, error: state.error }),
  });
  return { state, chain };
});

import { TalkXTemplates } from '../TalkXTemplates';
import {
  buildConversionRanking,
  fetchConversionRanking,
  CONVERSION_ROW_LIMIT,
} from '@/hooks/integrations/useTalkXTemplatesConversion';

/** Ranking com base mínima: Oferta VIP (32,4%) > Pós-venda (20,8%) > Boas-vindas (12%). */
const rankingComBase = {
  items: [
    { templateId: 'tpl-alto', sent: 300, replied: 97, replyRatePct: 32.4 },
    { templateId: 'tpl-meio', sent: 250, replied: 52, replyRatePct: 20.8 },
    { templateId: 'tpl-baixo', sent: 100, replied: 12, replyRatePct: 12 },
  ],
  hasBase: true,
  truncated: false,
};

const semBase = { items: [], hasBase: false, truncated: false };

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.conversion = { ranking: rankingComBase, isLoading: false, isError: false, error: null };
  supa.state.data = [];
  supa.state.error = null;
});

const painel = () => screen.getByText('Mais convertidos').closest('section') as HTMLElement;
const galeria = () => screen.getByTestId('talkx-templates-gallery');
const nomesDaGaleria = () =>
  within(galeria()).getAllByText(/^(Oferta VIP|Pós-venda|Boas-vindas)$/)
    // Só os cartões/linhas da galeria (o KPI "Mais usado" também mostra um nome).
    .filter((el) => el.closest('[role="button"]') !== null)
    .map((el) => el.textContent);

describe('X092 — painel lateral da tela 04 (Templates)', () => {
  it('"Mais convertidos" ranqueia por taxa de resposta, não por usos', () => {
    render(<TalkXTemplates onUseTemplate={vi.fn()} />);

    // Antes: "Mais usados" por `use_count` (Boas-vindas, 90 usos, em 1º).
    expect(screen.queryByText('Mais usados')).toBeNull();
    expect(within(painel()).getAllByText(/↑ .* de resposta$/).map((el) => el.textContent)).toEqual([
      '↑ 32,4% de resposta',
      '↑ 20,8% de resposta',
      '↑ 12,0% de resposta',
    ]);
  });

  it('o 1º de "Mais convertidos" usa o template de MAIOR taxa (e não o mais usado)', () => {
    const onUseTemplate = vi.fn();
    render(<TalkXTemplates onUseTemplate={onUseTemplate} />);

    fireEvent.click(within(painel()).getByText('Oferta VIP'));
    expect(onUseTemplate).toHaveBeenCalledWith('tpl-alto');
  });

  it('sem base mínima diz "sem dados ainda" e não troca por "mais usados"', () => {
    mocks.conversion = { ranking: semBase, isLoading: false, isError: false, error: null };
    render(<TalkXTemplates onUseTemplate={vi.fn()} />);

    expect(within(painel()).getByText('sem dados ainda')).toBeTruthy();
    expect(screen.queryByText('Mais usados')).toBeNull();
    expect(within(painel()).queryByText(/↑ .* de resposta$/)).toBeNull();
  });

  it('"Ver todos" leva a galeria para a ordem por taxa de resposta', () => {
    render(<TalkXTemplates onUseTemplate={vi.fn()} />);

    // Ordem do banco (por usos) antes de pedir o recorte por resposta.
    expect(nomesDaGaleria()).toEqual(['Boas-vindas', 'Oferta VIP', 'Pós-venda']);

    fireEvent.click(screen.getByText('Ver todos'));

    expect(nomesDaGaleria()).toEqual(['Oferta VIP', 'Pós-venda', 'Boas-vindas']);
  });

  it('sugestão de A/B abre o editor do template certo já nas variações', () => {
    render(<TalkXTemplates onUseTemplate={vi.fn()} />);

    // Regra real: ≥ 200 envios (A9) e taxa abaixo da média da biblioteca → Pós-venda.
    fireEvent.click(screen.getByText(/Teste uma variação A\/B em "Pós-venda"/).closest('button') as HTMLElement);

    expect(screen.getByDisplayValue('Pós-venda')).toBeTruthy();
    // Painel de variações EXPANDIDO (o rótulo fechado é "Adicionar variante").
    expect(screen.getAllByText('Ocultar').length).toBeGreaterThan(0);
    expect(screen.queryByText('Adicionar variante')).toBeNull();
    expect(mocks.fetchVariants).toHaveBeenCalledWith('tpl-meio');
  });

  it('erro de leitura NÃO vira "sem dados ainda" no painel', () => {
    mocks.conversion = { ranking: null, isLoading: false, isError: true, error: new Error('42501') };
    render(<TalkXTemplates onUseTemplate={vi.fn()} />);

    expect(within(painel()).getByText('Não foi possível carregar o ranking de resposta.')).toBeTruthy();
    expect(within(painel()).queryByText('sem dados ainda')).toBeNull();
    expect(screen.getByText('Não foi possível carregar as sugestões.')).toBeTruthy();
  });

  it('HeroCard com o texto do mock e "Criar template" sem promessa de IA', () => {
    render(<TalkXTemplates onUseTemplate={vi.fn()} />);

    expect(screen.getByText('Templates que convertem, recomendações sob medida para o seu negócio.')).toBeTruthy();
    expect(screen.getByText('Do zero')).toBeTruthy();
    expect(screen.queryByText('Do zero ou com IA')).toBeNull();
  });
});

describe('X092 — cálculo do ranking (código de produção)', () => {
  it('agrega por template, exige a base mínima A9 e ordena por taxa de resposta', () => {
    const ranking = buildConversionRanking([
      { template_id: 'A', sent_count: 40, replied_count: 20 },  // 40 envios: fora da base mínima
      { template_id: 'B', sent_count: 100, replied_count: 20 },
      { template_id: 'B', sent_count: 50, replied_count: 5 },   // B soma 150/25 = 16,7%
      { template_id: 'C', sent_count: 60, replied_count: 31 },  // C = 51,7%
      { template_id: null, sent_count: 900, replied_count: 900 }, // campanha sem template
    ]);

    expect(ranking.hasBase).toBe(true);
    expect(ranking.truncated).toBe(false);
    expect(ranking.items).toEqual([
      { templateId: 'C', sent: 60, replied: 31, replyRatePct: 51.7 },
      { templateId: 'B', sent: 150, replied: 25, replyRatePct: 16.7 },
    ]);
  });

  it('empate de taxa é desempatado pelo MAIOR envio (ordem determinística)', () => {
    const ranking = buildConversionRanking([
      { template_id: 'menor', sent_count: 50, replied_count: 5 },
      { template_id: 'maior', sent_count: 100, replied_count: 10 },
    ]);

    expect(ranking.items.map((i) => i.templateId)).toEqual(['maior', 'menor']);
    expect(ranking.items.every((i) => i.replyRatePct === 10)).toBe(true);
  });

  it('sem nenhum template na base mínima o ranking é vazio (a tela diz "sem dados ainda")', () => {
    const ranking = buildConversionRanking([{ template_id: 'A', sent_count: 49, replied_count: 30 }]);
    expect(ranking.hasBase).toBe(false);
    expect(ranking.items).toEqual([]);
  });

  it('bater no teto é AMOSTRA: não afirma taxa por template (truncated)', async () => {
    supa.state.data = Array.from({ length: CONVERSION_ROW_LIMIT }, (_, i) => ({
      template_id: `tpl-${i}`,
      sent_count: 100,
      replied_count: 10,
    }));

    const ranking = await fetchConversionRanking();
    expect(ranking).toEqual({ items: [], hasBase: false, truncated: true });
  });

  it('erro de leitura SOBE — não vira "sem dados"', async () => {
    supa.state.error = new Error('talkx_campaign_metrics: 42501');
    await expect(fetchConversionRanking()).rejects.toThrow('42501');
  });
});
