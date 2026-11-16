import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Oito defeitos da biblioteca de segmentos que ninguém via (resgate 261115):
 *
 * Grade  — Esc largava o foco no <body> (o ref só existia no <tr> da lista), o
 *          cartão não mostrava a descrição que a lista mostra e o nome saía sem
 *          negrito por causa de `font--semibold` (hífen duplo, classe inexistente).
 * Painel — ficava aberto num segmento que já tinha saído da lista (apagado aqui,
 *          em outra aba ou por ação em massa), cortava os critérios no 5º em
 *          silêncio, não dizia quando o segmento foi criado, não mostrava a
 *          amostra de contatos que o hook já devolvia e o "Recontar público"
 *          aceitava clique duplo sem avisar que estava contando.
 *
 * O TalkXSegments REAL entra (motor de regras real, via importOriginal); só a
 * lista/CRUD e o cliente Supabase viram spies — mesmo arranjo do
 * TalkXSegments.detailPanel.test.tsx.
 */

const f = vi.hoisted(() => ({ update: vi.fn(), create: vi.fn(), rpc: vi.fn() }));
const state = vi.hoisted(() => ({ segments: [] as unknown[] }));

const countResposta = { mode: 'count', matched: 42, eligible: 42, suppressed: 0, invalid_phone: 0, legacy_or_deleted: 0 };
const pageResposta = {
  mode: 'page',
  rows: [
    { id: 'c1', name: 'Ana Souza', nickname: null, phone: '5511999990001', company: null, avatar_url: null, tags: null },
    { id: 'c2', name: 'Bruno Lima', nickname: null, phone: '5511999990002', company: null, avatar_url: null, tags: null },
  ],
  has_more: false,
  next_after: null,
};

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1', full_name: 'QA' }, user: { id: 'user-1' }, session: null, loading: false }),
}));

vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.not = () => chain;
  chain.or = () => chain;
  chain.order = () => chain;
  chain.limit = () => chain;
  chain.eq = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
  return { supabase: { from: () => chain, rpc: f.rpc } };
});

vi.mock('@/hooks/integrations/useTalkXSegments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/integrations/useTalkXSegments')>();
  return {
    ...actual,
    useTalkXSegments: () => ({
      segments: state.segments,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      createSegment: { mutateAsync: f.create },
      updateSegment: { mutateAsync: f.update },
      deleteSegment: { mutate: vi.fn() },
      refreshEstimates: { mutate: vi.fn() },
    }),
  };
});

import { TalkXSegments } from '@/components/talkx/TalkXSegments';
import type { TalkXSegment } from '@/hooks/integrations/useTalkXSegments';

const segmento: TalkXSegment = {
  id: 'seg-1',
  name: 'Segmento teste',
  description: 'Clientes que já compraram',
  origin: 'zapp',
  status: 'active',
  is_favorite: false,
  rules: {
    groups: [
      { id: 'g1', match: 'and', rules: [
        { id: 'r1', field: 'tags', op: 'contains', value: 'VIP' },
        { id: 'r2', field: 'updated_at', op: 'in_last_days', value: '30' },
      ] },
    ],
  },
  estimated_count: 120,
  last_used_at: null,
  created_by: null,
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T10:00:00.000Z',
};

/** Seis condições completas: o painel mostra 5 e tem de dizer que há mais. */
const seisCriterios: TalkXSegment['rules'] = {
  groups: [
    { id: 'g1', match: 'and', rules: [
      { id: 'r1', field: 'tags', op: 'contains', value: 'VIP' },
      { id: 'r2', field: 'city', op: 'eq', value: 'São Paulo' },
      { id: 'r3', field: 'state', op: 'eq', value: 'SP' },
      { id: 'r4', field: 'email', op: 'is_set', value: '' },
      { id: 'r5', field: 'company', op: 'contains', value: 'Acme' },
      { id: 'r6', field: 'updated_at', op: 'in_last_days', value: '30' },
    ] },
  ],
};

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TalkXSegments onUseCampaign={() => {}} />
    </QueryClientProvider>,
  );
}

/** Troca para a grade e devolve o cartão do segmento. */
async function abrirGrade(): Promise<HTMLElement> {
  await screen.findByText('Segmento teste');
  fireEvent.click(screen.getByTestId('segments-view-grid'));
  return screen.getByTestId('segments-grid').querySelector('[data-testid="segment-card"]') as HTMLElement;
}

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  state.segments = [{ ...segmento }];
  f.update.mockReset();
  f.create.mockReset();
  f.rpc.mockReset();
  f.rpc.mockImplementation((_name: string, args?: { p_mode?: string }) =>
    Promise.resolve({ data: args?.p_mode === 'page' ? pageResposta : countResposta, error: null }),
  );
});

