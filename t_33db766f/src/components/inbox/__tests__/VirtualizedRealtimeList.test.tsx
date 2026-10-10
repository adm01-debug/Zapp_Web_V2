/**
 * Cobre os achados da auditoria A11Y-CHAT_INBOX_TEAMS-06/-07 e A11Y-CONTATOS_CRM-08:
 * 1) badge de canal (Instagram/Telegram) nao deve renderizar (proibido pelo produto)
 * 2) botao de favorito esta fora do role=button da linha (nao confunde o teclado)
 * 3) acoes (favoritar/resolver/transferir/fixar/adiar) com area >= 24x24 (44 no celular)
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

describe('VirtualizedRealtimeList — badge de canal (Instagram/Telegram nao renderizam)', () => {
  beforeEach(() => {
    agentsMapMock = new Map();
  });

  it('nao mostra badge de canal para Instagram nem Telegram, mas mostra para Facebook', () => {
    const conversations = [
      makeConversation({ id: 'insta-1', channel_type: 'instagram' }),
      makeConversation({ id: 'tele-1', channel_type: 'telegram' }),
      makeConversation({ id: 'fb-1', channel_type: 'messenger' }),
      makeConversation({ id: 'wpp-1', channel_type: 'whatsapp' }),
      makeConversation({ id: 'wpp-2', channel_type: null }),
    ];
    const { container } = renderList(conversations);

    const badges = container.querySelectorAll('span.w-5.h-5.rounded-full[aria-hidden="true"]');
    // So Facebook (messenger) deve renderizar badge — Instagram, Telegram e WhatsApp nao.
    expect(badges.length).toBe(1);
  });

  it('esconde o mini-avatar quando a conversa e do proprio usuario logado', () => {
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

  it('sem entrada no agentsMap para o assigned_to, nao quebra e nao mostra mini-avatar', () => {
    agentsMapMock = new Map();
    const conversations = [makeConversation({ id: 'orphan-assignment', assigned_to: OTHER_AGENT_ID })];
    renderList(conversations);

    expect(screen.queryAllByRole('img', { name: /Atendido por/i })).toHaveLength(0);
  });
});

describe('VirtualizedRealtimeList — favorito fora do role=button da linha', () => {
  beforeEach(() => {
    agentsMapMock = new Map();
  });

  it('o botao Favoritar nao e descendente do elemento role=button da linha', () => {
    const onFavorite = vi.fn();
    const conversations = [makeConversation({ id: 'c1' })];
    renderList(conversations, { onFavorite, favoriteIds: new Set(['c1']) });

    const row = screen.getByTestId('conversation-item');
    const rowButton = row.querySelector('[role="button"]');
    const favoriteBtn = screen.getByRole('button', { name: 'Remover favorito' });
    expect(favoriteBtn).not.toBeNull();
    expect(rowButton?.contains(favoriteBtn)).toBeFalsy();
  });

  it('clicar no favoritar chama onFavorite e nao dispara onSelectConversation', () => {
    const onFavorite = vi.fn();
    const onSelect = vi.fn();
    const conversations = [makeConversation({ id: 'c1' })];
    renderList(conversations, { onFavorite, onSelectConversation: onSelect, favoriteIds: new Set() });

    fireEvent.click(screen.getByRole('button', { name: 'Favoritar conversa' }));
    expect(onFavorite).toHaveBeenCalledWith('c1');
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('VirtualizedRealtimeList — acoes com area de toque >= 24x24 (44 no celular)', () => {
  beforeEach(() => {
    agentsMapMock = new Map();
  });

  it('as 5 acoes tem min-h e min-w >= 24px por classe', () => {
    const conversations = [makeConversation({ id: 'c1' })];
    renderList(conversations);

    const buttons = screen.getAllByRole('button');
    const actionLabels = ['Resolver conversa', 'Transferir conversa', 'Fixar conversa', 'Adiar conversa', 'Arquivar conversa', 'Favoritar conversa', 'Remover favorito'];
    const actionButtons = buttons.filter(b => actionLabels.includes(b.getAttribute('aria-label') || ''));

    for (const btn of actionButtons) {
      const minH = btn.classList.contains('min-h-6');
      const minW = btn.classList.contains('min-w-6');
      expect(minH, `${btn.getAttribute('aria-label')} tem min-h-6`).toBeTruthy();
      expect(minW, `${btn.getAttribute('aria-label')} tem min-w-6`).toBeTruthy();
    }
  });

  it('as 5 acoes tem min-h/min-w >= 44px no breakpoint max-md', () => {
    const conversations = [makeConversation({ id: 'c1' })];
    renderList(conversations);

    const buttons = screen.getAllByRole('button');
    const actionLabels = ['Resolver conversa', 'Transferir conversa', 'Fixar conversa', 'Adiar conversa', 'Arquivar conversa', 'Favoritar conversa', 'Remover favorito'];
    const actionButtons = buttons.filter(b => actionLabels.includes(b.getAttribute('aria-label') || ''));

    for (const btn of actionButtons) {
      const maxMdMinH = btn.classList.contains('max-md:min-h-11');
      const maxMdMinW = btn.classList.contains('max-md:min-w-11');
      expect(maxMdMinH, `${btn.getAttribute('aria-label')} tem max-md:min-h-11`).toBeTruthy();
      expect(maxMdMinW, `${btn.getAttribute('aria-label')} tem max-md:min-w-11`).toBeTruthy();
    }
  });
});

describe('VirtualizedRealtimeList — popover de snooze', () => {
  beforeEach(() => {
    agentsMapMock = new Map();
  });

  it('clicar numa opcao chama onSnooze com a duracao', () => {
    const onSnooze = vi.fn();
    renderList([makeConversation({ id: 'c1' })], { onSnooze });

    fireEvent.click(screen.getByRole('button', { name: 'Amanhã às 9h' }));
    expect(onSnooze).toHaveBeenCalledWith('c1', 'tomorrow');
    fireEvent.click(screen.getByRole('button', { name: 'Em 1 hora' }));
    expect(onSnooze).toHaveBeenCalledWith('c1', '1h');
    expect(onSnooze).toHaveBeenCalledTimes(2);
  });

  it('sem onSnooze, o conteudo do popover nao e renderizado', () => {
    renderList([makeConversation({ id: 'c1' })]);
    expect(screen.queryByRole('button', { name: 'Amanhã às 9h' })).not.toBeInTheDocument();
  });
});

describe('VirtualizedRealtimeList — SLA nao e 1:1 com o contato', () => {
  beforeEach(() => {
    agentsMapMock = new Map();
  });

  it('usa a linha de conversation_sla aberta (first_response_at null), nao a primeira do array', () => {
    const conversation = makeConversation({ id: 'c1' });
    (conversation.contact as unknown as {
      conversation_sla: Array<{ first_message_at: string; first_response_at: string | null }>;
    }).conversation_sla = [
      { first_message_at: '2026-01-01T00:00:00Z', first_response_at: '2026-01-01T00:10:00Z' },
      { first_message_at: '2026-09-24T11:00:00Z', first_response_at: null },
    ];

    renderList([conversation]);
    expect(screen.getByRole('status', { name: /SLA/i })).toBeInTheDocument();
  });

  it('sem nenhuma linha aberta em conversation_sla, nao mostra SLA', () => {
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
