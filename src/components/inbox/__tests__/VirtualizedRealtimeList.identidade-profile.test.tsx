/**
 * R2-INB-056 (#349) — identidade do badge/mini-avatar de responsável.
 *
 * Regressão protegida: se a linha voltar a esconder o mini-avatar "Atendido
 * por ..." comparando `contact.assigned_to` (que é `profiles.id`) com `user.id`
 * do AuthProvider (que é `auth.users.id`), UUIDs distintos fazem a própria
 * conversa do logado mostrar o badge com o próprio nome. Na base
 * dia/2026-10-07, essa comparação já estava correta; este arquivo fixa a prova
 * de regressão.
 *
 * Identidade correta para comparar com `assigned_to`: `profile.id`. Este teste
 * usa UUIDs DISTINTOS para `user.id` e `profile.id`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';
import type { AgentLite } from '@/hooks/crm/useAgentsLite';

const AUTH_USER_ID = 'auth-user-1111-aaaa'; // auth.users.id  → user.id
const MY_PROFILE_ID = 'meu-profile-2222-bbbb'; // profiles.id do usuário logado
const OUTRO_PROFILE_ID = 'outro-profile-3333-cccc';

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
  useAuth: () => ({ user: { id: AUTH_USER_ID }, profile: { id: MY_PROFILE_ID } }),
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

function makeConversation(overrides: Partial<ConversationWithMessages['contact']> = {}): ConversationWithMessages {
  // conversation_sla com uma única linha FECHADA: mantém o SLA fora da linha,
  // para o teste olhar só o mini-avatar do responsável.
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
      conversation_sla: [{ first_message_at: '2026-09-24T10:00:00Z', first_response_at: '2026-09-24T10:05:00Z' }],
      ...overrides,
    } as unknown as ConversationWithMessages['contact'],
    messages: [],
    unreadCount: 0,
    lastMessage: null,
  };
}

function renderList(conversations: ConversationWithMessages[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <VirtualizedRealtimeList
        conversations={conversations}
        selectedContactId={null}
        onSelectConversation={vi.fn()}
      />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  agentsMapMock = new Map();
});

describe('VirtualizedRealtimeList — mini-avatar de responsável pela identidade certa (R2-INB-056)', () => {
  it('esconde o mini-avatar na conversa do PRÓPRIO logado (mesmo com o perfil dele no agentsMap)', () => {
    // O perfil do próprio logado ESTÁ no agentsMap: se a comparação usasse o
    // auth id, o badge apareceria com o próprio nome. A identidade certa é
    // profile.id, então o badge tem de ficar escondido.
    agentsMapMock = new Map([
      [MY_PROFILE_ID, { id: MY_PROFILE_ID, name: 'Eu Mesmo', avatar_url: null }],
      [OUTRO_PROFILE_ID, { id: OUTRO_PROFILE_ID, name: 'Colega Um', avatar_url: null }],
    ]);
    const conversations = [
      makeConversation({ id: 'minha', assigned_to: MY_PROFILE_ID }),
      makeConversation({ id: 'do-colega', assigned_to: OUTRO_PROFILE_ID }),
    ];

    renderList(conversations);

    const miniAvatars = screen.getAllByRole('img', { name: /Atendido por/i });
    expect(miniAvatars).toHaveLength(1);
    expect(miniAvatars[0]).toHaveAttribute('aria-label', 'Atendido por Colega Um');
  });
});
