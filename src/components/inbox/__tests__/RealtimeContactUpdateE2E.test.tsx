/**
 * Teste de integração ponta-a-ponta (gap de cobertura apontado em auditoria):
 * useRealtimeMessages() + VirtualizedRealtimeList JUNTOS, exatamente como a
 * árvore real do inbox conecta os dois (ver RealtimeInboxView.tsx /
 * ConversationListSidebar.tsx: useRealtimeInbox -> conversations ->
 * VirtualizedRealtimeList). Cada peça já tem cobertura isolada:
 *   - useRealtimeMessages.test.tsx: o hook sozinho, com client mockado.
 *   - VirtualizedRealtimeList.displayName.test.tsx: a lista sozinha, com
 *     `conversations` estático passado por prop.
 * O que nunca foi provado: que um evento realtime de verdade, passando pelo
 * hook de verdade, produz uma mudança de TEXTO VISÍVEL NO DOM da lista real,
 * sem desmontar/remontar nada.
 *
 * Mock do client + canal compartilhado: reaproveita o padrão já corrigido em
 * useRealtimeMessages.test.tsx (um canal real por tópico físico, indexado por
 * `:tabela:` no nome do tópico — indexar só por `filter.event` misturava os
 * handlers de "messages" e "contacts" no mesmo slot e o mais recente
 * sobrescrevia o anterior). Não reintroduzir esse bug.
 *
 * Refazer 1 (t_36119648) — janela de falha exclusiva (exclusive-failure-window):
 * cada teste tem UMA janela: todo estímulo mutável (o emit realtime) executa
 * dentro de UM bloco act (bloco target) e TODAS as asserções do
 * comportamento-alvo ficam dentro de UM ÚNICO waitFor (a janela). As
 * pré-condições de seed ficam FORA da janela — se vermelhar fora, é setup,
 * nunca o alvo. Nada fora do alvo pode vermelhar o teste; qualquer mutante no
 * caminho do alvo (não atualiza, troca merge por replace, cria linha fantasma,
 * derruba a guarda de id) vermelha DENTRO da janela, com o nome do teste no
 * resumo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { AgentLite } from '@/hooks/crm/useAgentsLite';

type MockRealtimePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
};

const CURRENT_USER_ID = 'me-profile-id';
let agentsMapMock: Map<string, AgentLite> = new Map();

const mockFrom = vi.fn();
const mockRemoveChannel = vi.fn();
const realtimeHandlersByTopic: Record<string, (payload: MockRealtimePayload) => void> = {};

const mockChannel = vi.fn((topic: string) => {
  const instance = {
    on: vi.fn((_: string, __: { event: string }, handler: (payload: MockRealtimePayload) => void) => {
      realtimeHandlersByTopic[topic] = handler;
      return instance;
    }),
    subscribe: vi.fn((callback?: (status: string) => void) => {
      callback?.('SUBSCRIBED');
      return instance;
    }),
  };
  return instance;
});

function emitRealtimeEvent(tableSuffix: string, payload: MockRealtimePayload) {
  const topic = Object.keys(realtimeHandlersByTopic).find((t) => t.includes(`:${tableSuffix}:`));
  if (!topic) throw new Error(`Nenhum canal realtime assinado para a tabela "${tableSuffix}"`);
  realtimeHandlersByTopic[topic](payload);
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: Parameters<typeof mockFrom>) => mockFrom(...args),
    channel: (...args: Parameters<typeof mockChannel>) => mockChannel(...args),
    removeChannel: (...args: Parameters<typeof mockRemoveChannel>) => mockRemoveChannel(...args),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
    functions: {
      invoke: vi.fn(),
    },
  },
}));

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: { soundEnabled: true, browserNotifications: false },
    isQuietHours: () => false,
  }),
}));

vi.mock('@/utils/notificationSounds', () => ({
  playNotificationSound: vi.fn(),
  showBrowserNotification: vi.fn(),
  requestNotificationPermission: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() , withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() })}),
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() })},
  logger: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() , withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() })}),
}));

// @tanstack/react-virtual depende de medições de layout que o jsdom não
// fornece de forma confiável (clientHeight fica 0) — mesmo mock usado em
// VirtualizedRealtimeList.test.tsx, retorna todas as linhas sem virtualização.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: { count: number }) => ({
    getTotalSize: () => options.count * 80,
    getVirtualItems: () =>
      Array.from({ length: options.count }, (_, index) => ({ index, size: 80, start: index * 80, key: index })),
    measure: vi.fn(),
  }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: CURRENT_USER_ID } }),
}));

vi.mock('@/hooks/crm/useAgentsLite', () => ({
  useAgentsLite: () => agentsMapMock,
}));

vi.mock('@/hooks/ui/useDensity', () => ({
  useDensity: () => ({ density: 'comfortable' }),
}));

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

// Radix Popover não abre de forma confiável sob jsdom — mesmo pass-through
// usado em VirtualizedRealtimeList.test.tsx.
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { useRealtimeMessages } from '@/hooks/chat/useRealtimeMessages';
import { VirtualizedRealtimeList } from '@/components/inbox/VirtualizedRealtimeList';

type MockContact = Record<string, unknown>;
type MockMessage = Record<string, unknown>;

let seededContacts: MockContact[] = [];
let recentMessages: MockMessage[] = [];
let contactsById: Record<string, MockContact> = {};

function makeContact(overrides: MockContact = {}) {
  return {
    id: 'contact-1',
    name: 'Contato',
    surname: null,
    nickname: null,
    job_title: null,
    phone: '5511999999999',
    email: null,
    avatar_url: null,
    tags: [],
    company: null,
    assigned_to: null,
    queue_id: null,
    created_at: '2026-04-02T19:00:00Z',
    updated_at: '2026-04-02T19:00:00Z',
    whatsapp_connection_id: null,
    contact_type: 'cliente',
    channel_type: 'whatsapp',
    group_category: null,
    ai_sentiment: null,
    ai_priority: null,
    ...overrides,
  };
}

/** Linha de SLA aberta: atendimento recente, sem primeira resposta. */
function makeOpenSlaRow(firstMessageAtIso: string) {
  return { first_message_at: firstMessageAtIso, first_response_at: null, first_response_breached: false };
}

