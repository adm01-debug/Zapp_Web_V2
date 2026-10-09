/**
 * R2-MOD-060 (#497) — "Tamanho de página" nas telas Templates, Segmentos e Supressão
 * era um controle SEM EFEITO: as três telas passavam `onPageSize={() => {}}` para o
 * `TalkXPagination`, então escolher "20 por página" não mudava nada (a tela seguia
 * mostrando 8/8/10 linhas e a contagem "Mostrando 1 a 8 de …" ficava igual).
 *
 * A prova monta o caminho real: a TELA inteira (não o `TalkXPagination` isolado),
 * abre o select de tamanho de página pelo evento do usuário e confere o que a tela
 * passa a MOSTRAR — a contagem do resumo e quantas linhas foram renderizadas.
 * O caso de 2ª página cobre também o retorno para a 1ª página: sem ele, trocar o
 * tamanho na página 2 mostraria "Mostrando 21 a 12 de 12" (intervalo vazio).
 *
 * X089 (mock 04): a TELA de templates passou a oferecer 12/24/48 por página (padrão 12);
 * a expectativa do caso Templates acompanhou a nova régua — o que o teste prova (a escolha
 * tem efeito e a tela volta para a 1ª página) continua o mesmo. Segmentos e Supressão
 * seguem com 8/10/20/50.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// O jsdom não implementa captura de ponteiro; o gatilho do Select (Radix) chama
// `hasPointerCapture` no pointerdown que o abre.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

const dados = vi.hoisted(() => ({
  templates: [] as Array<Record<string, unknown>>,
  segments: [] as Array<Record<string, unknown>>,
  blacklist: [] as Array<Record<string, unknown>>,
}));

const agora = '2026-10-01T10:00:00.000Z';

function fabricarTemplates(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `tpl-${i + 1}`,
    name: `Template ${i + 1}`,
    description: null,
    category: 'geral',
    content: `Mensagem do template ${i + 1}`,
    media_url: null,
    media_type: null,
    tags: [],
    status: 'approved',
    use_count: i,
    custom_variables: [],
    created_at: agora,
    updated_at: agora,
  }));
}

function fabricarSegments(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `seg-${i + 1}`,
    name: `Segmento ${i + 1}`,
    description: null,
    origin: 'zapp',
    status: 'active',
    estimated_count: 10,
    is_favorite: false,
    rules: { groups: [] },
    creator: null,
    created_at: agora,
    updated_at: agora,
    last_used_at: null,
  }));
}

function fabricarBlacklist(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `bl-${i + 1}`,
    contact_id: `contato-${i + 1}`,
    reason: 'Opt-out solicitado',
    blocked_by: null,
    created_at: agora,
    origin: 'optout',
    campaign_id: null,
    removed_by: null,
    removed_at: null,
    contacts: { name: `Contato ${i + 1}`, phone: `55119999900${i}`, company: null, avatar_url: null },
  }));
}

vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({
  useTalkXTemplates: () => ({
    templates: dados.templates,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    createTemplate: { mutateAsync: vi.fn() },
    updateTemplate: { mutateAsync: vi.fn() },
    deleteTemplate: { mutate: vi.fn() },
    duplicateTemplate: { mutate: vi.fn() },
  }),
}));

vi.mock('@/hooks/integrations/useTalkXSegments', async (orig) => {
  const actual = await orig<typeof import('@/hooks/integrations/useTalkXSegments')>();
  return {
    ...actual,
    useTalkXSegments: () => ({
      segments: dados.segments,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      createSegment: { mutateAsync: vi.fn() },
      updateSegment: { mutateAsync: vi.fn() },
      deleteSegment: { mutate: vi.fn() },
      refreshEstimates: { mutate: vi.fn() },
    }),
  };
});

vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.is = () => chain;
  chain.not = () => chain;
  chain.order = () => Promise.resolve({ data: dados.blacklist, error: null });
  return { supabase: { from: () => chain } };
});

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: () => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.insert = () => Promise.resolve({ error: null });
    chain.update = () => chain;
    chain.eq = () => Promise.resolve({ error: null });
    return chain;
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1', full_name: 'QA' }, user: { id: 'user-1' }, session: null, loading: false }),
}));

import { TalkXTemplates } from '../TalkXTemplates';
import { TalkXSegments } from '../TalkXSegments';
import { TalkXSuppression } from '../TalkXSuppression';

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

/** Escolhe um tamanho de página no select real da paginação da tela. */
function escolherTamanhoPagina(n: number) {
  const linha = screen.getByText(/^Mostrando/).parentElement;
  fireEvent.pointerDown(within(linha as HTMLElement).getByRole('combobox'), {
    button: 0, ctrlKey: false, pointerType: 'mouse',
  });
  fireEvent.click(screen.getByRole('option', { name: `${n} por página` }));
}

beforeEach(() => {
  dados.templates = fabricarTemplates(12);
  dados.segments = fabricarSegments(12);
  dados.blacklist = fabricarBlacklist(14);
});

describe('tamanho de página com efeito — R2-MOD-060 (#497)', () => {
  it('Templates: "24 por página" mostra 24 dos 30 templates e volta para a 1ª página', () => {
    // X089 (mock 04): a biblioteca de templates passou a paginar de 12 em 12
    // (opções 12/24/48). O comportamento provado é o mesmo do R2-MOD-060 — escolher um
    // tamanho MAIOR mostra mais linhas e a tela volta para a 1ª página.
    dados.templates = fabricarTemplates(30);
    const { container } = wrap(<TalkXTemplates onUseTemplate={vi.fn()} />);
    expect(screen.getByText('Mostrando 1 a 12 de 30 templates')).toBeTruthy();
    expect(container.querySelectorAll('[data-talkx-template-card]')).toHaveLength(12);

    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(screen.getByText('Mostrando 13 a 24 de 30 templates')).toBeTruthy();

    escolherTamanhoPagina(24);

    expect(screen.getByText('Mostrando 1 a 24 de 30 templates')).toBeTruthy();
    expect(container.querySelectorAll('[data-talkx-template-card]')).toHaveLength(24);
  });

  it('Segmentos: "20 por página" mostra os 12 segmentos e volta para a 1ª página', () => {
    wrap(<TalkXSegments onUseCampaign={vi.fn()} />);
    expect(screen.getByText('Mostrando 1 a 8 de 12 segmentos')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Favoritar' })).toHaveLength(8);

    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(screen.getByText('Mostrando 9 a 12 de 12 segmentos')).toBeTruthy();

    escolherTamanhoPagina(20);

    expect(screen.getByText('Mostrando 1 a 12 de 12 segmentos')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Favoritar' })).toHaveLength(12);
  });

  it('Supressão: "20 por página" mostra os 14 contatos e volta para a 1ª página', async () => {
    wrap(<TalkXSuppression />);
    expect(await screen.findByText('Mostrando 1 a 10 de 14 contatos suprimidos')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Remover' })).toHaveLength(10);

    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(screen.getByText('Mostrando 11 a 14 de 14 contatos suprimidos')).toBeTruthy();

    escolherTamanhoPagina(20);

    expect(screen.getByText('Mostrando 1 a 14 de 14 contatos suprimidos')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Remover' })).toHaveLength(14);
  });
});
