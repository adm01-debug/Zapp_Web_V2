/**
 * TL-041 (F75, exclusões) — o painel do Multiplix tem exclusão explícita por
 * linha e a regra "exclusão vence a seleção": o disparo leva as selecionadas
 * MENOS as excluídas. Este teste renderiza `MultiplixView` real e mocka só a
 * rede e o virtualizador (mesmo padrão de MultiplixView.selecao-composicao).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const authGetSession = vi.fn();
const functionsInvoke = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: (...args: unknown[]) => authGetSession(...args) },
    functions: { invoke: (...args: unknown[]) => functionsInvoke(...args) },
    channel: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }) }),
    removeChannel: () => {},
  },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: { count: number; estimateSize: (i: number) => number }) => {
    const size = options.estimateSize(0);
    const visible = Math.min(options.count, 25);
    return {
      getTotalSize: () => options.count * size,
      getVirtualItems: () =>
        Array.from({ length: visible }, (_, index) => ({
          index, size, start: index * size, end: (index + 1) * size, key: index, lane: 0,
        })),
      measure: () => {},
      measureElement: () => {},
    };
  },
}));

vi.mock('@/components/multiplix/MultiplixMonitor', () => ({
  MultiplixMonitor: ({ dispatchId }: { dispatchId: string }) => (
    <div data-testid="monitor">monitor:{dispatchId}</div>
  ),
}));

import MultiplixView from '@/components/multiplix/MultiplixView';

const ROWS = [
  {
    company_id: 'c1',
    company_name: 'Empresa A',
    ramo_atividade: 'Brinquedos',
    uf: 'SP',
    is_customer: true,
    is_supplier: false,
    is_carrier: false,
    destino_e164: '+551****0001',
    destino_origem: 'contato_pessoa',
    motivo_inclusao: 'cliente',
  },
  {
    company_id: 'c2',
    company_name: 'Empresa B',
    ramo_atividade: 'Papelaria',
    uf: 'MG',
    is_customer: false,
    is_supplier: true,
    is_carrier: false,
    destino_e164: '+551****0002',
    destino_origem: 'contato_pessoa',
    motivo_inclusao: 'fornecedor',
  },
];

interface InvokeMock {
  body?: {
    action?: string;
    params?: Record<string, unknown>;
    payload?: Record<string, unknown>;
  };
}
type InvokeArgs = [string, InvokeMock];

function createDraftCalls(): Array<Record<string, unknown>> {
  return (functionsInvoke.mock.calls as unknown as InvokeArgs[])
    .filter(([fn, opts]) => fn === 'multiplix-dispatch' && opts?.body?.action === 'draft.create')
    .map(([, opts]) => (opts.body!.payload ?? {}) as Record<string, unknown>);
}

beforeEach(() => {
  vi.clearAllMocks();
  authGetSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } });
  functionsInvoke.mockImplementation((fn: string, opts: InvokeMock) => {
    const action = opts?.body?.action;
    if (fn === 'multiplix-dispatch') {
      if (action === 'draft.create') {
        return Promise.resolve({
          data: { data: { dispatch_id: 'd9', recipient_count: 1, created: true } },
          error: null,
        });
      }
      return Promise.resolve({ data: { data: [] }, error: null });
    }
    if (action === 'list_ramos' || action === 'list_ufs') {
      return Promise.resolve({ data: { data: [] }, error: null });
    }
    if (action === 'search') return Promise.resolve({ data: { data: ROWS }, error: null });
    if (action === 'count') return Promise.resolve({ data: { data: ROWS.length }, error: null });
    return Promise.resolve({ data: { data: null }, error: null });
  });
});

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MultiplixView />
    </QueryClientProvider>,
  );
}

async function searchAudience() {
  renderView();
  fireEvent.click(screen.getByRole('button', { name: /Buscar/ }));
  await waitFor(() => expect(screen.getByText('Empresa A')).toBeInTheDocument());
  await waitFor(() => expect(screen.getByText('Empresa B')).toBeInTheDocument());
}

/** Preenche a composição inline (região 02) e salva rascunho. */
async function composeDraftInline() {
  fireEvent.change(screen.getByPlaceholderText('Ex.: Convite feira 2026'), {
    target: { value: 'Convite feira 2026' },
  });
  fireEvent.change(screen.getByPlaceholderText('Olá {{empresa}}, {{saudacao}}!'), {
    target: { value: 'Olá {{empresa}}!' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Salvar rascunho/ }));
}

describe('MultiplixView — exclusões explícitas (TL-041/F75)', () => {
  it('tem coluna Excluir por linha e declara que a exclusão vence a seleção', async () => {
    await searchAudience();

    expect(screen.getByRole('checkbox', { name: 'Excluir Empresa A' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Excluir Empresa B' })).not.toBeChecked();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Excluir Empresa B' }));

    // o <strong> do N quebra o texto em nos; compara o conteudo cheio
    const avisoExclusao = (_: string, el: Element | null) =>
      el?.textContent ===
      '1 empresa(s) excluída(s) — a exclusão vence a seleção e fica fora do disparo.';
    expect(await screen.findByText(avisoExclusao)).toBeInTheDocument();
  });

  it('exclusão vence a seleção no disparo: manda as selecionadas menos as excluídas', async () => {
    await searchAudience();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todas as empresas visíveis' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Selecionar Empresa A')).toHaveAttribute('aria-checked', 'true'),
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Excluir Empresa B' }));

    await composeDraftInline();

    await waitFor(() => expect(createDraftCalls().length).toBe(1));
    expect(createDraftCalls()[0].company_ids).toEqual(['c1']);
  });

  it('exclusão anterior ao "selecionar todos" continua valendo no disparo', async () => {
    await searchAudience();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Excluir Empresa B' }));
    fireEvent.click(screen.getByRole('button', { name: /Selecionar todos os 2 resultados/ }));
    await waitFor(() =>
      expect(screen.getByLabelText('Selecionar Empresa A')).toHaveAttribute('aria-checked', 'true'),
    );

    await composeDraftInline();

    await waitFor(() => expect(createDraftCalls().length).toBe(1));
    expect(createDraftCalls()[0].company_ids).toEqual(['c1']);
  });

  it('desmarcar a exclusão devolve a empresa ao disparo', async () => {
    await searchAudience();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todas as empresas visíveis' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Excluir Empresa B' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Excluir Empresa B' }));
    await waitFor(() =>
      expect(screen.queryByText(/exclusão vence a seleção/)).not.toBeInTheDocument(),
    );

    await composeDraftInline();

    await waitFor(() => expect(createDraftCalls().length).toBe(1));
    expect((createDraftCalls()[0].company_ids as string[]).sort()).toEqual(['c1', 'c2']);
  });
});