function makeContactsQuery() {
  return {
    select: vi.fn(() => ({
      order: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue({ data: seededContacts, error: null }),
      })),
      in: vi.fn((_: string, ids: string[]) =>
        Promise.resolve({ data: ids.map((id) => contactsById[id]).filter(Boolean), error: null })
      ),
      eq: vi.fn((_: string, value: string) => ({
        maybeSingle: vi.fn().mockResolvedValue({ data: contactsById[value] ?? null, error: null }),
      })),
    })),
  };
}

interface MockMessagesChain {
  not: () => MockMessagesChain;
  neq: () => MockMessagesChain;
  order: () => { limit: () => Promise<{ data: MockMessage[]; error: null }> };
}

function makeMessagesQuery() {
  const chain: MockMessagesChain = {
    not: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    order: vi.fn(() => ({
      limit: vi.fn().mockResolvedValue({ data: recentMessages, error: null }),
    })),
  };
  return { select: vi.fn(() => chain) };
}

/**
 * Wrapper mínimo que replica a ligação real do inbox: o hook alimenta
 * `conversations` diretamente na lista, com as props obrigatórias que
 * RealtimeInboxView/ConversationListSidebar sempre passam
 * (onSelectConversation, selectedContactId).
 */
function InboxHarness() {
  const { conversations } = useRealtimeMessages();
  return (
    <VirtualizedRealtimeList
      conversations={conversations}
      selectedContactId={null}
      onSelectConversation={vi.fn()}
    />
  );
}

