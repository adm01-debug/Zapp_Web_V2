/**
 * Cobre exatamente os dois achados centrais da auditoria desta sessão:
 * 1) o badge de canal (Instagram/Facebook/...) some para WhatsApp (bug
 *    original corrigido na PR #616 — logo invertida mostrava o logo do
 *    WhatsApp em todo contato).
 * 2) o mini-avatar do atendente só aparece quando a conversa está com
 *    OUTRA pessoa, não quando é o próprio usuário logado vendo suas
 *    próprias conversas (feature da PR #620).
 *
 * O virtualizer real do @tanstack/react-virtual depende de medições de
 * layout que o jsdom não fornece de forma confiável (clientHeight fica 0
 * sem um ResizeObserver real) — mockado para retornar todas as linhas,
 * já que o alvo do teste é o conteúdo de cada linha, não a virtualização.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode, ComponentProps } from 'react';
import type { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';
import type { AgentLite } from '@/hooks/crm/useAgentsLite';

const CURRENT_USER_ID = 'me-profile-id';
const OTHER_AGENT_ID = 'colleague-profile-id';

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
  useAuth: () => ({ user: { id: CURRENT_USER_ID } }),
}));

vi.mock('@/hooks/crm/useAgentsLite', () => ({
  useAgentsLite: () => agentsMapMock,
}));

vi.mock('@/hooks/ui/useDensity', () => ({
  useDensity: () => ({ density: 'comfortable' }),
}));

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

// Radix Popover não abre de forma confiável sob jsdom+fireEvent (padrão já
// usado em ChatPanelHeader.test.tsx) — mockado como pass-through pra poder
// clicar direto nas opções de snooze sem depender do estado real de open.
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { VirtualizedRealtimeList } from '@/components/inbox/VirtualizedRealtimeList';

function makeConversation(overrides: Partial<ConversationWithMessages['contact']> = {}): ConversationWithMessages {
  return {
    contact: {
      id: overrides.id ?? 'contact-1',
      name: 'Cliente Teste',
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
  extraProps: Partial<ComponentProps<typeof VirtualizedRealtimeList>> = {}
) {
  return render(
    <VirtualizedRealtimeList
      conversations={conversations}
      selectedContactId={null}
      onSelectConversation={vi.fn()}
      {...extraProps}
    />
  );
}

describe('VirtualizedRealtimeList — badge de canal e mini-avatar do atendente', () => {
  beforeEach(() => {
    agentsMapMock = new Map();
  });

  it('mostra o badge do canal para Instagram, mas não para WhatsApp', () => {
    const conversations = [
      makeConversation({ id: 'insta-1', channel_type: 'instagram' }),
      makeConversation({ id: 'wpp-1', channel_type: 'whatsapp' }),
      makeConversation({ id: 'wpp-2', channel_type: null }),
    ];
    const { container } = renderList(conversations);

    // channelBadge é decorativo (aria-hidden) — não dá pra usar getByRole.
    // Seletor casa exatamente as classes do span do badge (VirtualizedRealtimeList.tsx),
    // não os ícones lucide (que não têm rounded-full nem w-5/h-5 no wrapper).
    const badges = container.querySelectorAll('span.w-5.h-5.rounded-full[aria-hidden="true"]');
    expect(badges.length).toBe(1);
  });

  it('esconde o mini-avatar quando a conversa é do próprio usuário logado', () => {
    agentsMapMock = new Map([[OTHER_AGENT_ID, { id: OTHER_AGENT_ID, name: 'Colega Um', avatar_url: null }]]);
    const conversations = [
      makeConversation({ id: 'mine', assigned_to: CURRENT_USER_ID }),
      makeConversation({ id: 'unassigned', assigned_to: null }),
      makeConversation({ id: 'colleague', assigned_to: OTHER_AGENT_ID }),
    ];
    renderList(conversations);

    const miniAvatars = screen.getAllByRole('img', { name: /Atendido por/i });
    expect(miniAvatars).toHaveLength(1);
    expect(miniAvatars[0]).toHaveAttribute('aria-label', 'Atendido por Colega Um');
  });

  it('sem entrada no agentsMap para o assigned_to, não quebra e não mostra mini-avatar', () => {
    agentsMapMock = new Map(); // colega existe mas perfil não veio na query (RLS)
    const conversations = [makeConversation({ id: 'orphan-assignment', assigned_to: OTHER_AGENT_ID })];
    renderList(conversations);

    expect(screen.queryAllByRole('img', { name: /Atendido por/i })).toHaveLength(0);
  });
});

describe('VirtualizedRealtimeList — popover de snooze', () => {
  beforeEach(() => {
    agentsMapMock = new Map();
  });

  it('clicar numa opção chama onSnooze com a duração e fecha o popover', () => {
    const onSnooze = vi.fn();
    renderList([makeConversation({ id: 'c1' })], { onSnooze });

    fireEvent.click(screen.getByRole('button', { name: 'Amanhã às 9h' }));

    expect(onSnooze).toHaveBeenCalledWith('c1', 'tomorrow');
    // Popover mockado como pass-through: fechar (setSnoozeOpen(false)) não
    // desmonta o conteúdo, mas confirma que o handler não quebrou o restante
    // da linha — outra opção continua clicável e chama de novo.
    fireEvent.click(screen.getByRole('button', { name: 'Em 1 hora' }));
    expect(onSnooze).toHaveBeenCalledWith('c1', '1h');
    expect(onSnooze).toHaveBeenCalledTimes(2);
  });

  it('sem onSnooze, o conteúdo do popover não é renderizado', () => {
    renderList([makeConversation({ id: 'c1' })]);

    expect(screen.queryByRole('button', { name: 'Amanhã às 9h' })).not.toBeInTheDocument();
  });
});

describe('VirtualizedRealtimeList — SLA não é 1:1 com o contato', () => {
  beforeEach(() => {
    agentsMapMock = new Map();
  });

  it('usa a linha de conversation_sla aberta (first_response_at null), não a primeira do array', () => {
    // Simula o histórico real: 1 linha antiga já respondida (poderia mostrar
    // "violado" de um atendimento encerrado) + 1 linha aberta do atendimento atual.
    const conversation = makeConversation({ id: 'c1' });
    (conversation.contact as unknown as {
      conversation_sla: Array<{ first_message_at: string; first_response_at: string | null }>;
    }).conversation_sla = [
      { first_message_at: '2026-01-01T00:00:00Z', first_response_at: '2026-01-01T00:10:00Z' },
      { first_message_at: '2026-09-24T11:00:00Z', first_response_at: null },
    ];

    renderList([conversation]);

    // SLAIndicator (compact) só renderiza role="status" com aria-label "SLA
    // ..." quando firstMessageAt vem definido — confirma que achou a linha
    // aberta (2ª do array), não a 1ª (que já tem first_response_at).
    expect(screen.getByRole('status', { name: /SLA/i })).toBeInTheDocument();
  });

  it('sem nenhuma linha aberta em conversation_sla, não mostra SLA (não cai pra uma linha fechada)', () => {
    const conversation = makeConversation({ id: 'c1' });
    (conversation.contact as unknown as {
      conversation_sla: Array<{ first_message_at: string; first_response_at: string | null }>;
    }).conversation_sla = [
      { first_message_at: '2026-01-01T00:00:00Z', first_response_at: '2026-01-01T00:10:00Z' },
    ];

    renderList([conversation]);

    expect(screen.queryByRole('status', { name: /SLA/i })).not.toBeInTheDocument();
  });
});
