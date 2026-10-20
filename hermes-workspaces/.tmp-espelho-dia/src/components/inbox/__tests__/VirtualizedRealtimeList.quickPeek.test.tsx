/**
 * QuickPeek na lista de conversas (paridade V3 — auditoria de UI, item B
 * "Quick Peek na lista de conversas"): hover na linha mostra balão com nome,
 * última mensagem, não lidas e estado, usando só o que a linha já recebe.
 *
 * Regressões protegidas aqui:
 *  - o balão só abre DEPOIS do atraso (500 ms) e não na conversa aberta;
 *  - em tela de toque (ponteiro grosso) o hover não abre nada;
 *  - o balão é complemento do hover: o foco de teclado sozinho NÃO abre
 *    (toda a informação do balão — nome, última mensagem, contagem — já está
 *    visível na própria linha).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';
import type { AgentLite } from '@/hooks/crm/useAgentsLite';

let agentsMapMock: Map<string, AgentLite> = new Map();

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: { count: number }) => ({
    getTotalSize: () => options.count * 80,
    getVirtualItems: () =>
      Array.from({ length: options.count }, (_, index) => ({ index, size: 80, start: index * 80, key: index })),
    measure: vi.fn(),
  }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'auth-user-1' }, profile: { id: 'profile-1' } }),
}));

vi.mock('@/hooks/crm/useAgentsLite', () => ({
  useAgentsLite: () => agentsMapMock,
}));

vi.mock('@/hooks/ui/useDensity', () => ({
  useDensity: () => ({ density: 'comfortable' }),
}));

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

vi.mock('@/hooks/sla/useApplicableSLA', () => ({
  useApplicableSLA: () => ({ data: undefined }),
}));

vi.mock('@/components/inbox/SLAIndicator', () => ({
  SLAIndicator: () => <div role="status" aria-label="SLA compacto" />,
}));

import { VirtualizedRealtimeList } from '@/components/inbox/VirtualizedRealtimeList';

const PEEK_DELAY_MS = 500;

function setPointer(overrides: Record<string, boolean>) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: overrides[query] ?? false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

function makeConversation(overrides: Partial<ConversationWithMessages['contact']> = {}): ConversationWithMessages {
  return {
    contact: {
      id: overrides.id ?? 'contact-1',
      name: 'Cliente Teste',
      nickname: null,
      conversation_status: 'open',
      channel_type: null,
      assigned_to: null,
      tags: [],
      ai_priority: null,
      ai_sentiment: null,
      contact_type: null,
      company: null,
      avatar_url: null,
      created_at: '2026-09-24T10:00:00Z',
      updated_at: '2026-09-24T10:00:00Z',
      ...overrides,
    } as unknown as ConversationWithMessages['contact'],
    messages: [],
    unreadCount: 0,
    lastMessage: null,
  };
}

function renderList(
  conversations: ConversationWithMessages[],
  selectedContactId: string | null = null
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <VirtualizedRealtimeList
        conversations={conversations}
        selectedContactId={selectedContactId}
        onSelectConversation={vi.fn()}
      />
    </QueryClientProvider>
  );
}

function hoverRow(index = 0) {
  fireEvent.mouseEnter(screen.getAllByTestId('conversation-item')[index]);
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  agentsMapMock = new Map();
  setPointer({});
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('VirtualizedRealtimeList — QuickPeek (pré-visualização por hover)', () => {
  it('não abre antes do atraso e abre depois, com nome, última mensagem e contagem', () => {
    renderList([
      makeConversation({
        id: 'c1',
        name: 'João Silva',
        conversation_status: 'open',
      }),
    ]);

    hoverRow();
    advance(PEEK_DELAY_MS - 1);
    expect(screen.queryByTestId('quick-peek')).not.toBeInTheDocument();

    advance(1);
    const balloon = screen.getByTestId('quick-peek');
    expect(within(balloon).getByText('João Silva')).toBeInTheDocument();
    expect(within(balloon).getByText('Sem novas')).toBeInTheDocument();
    expect(within(balloon).getByText('• Aberto')).toBeInTheDocument();
  });

  it('mostra a última mensagem e "N não lidas" quando há mensagem e não lidas', () => {
    const comMensagem = makeConversation({
      id: 'c1',
      name: 'Maria Souza',
      conversation_status: 'resolved',
    });
    comMensagem.lastMessage = {
      id: 'm1',
      content: 'Pode me enviar o orçamento?',
      created_at: '2026-09-24T10:05:00Z',
      sender_type: 'contact',
    } as unknown as ConversationWithMessages['lastMessage'];
    comMensagem.unreadCount = 3;

    renderList([comMensagem]);

    hoverRow();
    advance(PEEK_DELAY_MS);

    const balloon = screen.getByTestId('quick-peek');
    expect(within(balloon).getByText('Maria Souza')).toBeInTheDocument();
    expect(within(balloon).getByText('Pode me enviar o orçamento?')).toBeInTheDocument();
    expect(within(balloon).getByText('3 não lidas')).toBeInTheDocument();
    expect(within(balloon).getByText('• Resolvido')).toBeInTheDocument();
  });

  it('estado desconhecido não vira rótulo inventado (balão omite o estado)', () => {
    renderList([makeConversation({ id: 'c1', name: 'João Silva', conversation_status: 'inventado' })]);

    hoverRow();
    advance(PEEK_DELAY_MS);

    const balloon = screen.getByTestId('quick-peek');
    expect(within(balloon).getByText('João Silva')).toBeInTheDocument();
    expect(balloon.textContent).not.toContain('•');
  });

  it('em tela de toque (ponteiro grosso) o hover não abre o balão', () => {
    setPointer({ '(pointer: coarse)': true });
    renderList([makeConversation({ id: 'c1', name: 'João Silva' })]);

    hoverRow();
    advance(PEEK_DELAY_MS);
    expect(screen.queryByTestId('quick-peek')).not.toBeInTheDocument();
  });

  it('o foco de teclado sozinho não abre o balão (é complemento do hover)', () => {
    renderList([makeConversation({ id: 'c1', name: 'João Silva' })]);

    const row = screen.getAllByTestId('conversation-item')[0];
    act(() => {
      row.querySelector('[role="button"]')?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });
    advance(PEEK_DELAY_MS);
    expect(screen.queryByTestId('quick-peek')).not.toBeInTheDocument();
  });
});

describe('VirtualizedRealtimeList — QuickPeek desligado na conversa aberta', () => {
  it('não abre na conversa selecionada e continua abrindo nas outras', () => {
    renderList(
      [
        makeConversation({ id: 'aberta', name: 'Cliente Aberto' }),
        makeConversation({ id: 'outra', name: 'Cliente Outra' }),
      ],
      'aberta'
    );

    hoverRow(0);
    advance(PEEK_DELAY_MS);
    expect(screen.queryByTestId('quick-peek')).not.toBeInTheDocument();

    // controle: o mecanismo funciona na linha que não é a aberta
    hoverRow(1);
    advance(PEEK_DELAY_MS);
    expect(within(screen.getByTestId('quick-peek')).getByText('Cliente Outra')).toBeInTheDocument();
  });

  it('fechar a conversa aberta (prop muda) esconde o balão já aberto', async () => {
    // AnimatePresence + rAF: timers reais e espera de fato.
    vi.useRealTimers();
    const conversations = [makeConversation({ id: 'c1', name: 'João Silva' })];
    const { rerender } = renderList(conversations, null);

    hoverRow();
    await waitFor(() => expect(screen.getByTestId('quick-peek')).toBeInTheDocument());

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={queryClient}>
        <VirtualizedRealtimeList
          conversations={conversations}
          selectedContactId="c1"
          onSelectConversation={vi.fn()}
        />
      </QueryClientProvider>
    );
    // Enquanto o balão está saindo (AnimatePresence) ele já perdeu a opacidade
    // (opacity: 0 no style, e é pointer-events-none); quando some de vez, o
    // queryByTestId devolve null. Basta que uma das duas coisas seja verdade.
    await waitFor(() => {
      const balloon = screen.queryByTestId('quick-peek');
      expect(balloon === null || balloon.style.opacity === '0').toBe(true);
    });
  });
});