describe('Integração ponta-a-ponta: useRealtimeMessages + VirtualizedRealtimeList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seededContacts = [];
    recentMessages = [];
    contactsById = {};
    agentsMapMock = new Map();
    // NAO limpar realtimeHandlersByTopic aqui — mesmo motivo documentado em
    // useRealtimeMessages.test.tsx: o canal mockado é cacheado no módulo
    // real (acquireSharedChannel) entre testes deste arquivo.

    mockFrom.mockImplementation((table: string) => {
      if (table === 'contacts') return makeContactsQuery();
      if (table === 'messages') return makeMessagesQuery();
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
          order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }),
        }),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });
  });

  it('UPDATE realtime em contacts atualiza nickname/job_title visíveis no DOM da lista, sem remontar a linha', async () => {
    const contact = makeContact({
      id: 'contact-1',
      name: 'João Silva',
      nickname: null,
      job_title: null,
      // Atendimento aberto há 1 min (prazo de 5 min): selo "dentro do prazo".
      // O payload de UPDATE do Realtime só traz colunas de contacts, nunca o
      // embed conversation_sla — o merge do handler precisa preservar esta
      // linha, senão o selo recai para o created_at (abril) e vira "violado".
      conversation_sla: [makeOpenSlaRow(new Date(Date.now() - 60_000).toISOString())],
    });
    seededContacts = [contact];

    render(<InboxHarness />);

    // Pré-condições de seed, FORA da janela: se vermelhar aqui, é setup.
    expect(await screen.findByText('João')).toBeInTheDocument();
    expect(screen.queryByText('Apelido Novo')).not.toBeInTheDocument();
    expect(screen.queryByText('Cargo Novo')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'SLA dentro do prazo' })).toBeInTheDocument();

    const rowBefore = screen.getByTestId('conversation-item');

    // Bloco target: o ÚNICO estímulo mutável do teste. O `new` replica o
    // payload real (linha cheia de contacts, SEM o embed conversation_sla).
    const updatedContact = { ...contact, nickname: 'Apelido Novo', job_title: 'Cargo Novo' };
    delete (updatedContact as Record<string, unknown>).conversation_sla;
    act(() => {
      emitRealtimeEvent('contacts', { eventType: 'UPDATE', new: updatedContact, old: contact });
    });

    // Janela de falha exclusiva: TUDO que o alvo promete, num waitFor só —
    // texto novo, texto antigo fora, SLA preservado (merge, não replace) e o
    // mesmo nó DOM (sem remount). O DOM muda sozinho: render() chamado uma
    // única vez, nenhum rerender manual, nenhum unmount/remount.
    await waitFor(() => {
      expect(screen.getByText('Apelido Novo')).toBeInTheDocument();
      expect(screen.getByText('Cargo Novo')).toBeInTheDocument();
      // O nome antigo (primeiro nome, sem apelido) não aparece mais — a linha
      // foi atualizada, não duplicada.
      expect(screen.queryByText('João')).not.toBeInTheDocument();
      expect(screen.getByRole('status', { name: 'SLA dentro do prazo' })).toBeInTheDocument();
      expect(screen.getByTestId('conversation-item')).toBe(rowBefore);
    });
  });

  it('ignora UPDATE de contato fora da lista carregada (sem crash, sem linha fantasma) na árvore completa', async () => {
    seededContacts = [makeContact({ id: 'contact-1', name: 'Maria Souza' })];

    render(<InboxHarness />);

    // Pré-condição de seed, FORA da janela.
    expect(await screen.findByText('Maria')).toBeInTheDocument();

    // Bloco target: UPDATE de um contato que não está na lista.
    act(() => {
      emitRealtimeEvent('contacts', {
        eventType: 'UPDATE',
        new: makeContact({ id: 'contact-fantasma', nickname: 'Fantasma' }),
        old: makeContact({ id: 'contact-fantasma' }),
      });
    });

    // Janela de falha exclusiva: nenhum fantasma renderiza e a lista segue
    // com exatamente a linha do seed.
    await waitFor(() => {
      expect(screen.queryByText('Fantasma')).not.toBeInTheDocument();
      expect(screen.getAllByTestId('conversation-item')).toHaveLength(1);
    });
    expect(screen.getByText('Maria')).toBeInTheDocument();
  });

  it('ignora UPDATE sem contato (new vazio) sem crash e sem mudar a lista', async () => {
    seededContacts = [makeContact({ id: 'contact-1', name: 'Maria Souza' })];

    render(<InboxHarness />);

    // Pré-condição de seed, FORA da janela.
    expect(await screen.findByText('Maria')).toBeInTheDocument();

    // Bloco target: payload sem id — a guarda do handler retorna cedo.
    act(() => {
      emitRealtimeEvent('contacts', {
        eventType: 'UPDATE',
        new: null,
        old: makeContact({ id: 'contact-1', name: 'Maria Souza' }),
      });
    });

    // Janela de falha exclusiva: sem throw (o render sobrevive) e a lista
    // segue intacta com a linha do seed.
    await waitFor(() => {
      expect(screen.getByText('Maria')).toBeInTheDocument();
      expect(screen.getAllByTestId('conversation-item')).toHaveLength(1);
    });
  });
});
