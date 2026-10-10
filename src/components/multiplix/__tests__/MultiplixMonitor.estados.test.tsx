/**
 * F80 (TL-042) — "Monitor: estado de erro (não skeleton eterno)". As TRES leituras
 * do monitor precisam de estado proprio: a do disparo, a da lista de destinatarios
 * e a da contagem de "sem WhatsApp". Antes, so o `data` era lido:
 *
 *  1. disparo que falha (removido / de outro usuario / edge fora) -> `dispatch`
 *     indefinido -> a tela ficava no SKELETON para sempre (nenhuma explicacao,
 *     nenhuma saida);
 *  2. disparo que ainda esta carregando -> placeholder (nao erro);
 *  3. PRIMEIRA pagina de destinatarios carregando -> a tela confirmava
 *     "Nenhum destinatário encontrado" antes de a consulta responder;
 *  4. consulta de destinatarios que respondeu vazio de verdade -> o vazio
 *     confirmado aparece (controle do caso 3);
 *  5. `fetchMultiplixRecipientsTotal` (contagem de "sem WhatsApp") que FALHA ->
 *     o default `= 0` fazia o progresso/restantes mentirem em silencio.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  refetch: vi.fn(),
  dispatchQuery: {
    data: null as unknown,
    isError: false,
    error: null as unknown,
    isFetching: false,
  },
  recipientsQuery: {
    data: undefined as unknown,
    isError: false,
    error: null as unknown,
    isPending: false,
  },
  skippedCountError: false,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    // O monitor abre um canal realtime; o encadeamento e o mesmo do componente.
    channel: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }) }),
    removeChannel: () => {},
  },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('@/hooks/integrations/useMultiplixDispatches', async () => {
  // A classe VEM DO MODULO REAL: o componente compara com `instanceof`.
  const actual = await vi.importActual<typeof import('@/hooks/integrations/useMultiplixDispatches')>(
    '@/hooks/integrations/useMultiplixDispatches',
  );
  return {
    MultiplixDispatchEdgeError: actual.MultiplixDispatchEdgeError,
    useMultiplixDispatch: () => ({ ...h.dispatchQuery, refetch: h.refetch }),
    useMultiplixRecipients: () => h.recipientsQuery,
    useMultiplixDispatchAction: () => ({ mutateAsync: vi.fn(), isPending: false }),
    // TL-050/F49 (rebase sobre dia/2026-10-09): o monitor passou a chamar também
    // `useConfirmMultiplixDispatch` (revalidação antes de confirmar) — sem este
    // dublê o `vi.mock` devolvia `undefined` e o componente quebrava ao montar.
    useConfirmMultiplixDispatch: () => ({ mutateAsync: vi.fn(), isPending: false }),
    fetchMultiplixRecipientsTotal: () => h.skippedCountError
      ? Promise.reject(new Error('recipients.list nao devolveu total'))
      : Promise.resolve(0),
  };
});

import { MultiplixMonitor } from '@/components/multiplix/MultiplixMonitor';
import { MultiplixDispatchEdgeError } from '@/hooks/integrations/useMultiplixDispatches';

function dispatchRow() {
  return {
    id: 'd1', name: 'Disparo F80', message_template: 'oi', status: 'sending',
    total_recipients: 3, sent_count: 1, failed_count: 0, delivered_count: 0,
    outcome_unknown_count: 0, started_at: null, paused_at: null, pause_reason: null,
    completed_at: null, created_at: '2026-10-06T10:00:00Z',
  };
}

function renderMonitor() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MultiplixMonitor dispatchId="d1" onBack={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.refetch.mockClear();
  h.dispatchQuery = { data: dispatchRow(), isError: false, error: null, isFetching: false };
  h.recipientsQuery = {
    data: { rows: [], total: 0, truncated: false },
    isError: false,
    error: null,
    isPending: false,
  };
  h.skippedCountError = false;
});

describe('MultiplixMonitor — estado de erro do disparo (F80)', () => {
  it('mostra o erro legivel e a saida quando a leitura do disparo falha (nunca o skeleton eterno)', () => {
    h.dispatchQuery = {
      data: undefined,
      isError: true,
      error: new MultiplixDispatchEdgeError('multiplix_dispatch_not_found', 'Disparo nao encontrado'),
      isFetching: false,
    };

    renderMonitor();

    expect(screen.getByText('Não foi possível carregar o disparo')).toBeInTheDocument();
    // O operador le a FRASE, nao o codigo nomeado da edge.
    expect(screen.getByText(/O disparo não foi encontrado/)).toBeInTheDocument();
    expect(screen.queryByText('multiplix_dispatch_not_found')).toBeNull();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
    // O placeholder de carregamento nao pode sobrar na tela de erro.
    expect(screen.queryByText('Carregando disparo…')).toBeNull();
  });

  it('"Tentar de novo" repete a leitura do disparo', () => {
    h.dispatchQuery = {
      data: undefined,
      isError: true,
      error: new Error('Failed to fetch'),
      isFetching: false,
    };

    renderMonitor();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(h.refetch).toHaveBeenCalledTimes(1);
  });

  it('enquanto o disparo carrega mostra o placeholder, nao o erro', () => {
    h.dispatchQuery = { data: undefined, isError: false, error: null, isFetching: true };

    renderMonitor();

    expect(screen.getByText('Carregando disparo…')).toBeInTheDocument();
    expect(screen.queryByText('Não foi possível carregar o disparo')).toBeNull();
  });

  it('um refresh periodico que falha NAO troca a tela carregada por erro', () => {
    // React Query mantem o dado bom quando so o refetch de 5s falha: o monitor
    // continua mostrando o disparo (o erro so vale para a leitura sem dado).
    h.dispatchQuery = {
      data: dispatchRow(),
      isError: true,
      error: new Error('Failed to fetch'),
      isFetching: false,
    };

    renderMonitor();

    expect(screen.getByText('Disparo F80')).toBeInTheDocument();
    expect(screen.queryByText('Não foi possível carregar o disparo')).toBeNull();
  });
});

describe('MultiplixMonitor — carregando x vazio x falha nos destinatarios (F80)', () => {
  it('a primeira carga NAO e anunciada como lista vazia confirmada', () => {
    h.recipientsQuery = { data: undefined, isError: false, error: null, isPending: true };

    renderMonitor();

    expect(screen.getByText('Carregando destinatários…')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum destinatário encontrado')).toBeNull();
  });

  it('a lista vazia confirmada so aparece quando a consulta respondeu', () => {
    renderMonitor();

    expect(screen.getByText('Nenhum destinatário encontrado')).toBeInTheDocument();
    expect(screen.queryByText('Carregando destinatários…')).toBeNull();
  });
});

describe('MultiplixMonitor — contagem de sem WhatsApp que falha (F80)', () => {
  it('avisa que o progresso esta incompleto em vez de contar 0 em silencio', async () => {
    h.skippedCountError = true;

    renderMonitor();

    expect(await screen.findByText(/Não foi possível contar os contatos sem WhatsApp/)).toBeInTheDocument();
  });

  it('sem falha na contagem, o aviso nao aparece', () => {
    renderMonitor();

    expect(screen.queryByText(/Não foi possível contar os contatos sem WhatsApp/)).toBeNull();
  });
});

describe('MultiplixMonitor — piscar respeita reduzir movimento (motion-safe)', () => {
  it('o "Enviando agora…" pisca só sob motion-safe', () => {
    // dispatchRow() nasce com status 'sending' -> isRunning true.
    renderMonitor();

    const piscando = screen.getByText('Enviando agora…');
    expect(piscando.className).toMatch(/(^|\s)motion-safe:animate-pulse(\s|$)/);
    // Sem o prefixo, quem pediu "reduzir movimento" continuaria vendo o piscar.
    expect(piscando.className).not.toMatch(/(^|\s)animate-pulse(\s|$)/);
  });
});
