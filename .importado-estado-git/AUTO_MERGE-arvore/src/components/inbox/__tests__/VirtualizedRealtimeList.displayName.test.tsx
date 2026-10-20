/**
 * Casos-limite da lógica de displayName (nickname vs firstName) e da linha
 * de job_title em VirtualizedRealtimeList.tsx. Segue o mesmo padrão de
 * mocks de VirtualizedRealtimeList.test.tsx.
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

describe('VirtualizedRealtimeList — displayName (nickname vs firstName)', () => {
  beforeEach(() => {
    agentsMapMock = new Map();
  });

  it('nickname null usa o firstName', () => {
    renderList([makeConversation({ id: 'c1', name: 'João Silva', nickname: null })]);
    expect(screen.getByText('João')).toBeInTheDocument();
  });

  it('nickname string vazia "" usa o firstName (sem "· company" quebrado)', () => {
    renderList([
      makeConversation({ id: 'c1', name: 'João Silva', nickname: '', company: 'ACME' }),
    ]);
    expect(screen.getByText('João · ACME')).toBeInTheDocument();
    // Garante que não sobrou "· ACME" sem o nome (nickname vazio tratado
    // como falsy) nem um "  · ACME" com espaço fantasma do nickname vazio.
    expect(screen.queryByText('· ACME')).not.toBeInTheDocument();
    expect(screen.queryByText(' · ACME')).not.toBeInTheDocument();
  });

  it('nickname só espaços "   " cai no firstName por causa do .trim()', () => {
    renderList([makeConversation({ id: 'c1', name: 'João Silva', nickname: '   ' })]);
    expect(screen.getByText('João')).toBeInTheDocument();
  });

  it('nickname válido com espaços nas pontas é trimado ao exibir', () => {
    renderList([makeConversation({ id: 'c1', name: 'João Silva', nickname: ' Zé ' })]);
    expect(screen.getByText('Zé')).toBeInTheDocument();
    expect(screen.queryByText(' Zé ')).not.toBeInTheDocument();
  });

  it('nickname com emoji/acentos não quebra o render', () => {
    renderList([makeConversation({ id: 'c1', name: 'João Silva', nickname: 'Zé 🚀' })]);
    expect(screen.getByText('Zé 🚀')).toBeInTheDocument();
  });

  it('contact.name com uma palavra só: split(\' \')[0] retorna a palavra inteira, sem erro', () => {
    renderList([makeConversation({ id: 'c1', name: 'Madonna', nickname: null })]);
    expect(screen.getByText('Madonna')).toBeInTheDocument();
  });
});

describe('VirtualizedRealtimeList — linha de job_title', () => {
  beforeEach(() => {
    agentsMapMock = new Map();
  });

  it('job_title null: a linha não aparece no DOM', () => {
    const { container } = renderList([
      makeConversation({ id: 'c1', name: 'João Silva', job_title: null }),
    ]);
    expect(container.querySelector('p.text-2xs.text-muted-foreground.truncate.-mt-0\\.5')).not.toBeInTheDocument();
  });

  it('job_title undefined: a linha não aparece no DOM', () => {
    const conversation = makeConversation({ id: 'c1', name: 'João Silva' });
    delete (conversation.contact as { job_title?: string | null }).job_title;
    const { container } = renderList([conversation]);
    expect(container.querySelector('p.text-2xs.text-muted-foreground.truncate.-mt-0\\.5')).not.toBeInTheDocument();
  });

  it('job_title string vazia "": a linha não aparece (falsy já tratado pela condição atual)', () => {
    const { container } = renderList([
      makeConversation({ id: 'c1', name: 'João Silva', job_title: '' }),
    ]);
    expect(container.querySelector('p.text-2xs.text-muted-foreground.truncate.-mt-0\\.5')).not.toBeInTheDocument();
  });

  it('job_title muito longo (200+ caracteres): renderiza com a classe truncate aplicada', () => {
    const longTitle = 'Diretor'.repeat(40); // 280 caracteres
    renderList([
      makeConversation({ id: 'c1', name: 'João Silva', job_title: longTitle }),
    ]);
    const el = screen.getByText(longTitle);
    expect(el).toHaveClass('truncate');
    expect(el.textContent).toHaveLength(280);
  });

  it('nickname + job_title + company simultâneos: as 3 informações aparecem sem conflito', () => {
    renderList([
      makeConversation({
        id: 'c1',
        name: 'João Silva',
        nickname: 'Zé',
        job_title: 'Gerente de Compras',
        company: 'ACME Ltda',
      }),
    ]);
    expect(screen.getByText('Zé · ACME Ltda')).toBeInTheDocument();
    expect(screen.getByText('Gerente de Compras')).toBeInTheDocument();
  });
});