describe('TalkXSegments · cartão da grade', () => {
  it('Esc fecha o painel e devolve o foco ao cartão da grade (não ao body)', async () => {
    renderView();
    const cartao = await abrirGrade();

    fireEvent.click(cartao);
    await screen.findByText('Detalhes do segmento');

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByText('Detalhes do segmento')).toBeNull());
    // O cartão é remontado sem o ring de seleção, mas é o mesmo nó: o ref de
    // callback guardou o elemento da grade, e não um <tr> que não existe aqui.
    expect(document.activeElement).not.toBe(document.body);
    expect(screen.getByTestId('segments-grid').contains(document.activeElement)).toBe(true);
  });

  it('o cartão mostra a descrição do segmento, com o mesmo texto de reserva da lista', async () => {
    state.segments = [{ ...segmento }, { ...segmento, id: 'seg-2', name: 'Sem texto', description: null }];
    renderView();
    const cartao = await abrirGrade();

    expect(within(cartao).getByText('Clientes que já compraram')).toBeInTheDocument();
    const outro = screen.getByText('Sem texto').closest('[data-testid="segment-card"]') as HTMLElement;
    expect(within(outro).getByText('Sem descrição')).toBeInTheDocument();
  });

  it('o nome do segmento sai em negrito (font-semibold, não a classe inexistente font--semibold)', async () => {
    renderView();
    const cartao = await abrirGrade();

    const nome = within(cartao).getByText('Segmento teste');
    expect(nome.className).toContain('font-semibold');
    expect(nome.className).not.toContain('font--semibold');
  });
});

describe('TalkXSegments · painel de detalhes', () => {
  it('segmento que sai da lista fecha o painel em vez de mostrar dados de um id morto', async () => {
    renderView();
    fireEvent.click(await screen.findByText('Segmento teste'));
    await screen.findByText('Detalhes do segmento');

    // A lista volta do servidor sem o segmento (apagado aqui, em outra aba ou em massa).
    state.segments = [];
    fireEvent.change(screen.getByPlaceholderText('Buscar segmentos…'), { target: { value: 'x' } });

    await waitFor(() => expect(screen.queryByText('Detalhes do segmento')).toBeNull());
    expect(screen.getByText('Selecione um segmento')).toBeInTheDocument();
  });

  it('acima de 5 critérios o painel diz quantos ficaram de fora', async () => {
    state.segments = [{ ...segmento, rules: seisCriterios }];
    renderView();
    fireEvent.click(await screen.findByText('Segmento teste'));
    await screen.findByText('Detalhes do segmento');

    expect(screen.getByText(/\+1 critério — abra em Editar segmento/)).toBeInTheDocument();
  });

  it('cinco critérios ou menos não ganham o aviso de "+N"', async () => {
    renderView();
    fireEvent.click(await screen.findByText('Segmento teste'));
    await screen.findByText('Detalhes do segmento');

    expect(screen.queryByText(/critério.*abra em Editar segmento/)).toBeNull();
  });

  it('mostra quando o segmento foi criado e a amostra de contatos que o hook devolve', async () => {
    renderView();
    fireEvent.click(await screen.findByText('Segmento teste'));
    const painel = (await screen.findByText('Detalhes do segmento')).closest('section') as HTMLElement;

    expect(within(painel).getByText('Criado em')).toBeInTheDocument();
    expect(await within(painel).findByText('Amostra de contatos (5)')).toBeInTheDocument();
    expect(within(painel).getByText('Ana Souza')).toBeInTheDocument();
    expect(within(painel).getByText('Bruno Lima')).toBeInTheDocument();
  });

  it('"Recontar público" fica desabilitado enquanto conta — clique duplo não dispara duas contagens', async () => {
    renderView();
    fireEvent.click(await screen.findByText('Segmento teste'));
    await screen.findByText('Detalhes do segmento');

    const contagens = () => f.rpc.mock.calls.filter(([, args]) => (args as { p_mode?: string })?.p_mode === 'count').length;
    await waitFor(() => expect(contagens()).toBeGreaterThan(0));
    // A primeira contagem (da montagem) termina antes do clique.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Recontar público' })).not.toBeDisabled());
    const antes = contagens();

    // A próxima contagem fica pendurada: é nela que o botão tem de avisar e travar.
    let liberar: () => void = () => {};
    const pendente = new Promise<void>((resolve) => { liberar = resolve; });
    f.rpc.mockImplementation((_name: string, args?: { p_mode?: string }) =>
      pendente.then(() => ({ data: args?.p_mode === 'page' ? pageResposta : countResposta, error: null })),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Recontar público' }));

    // Enquanto a RPC não volta, o botão avisa e recusa o segundo clique.
    const recontando = await screen.findByRole('button', { name: 'Recontando…' });
    expect(recontando).toBeDisabled();
    fireEvent.click(recontando);
    expect(contagens()).toBe(antes + 1);

    liberar();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Recontar público' })).not.toBeDisabled());
  });
});
