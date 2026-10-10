/**
 * TL-027 (inventario F46) — "ligar selecao a UI de composicao".
 *
 * O F46 vive no servidor (`multiplix-dispatch`: o conjunto e montado em UM
 * lugar). A parte de TELAS que o inventario aponta como faltante e esta: a
 * selecao feita na busca vira o publico da UI de composicao — o front manda a
 * INTENCAO (os company_ids marcados) e quem resolve/decide quem recebe e a edge
 * (`multiplix-dispatch`, acao `draft.create`, que re-resolve sob o escopo do
 * JWT).
 *
 * Este teste NAO mocka as telas nem os hooks: renderiza `MultiplixView` e
 * mocka so a rede (o cliente Supabase) e o virtualizador da tabela — o jsdom
 * nao tem layout (clientHeight 0) e o `@tanstack/react-virtual` (F74) nao
 * devolveria janela nenhuma; o mesmo padrao ja aceito em
 * `MultiplixView.lista-virtualizada.test.tsx`, e o duble segue delegando nas
 * opcoes do componente (`count`/`estimateSize`). O que ele trava:
 *   1. so as empresas MARCADAS viajam para a criacao do disparo (o desmarcado
 *      nao entra — a exclusao da UI vence a inclusao);
 *   2. o front NAO resolve publico no navegador: sai a selecao (`company_ids`)
 *      e mais nada — nenhuma acao de `resolve` e chamada pela tela.
 *
 * A composicao agora e inline na regiao 02 (MultiplixView), nao num dialog
 * separado (MultiplixComposerDialog foi removido).
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

function audienceActions(): string[] {
  return (functionsInvoke.mock.calls as unknown as InvokeArgs[])
    .map(([, opts]) => opts?.body?.action ?? '')
    .filter((action) => action.startsWith('resolve') || action === 'audience.select');
}

beforeEach(() => {
  vi.clearAllMocks();
  authGetSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } });
  functionsInvoke.mockImplementation((fn: string, opts: InvokeMock) => {
    const action = opts?.body?.action;
    if (fn === 'multiplix-dispatch') {
      if (action === 'draft.create') {
        return Promise.resolve({
          data: { data: { dispatch_id: 'd9', recipient_count: 2, created: true } },
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

/** Preenche o formulario de composicao inline (regiao 02) e envia. */
async function composeDraftInline() {
  // A composicao agora e inline na regiao 02 — nao ha dialog.
  fireEvent.change(screen.getByPlaceholderText('Ex.: Convite feira 2026'), {
    target: { value: 'Convite feira 2026' },
  });
  fireEvent.change(screen.getByPlaceholderText('Olá {{empresa}}, {{saudacao}}!'), {
    target: { value: 'Olá {{empresa}}!' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Salvar rascunho/ }));
}

describe('MultiplixView — selecao e composicao inline (TL-027/F46)', () => {
  it('manda para a criacao SO a empresa marcada; a nao marcada fica fora do disparo', async () => {
    await searchAudience();

    fireEvent.click(screen.getByLabelText('Selecionar Empresa A'));

    await composeDraftInline();

    await waitFor(() => expect(createDraftCalls().length).toBe(1));
    const payload = createDraftCalls()[0];
    expect(payload.company_ids).toEqual(['c1']);
    expect(payload.contact_ids).toEqual([]);
    expect(audienceActions()).toEqual([]);
  });

  it('desmarcar tira a empresa do disparo (exclusao da UI vence a inclusao)', async () => {
    await searchAudience();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todas as empresas visíveis' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Selecionar Empresa A')).toHaveAttribute('aria-checked', 'true'),
    );
    fireEvent.click(screen.getByLabelText('Selecionar Empresa B'));
    await waitFor(() =>
      expect(screen.getByLabelText('Selecionar Empresa B')).toHaveAttribute('aria-checked', 'false'),
    );

    await composeDraftInline();

    await waitFor(() => expect(createDraftCalls().length).toBe(1));
    expect(createDraftCalls()[0].company_ids).toEqual(['c1']);
  });
});