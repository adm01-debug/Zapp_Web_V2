/**
 * Item L3 da paridade V3 -> V2 (achados_1_indicadores_paineis.md): sentimento na
 * linha da lista de conversas.
 *
 * Regra do cartão: a linha mostra um SELO acessível só quando o cliente pede
 * atenção (negativo/crítico); neutro/positivo/desconhecido NÃO mostram nada. O
 * nome acessível é pt-BR ("Cliente insatisfeito") — nunca emoji como único
 * sinal. O valor CRU do banco passa pelo mapeador único `sentimentLevel`.
 *
 * Segue o mesmo padrão de mocks de VirtualizedRealtimeList.displayName.test.tsx.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode, ComponentProps } from 'react';
import type { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';
import type { AgentLite } from '@/hooks/crm/useAgentsLite';

const CURRENT_USER_ID = 'me-profile-id';

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
      nickname: null,
      job_title: null,
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

function renderList(conversations: ConversationWithMessages[]) {
  return render(
    <VirtualizedRealtimeList
      conversations={conversations}
      selectedContactId={null}
      onSelectConversation={vi.fn()}
    />
  );
}

/** O selo de sentimento é o único elemento com nome acessível de insatisfação. */
function seal() {
  return screen.queryByRole('img', { name: /insatisfeito/i });
}

describe('VirtualizedRealtimeList — selo de sentimento na linha (L3)', () => {
  beforeEach(() => {
    agentsMapMock = new Map();
  });

  it('contato crítico mostra o selo com nome acessível pt-BR', () => {
    renderList([makeConversation({ id: 'c1', name: 'João', ai_sentiment: 'critico' })]);
    const el = seal();
    expect(el).not.toBeNull();
    expect(el).toHaveAttribute('role', 'img');
    expect(el?.getAttribute('aria-label')).toMatch(/insatisfeito/i);
  });

  it('contato negativo mostra o selo com nome acessível', () => {
    renderList([makeConversation({ id: 'c1', name: 'João', ai_sentiment: 'negativo' })]);
    expect(seal()).not.toBeNull();
  });

  it('legado EN "critical" cai no mesmo selo (mapeador único)', () => {
    renderList([makeConversation({ id: 'c1', name: 'João', ai_sentiment: 'critical' })]);
    expect(seal()).not.toBeNull();
  });

  it('neutro NÃO mostra selo', () => {
    renderList([makeConversation({ id: 'c1', name: 'João', ai_sentiment: 'neutro' })]);
    expect(seal()).toBeNull();
  });

  it('positivo NÃO mostra selo', () => {
    renderList([makeConversation({ id: 'c1', name: 'João', ai_sentiment: 'positivo' })]);
    expect(seal()).toBeNull();
  });

  it('sentimento desconhecido NÃO mostra selo (nada inventado)', () => {
    renderList([makeConversation({ id: 'c1', name: 'João', ai_sentiment: 'xpto' })]);
    expect(seal()).toBeNull();
  });

  it('sem sentimento NÃO mostra selo', () => {
    renderList([makeConversation({ id: 'c1', name: 'João', ai_sentiment: null })]);
    expect(seal()).toBeNull();
  });
});
