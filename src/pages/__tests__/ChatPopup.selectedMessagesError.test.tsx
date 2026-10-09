/**
 * R2-INB-024 — a janela destacada do chat também não pode transformar erro em conversa vazia.
 *
 * O `ChatPopup` já chamava `useMessages`, mas extraía só `messages`/`loading`/paginação e
 * descartava `error`/`refetch` do hook. Falha de transporte/permissão na carga do contato
 * selecionado virava lista vazia no `ChatPanel` — indistinguível de "sem histórico" e sem
 * caminho de retry naquela janela.
 *
 * O teste monta o caminho REAL `ChatPopup -> (ChatPanel como marcador)` com o `useMessages`
 * trocado por fachada controlada e prova: com erro e sem mensagens renderizadas, o popup
 * anuncia a falha e oferece o retry do próprio hook; o painel do chat não é montado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const CONTACT_ID = 'contato-popup-1';

const mocks = vi.hoisted(() => ({
  refetch: vi.fn(async () => {}),
  /** Retorno controlado do `useMessages` (fachada do hook). */
  messages: {} as Record<string, unknown>,
  contactId: '' as string,
}));

vi.mock('@/hooks/chat/useMessages', () => ({
  useMessages: () => mocks.messages,
}));

// A única coisa que o popup consome do roteador é o `contactId` da janela.
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useParams: () => ({ contactId: mocks.contactId }) };
});

const CONTACT_ROW = {
  id: CONTACT_ID,
  name: 'Maria Silva',
  phone: '+551****9999',
  avatar_url: null,
  email: null,
  tags: [],
  created_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-01T10:00:00Z',
  ai_priority: null,
  status: 'open',
  last_message: 'oi',
  unread_count: 0,
  assigned_to: null,
};

// O popup busca o contato em `contacts`; nenhum teste fala com a rede.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: CONTACT_ROW, error: null }) }) }),
    }),
    storage: {
      from: () => ({ upload: vi.fn(), getPublicUrl: () => ({ data: { publicUrl: '' } }), remove: vi.fn() }),
    },
  },
}));
vi.mock('@/hooks/realtime/messageSender', () => ({ sendMessageToContact: vi.fn() }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
// O alvo do cartão é o ramo escolhido pelo popup ANTES de montar o painel do chat; o
// ChatPanel (lazy) entra como marcador para observar se ele foi montado ou não.
vi.mock('@/components/inbox/ChatPanel', () => ({
  ChatPanel: () => <div data-testid="chat-panel" />,
}));

import ChatPopup from '../ChatPopup';

// Espera local ao boundary lazy: máquina lenta não muda o contrato, só o tempo.
const ESPERA = { timeout: 3000, interval: 50 };
const RETRY = /tentar novamente/i;

function useMessagesState(overrides: Record<string, unknown> = {}) {
  return {
    messages: [],
    loading: false,
    error: null,
    hasOlder: false,
    loadingOlder: false,
    loadOlderMessages: vi.fn(),
    refetch: mocks.refetch,
    ...overrides,
  };
}

function buildUi() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <ChatPopup />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.contactId = CONTACT_ID;
  mocks.messages = useMessagesState();
});

describe('ChatPopup — erro da carga das mensagens (R2-INB-024)', () => {
  it('anuncia a falha e oferece o retry do hook em vez de abrir a conversa vazia', async () => {
    mocks.messages = useMessagesState({ error: 'Falha ao carregar mensagens' });
    render(buildUi());

    const aviso = await screen.findByRole('alert', undefined, ESPERA);
    expect(aviso).toHaveTextContent('Falha ao carregar mensagens');
    // O painel do chat NÃO é montado: a janela não pode fingir conversa sem histórico.
    expect(screen.queryByTestId('chat-panel')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: RETRY }));
    await waitFor(() => expect(mocks.refetch).toHaveBeenCalledTimes(1));
  });

  it('sem erro, o painel do chat continua sendo renderizado', async () => {
    render(buildUi());

    expect(await screen.findByTestId('chat-panel', undefined, ESPERA)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('não troca por tela de erro quando as mensagens já estão na tela (falha de refetch silencioso)', async () => {
    // O refetch silencioso de uma conversa já carregada também publica `error`; nesse caso
    // as mensagens visíveis não podem ser apagadas por causa da falha do refresh.
    mocks.messages = useMessagesState({
      error: 'Falha ao carregar mensagens',
      messages: [{ id: 'm-1', content: 'oi', message_type: 'text', sender: 'contact', created_at: '2026-09-01T10:00:00Z' }],
    });
    render(buildUi());

    expect(await screen.findByTestId('chat-panel', undefined, ESPERA)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
