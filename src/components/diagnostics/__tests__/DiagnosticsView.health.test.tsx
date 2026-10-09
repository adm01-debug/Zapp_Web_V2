import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const h = vi.hoisted(() => ({
  /** Resposta (data/error/count) por tabela consultada pelo hook. */
  responses: {} as Record<string, { data?: unknown; error?: unknown; count?: number | null }>,
  /** Erro devolvido por storage.from(...).list() — `null` = listagem bem-sucedida. */
  storageError: null as unknown,
  /** Erro devolvido por functions.invoke('connection-health-check'). */
  invokeError: null as unknown,
  /** Status que o canal Realtime devolve no callback de subscribe(). `null` = nunca confirma. */
  subscribeStatus: null as string | null,
  canais: [] as string[],
  removeChannel: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => {
  const builder = (tabela: string) => {
    const query: Record<string, unknown> = {};
    const chain = () => query;
    Object.assign(query, {
      select: chain, eq: chain, neq: chain, gte: chain, lte: chain, lt: chain, gt: chain,
      in: chain, is: chain, order: chain, limit: chain, abortSignal: chain,
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(h.responses[tabela] ?? { data: [], error: null, count: 0 }).then(resolve, reject),
    });
    return query;
  };

  return {
    supabase: {
      from: (tabela: string) => builder(tabela),
      storage: {
        from: () => ({ list: () => Promise.resolve({ data: [], error: h.storageError }) }),
      },
      functions: { invoke: () => Promise.resolve({ data: null, error: h.invokeError }) },
      channel: (nome: string) => {
        h.canais.push(nome);
        const canal = {
          on: () => canal,
          subscribe: (callback?: (status: string) => void) => {
            if (callback && h.subscribeStatus) callback(h.subscribeStatus);
            return canal;
          },
          unsubscribe: () => Promise.resolve('ok'),
        };
        return canal;
      },
      removeChannel: h.removeChannel,
      auth: {
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      },
    },
  };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { DiagnosticsView } from '@/components/diagnostics/DiagnosticsView';

/** O painel abre na aba Conexões; os sinais de saúde vivem na aba System Health. */
async function abrirAbaSaude() {
  const aba = await screen.findByRole('tab', { name: /System Health/i });
  fireEvent.mouseDown(aba);
  await waitFor(() => expect(screen.getByText('Banco de Dados')).toBeInTheDocument());
}

/** Cartão do sinal pedido (Conexões/Mensagens/System Health/Logs são Cards distintos). */
function cartaoDoSinal(label: string) {
  const card = screen.getByText(label).closest('div.rounded-2xl');
  if (!card) throw new Error(`Cartão de saúde não encontrado para "${label}"`);
  return within(card as HTMLElement);
}

describe('DiagnosticsView — saúde do sistema (R2-INF-026)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    h.responses = {};
    h.storageError = null;
    h.invokeError = null;
    h.subscribeStatus = 'SUBSCRIBED';
    h.canais = [];
  });

  it('não mostra Saudável quando o SELECT do banco falha rápido', async () => {
    h.responses.contacts = { data: null, error: { code: 'PGRST000', message: 'Failed to fetch' }, count: null };

    render(<DiagnosticsView />);
    await abrirAbaSaude();

    const banco = cartaoDoSinal('Banco de Dados');
    expect(banco.getByText('Fora do ar')).toBeInTheDocument();
    expect(banco.queryByText('Saudável')).not.toBeInTheDocument();
    expect(banco.getByText('Falha de coleta no banco')).toBeInTheDocument();
    // Latência de coleta que falhou não é medida: o cartão-resumo não pode exibir "0ms".
    expect(screen.queryByText('0ms')).not.toBeInTheDocument();
  });

  it('não mostra Saudável quando o list() do Storage falha rápido', async () => {
    h.storageError = { message: 'Failed to fetch' };

    render(<DiagnosticsView />);
    await abrirAbaSaude();

    const storage = cartaoDoSinal('Armazenamento');
    expect(storage.getByText('Fora do ar')).toBeInTheDocument();
    expect(storage.queryByText('Saudável')).not.toBeInTheDocument();
    expect(storage.getByText('Falha de coleta no Storage')).toBeInTheDocument();
  });

  it('distingue falha de autorização de serviço fora do ar', async () => {
    h.responses.contacts = { data: null, error: { code: 'PGRST301', message: 'JWT expired' }, count: null };

    render(<DiagnosticsView />);
    await abrirAbaSaude();

    const banco = cartaoDoSinal('Banco de Dados');
    expect(banco.getByText('Sem permissão')).toBeInTheDocument();
    expect(banco.queryByText('Fora do ar')).not.toBeInTheDocument();
  });

  it('marca Realtime como não medido quando o canal não confirma a assinatura', async () => {
    vi.useFakeTimers();
    h.subscribeStatus = null; // o canal nunca devolve SUBSCRIBED nem erro: nada foi medido

    render(<DiagnosticsView />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000); // deixa a janela do probe (5s) expirar
    });
    vi.useRealTimers(); // waitFor do Testing Library precisa dos timers reais

    await abrirAbaSaude();

    const realtime = cartaoDoSinal('Realtime');
    expect(realtime.getAllByText('Não medido').length).toBeGreaterThan(0);
    expect(realtime.queryByText('Saudável')).not.toBeInTheDocument();
    expect(h.canais).toContain('diagnostics-realtime-probe');
    // O resumo só pode dizer "todos operacionais" com sinais válidos.
    expect(screen.getByText('⚠️ Alguns sistemas precisam de atenção')).toBeInTheDocument();
  });

  it('mostra Saudável quando a assinatura do canal é confirmada', async () => {
    render(<DiagnosticsView />);
    await abrirAbaSaude();

    const realtime = cartaoDoSinal('Realtime');
    expect(realtime.getByText('Saudável')).toBeInTheDocument();
    expect(realtime.getByText(/Assinatura confirmada/)).toBeInTheDocument();
    expect(screen.getByText('✅ Todos os sistemas operacionais')).toBeInTheDocument();
  });
});
