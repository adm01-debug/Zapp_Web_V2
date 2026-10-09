import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// X108 (TL-132) — "Resumo do Segmento" (tela 03, coluna direita do construtor).
//
// Antes da correção o painel só tinha "Calculando…/Ao vivo", o número e a
// amostra com o telefone cru: não havia comparativo com a última versão
// publicada, nem fatia da base total, nem carimbo da última resposta da RPC,
// nem foto na amostra (o `avatar_url` já vinha na consulta e era descartado).
//
// O TalkXSegments REAL entra (o painel mora nele); viram dublê só a lista/CRUD
// de segmentos e a RPC `talkx_resolve_audience` (que é o servidor).

/** Contagem ao vivo do segmento em edição (RPC com as regras). */
const CONTAGEM_SEGMENTO = 42;
/** Base elegível inteira (RPC sem regras) — denominador do "% da base total". */
const BASE_TOTAL = 200;

const AMOSTRA = [
  { id: 'c1', name: 'Mariana Souza', nickname: null, phone: '5511912345678', company: 'Acme', avatar_url: 'https://cdn.example/mariana.png', tags: ['VIP'] },
  // O servidor mascara o miolo do telefone (X016/X017): é assim que ele chega.
  { id: 'c2', name: 'João Lima', nickname: null, phone: '5511*****5678', company: null, avatar_url: null, tags: [] },
];

const estado = vi.hoisted(() => ({ segments: [] as unknown[], rpc: vi.fn() }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1', full_name: 'QA' }, user: { id: 'user-1' }, session: null, loading: false }),
}));

vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  for (const metodo of ['select', 'not', 'or', 'order', 'limit', 'eq', 'gt', 'in']) chain[metodo] = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
  return { supabase: { from: () => chain, rpc: (...args: unknown[]) => estado.rpc(...args) } };
});

vi.mock('@/hooks/integrations/useTalkXSegments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/integrations/useTalkXSegments')>();
  return {
    ...actual,
    useTalkXSegments: () => ({
      segments: estado.segments,
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

import { TalkXSegments } from '@/components/talkx/TalkXSegments';
import type { TalkXSegment } from '@/hooks/integrations/useTalkXSegments';

const segmento: TalkXSegment = {
  id: 'seg-1',
  name: 'Clientes VIP',
  description: null,
  origin: 'custom',
  status: 'active',
  is_favorite: false,
  rules: { groups: [{ id: 'g1', match: 'and', rules: [{ id: 'r1', field: 'tags', op: 'contains', value: 'VIP' }] }] },
  estimated_count: 40,
  last_used_at: null,
  created_by: null,
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T10:00:00.000Z',
};

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TalkXSegments onUseCampaign={() => {}} />
    </QueryClientProvider>,
  );
}

/** Abre o construtor pelo rail de detalhe de um segmento já publicado. */
async function abrirConstrutorExistente() {
  renderView();
  fireEvent.click(await screen.findByText('Clientes VIP'));
  fireEvent.click(await screen.findByRole('button', { name: 'Editar segmento' }));
  await screen.findByPlaceholderText('Nome do segmento…');
}

describe('TalkXSegments · Resumo do Segmento (X108)', () => {
  beforeEach(() => {
    estado.segments = [segmento];
    estado.rpc.mockReset();
    estado.rpc.mockImplementation((_nome: string, args: { p_rules?: { groups?: unknown[] }; p_mode?: string }) => {
      const semRegras = (args?.p_rules?.groups ?? []).length === 0;
      if (args?.p_mode === 'page') {
        return Promise.resolve({ data: { mode: 'page', rows: AMOSTRA, has_more: false, next_after: null }, error: null });
      }
      const elegivel = semRegras ? BASE_TOTAL : CONTAGEM_SEGMENTO;
      return Promise.resolve({
        data: { mode: 'count', matched: elegivel, eligible: elegivel, suppressed: 0, invalid_phone: 0, legacy_or_deleted: 0 },
        error: null,
      });
    });
  });

  it('mostra o selo em tempo real, o carimbo de atualização, o comparativo com a versão publicada e a fatia da base', async () => {
    await abrirConstrutorExistente();

    expect(await screen.findByText('Estimativa em tempo real')).toBeInTheDocument();
    expect(screen.getByText(/^Última atualização Hoje, \d{2}:\d{2}$/)).toBeInTheDocument();
    // 42 ao vivo × 40 da última versão publicada → +5%
    expect(screen.getByText('+5% vs. versão anterior')).toBeInTheDocument();
    // 42 de 200 elegíveis → 21%
    expect(screen.getByText('21% da base total')).toBeInTheDocument();
    // A base total sai do servidor, sem regras (mesmo critério de elegibilidade).
    expect(estado.rpc.mock.calls.some(([, args]) => (args as { p_rules?: { groups?: unknown[] } })?.p_rules?.groups?.length === 0)).toBe(true);
  });

  it('em segmento novo não mostra o comparativo, mas calcula a fatia da base', async () => {
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: 'Novo segmento' }));

    // Enquanto a RPC não responde, o selo avisa que está calculando.
    expect(screen.getByText('Calculando…')).toBeInTheDocument();

    expect(await screen.findByText('Estimativa em tempo real')).toBeInTheDocument();
    expect(screen.queryByText(/vs\. versão anterior/)).toBeNull();
    // Sem nenhuma condição a audiência é a base inteira.
    expect(screen.getByText('100% da base total')).toBeInTheDocument();
  });

  it('a amostra mostra a foto (com iniciais de reserva) e o telefone com máscara brasileira', async () => {
    await abrirConstrutorExistente();
    await screen.findByText('Mariana Souza');

    // Quem tem avatar_url mostra a foto; quem não tem cai nas iniciais.
    expect(screen.getByAltText('Mariana Souza')).toHaveAttribute('src', 'https://cdn.example/mariana.png');
    expect(screen.getByLabelText('João Lima')).toBeInTheDocument();

    // 5511912345678 → (11) 91234-5678
    expect(screen.getByText('(11) 91234-5678')).toBeInTheDocument();
    // O miolo mascarado pelo servidor continua mascarado — nenhum dígito inventado.
    expect(screen.getByText('5511*****5678')).toBeInTheDocument();
  });

  it('quando a RPC da estimativa falha não anuncia estimativa em tempo real', async () => {
    estado.rpc.mockImplementation((_nome: string, args: { p_rules?: { groups?: unknown[] } }) => {
      const semRegras = (args?.p_rules?.groups ?? []).length === 0;
      if (!semRegras) return Promise.resolve({ data: null, error: { message: 'talkx_audience_role_required' } });
      return Promise.resolve({
        data: { mode: 'count', matched: BASE_TOTAL, eligible: BASE_TOTAL, suppressed: 0, invalid_phone: 0, legacy_or_deleted: 0 },
        error: null,
      });
    });

    await abrirConstrutorExistente();

    expect(await screen.findByText('Estimativa indisponível')).toBeInTheDocument();
    expect(screen.queryByText('Estimativa em tempo real')).toBeNull();
    // A contagem não vira um "0 contatos" inventado quando o servidor recusa.
    expect(screen.getByText('—')).toBeInTheDocument();
    // Sem estimativa não há comparativo nem fatia da base.
    expect(screen.queryByText(/vs\. versão anterior/)).toBeNull();
    expect(screen.queryByText(/da base total/)).toBeNull();
  });
});
