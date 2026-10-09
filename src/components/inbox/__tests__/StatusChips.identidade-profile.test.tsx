/**
 * R2-INB-056 (#349) — identidade do contador "Em atendimento".
 *
 * Regressão protegida: se o contador voltar a comparar `contact.assigned_to`
 * (que é `profiles.id`) com `user.id` do AuthProvider (que é `auth.users.id`),
 * contas em que os dois UUIDs divergem — o caso normal — voltam a zerar
 * "Em atendimento" e deixam de bater com o filtro da lista (`useInboxFilters`
 * já compara com `profile.id`). Na base dia/2026-10-07, essa comparação já
 * estava correta; este arquivo fixa a prova de regressão.
 *
 * Identidade correta do usuário logado para comparar com `assigned_to`:
 * `profile.id`. Este teste usa UUIDs DISTINTOS para `user.id` e `profile.id`
 * para que a troca fique visível: com a comparação errada ele fica vermelho.
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusChips } from '../conversation-list/StatusChips';
import type { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';

const AUTH_USER_ID = 'auth-user-1111-aaaa'; // auth.users.id  → user.id
const MY_PROFILE_ID = 'meu-profile-2222-bbbb'; // profiles.id do usuário logado
const OUTRO_PROFILE_ID = 'outro-profile-3333-cccc';

const authState = vi.hoisted(() => ({
  current: {
    user: { id: 'auth-user-1111-aaaa' },
    profile: { id: 'meu-profile-2222-bbbb' } as { id?: string } | null,
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => authState.current,
}));

function makeConversation(
  overrides: Partial<ConversationWithMessages['contact']> & { hasMessages?: boolean; unreadCount?: number }
): ConversationWithMessages {
  const { hasMessages = true, unreadCount = 0, ...contactOverrides } = overrides;
  return {
    contact: {
      id: contactOverrides.id ?? 'c1',
      assigned_to: null,
      ...contactOverrides,
    } as ConversationWithMessages['contact'],
    messages: hasMessages ? [{ id: 'm1' } as never] : [],
    unreadCount,
    lastMessage: null,
  };
}

describe('StatusChips — identidade do contador "Em atendimento" (R2-INB-056)', () => {
  beforeEach(() => {
    authState.current = {
      user: { id: AUTH_USER_ID },
      profile: { id: MY_PROFILE_ID },
    };
  });

  it('conta a conversa atribuída ao PROFILE id do usuário logado', () => {
    const conversations = [
      makeConversation({ id: 'minha', assigned_to: MY_PROFILE_ID }),
      makeConversation({ id: 'do-colega', assigned_to: OUTRO_PROFILE_ID }),
      makeConversation({ id: 'sem-dono', assigned_to: null }),
    ];

    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={() => {}} />);

    // Só a conversa com assigned_to = profile.id do logado entra no contador.
    expect(screen.getByTestId('status-chip-attending')).toHaveTextContent('1');
    expect(screen.getByTestId('status-chip-waiting')).toHaveTextContent('1');
  });

  it('NÃO conta a conversa cujo assigned_to coincide com o AUTH id (auth id não é profile id)', () => {
    const conversations = [makeConversation({ id: 'auth-nao-e-profile', assigned_to: AUTH_USER_ID })];

    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={() => {}} />);

    // assigned_to guarda profiles.id; bater com o auth id não pode virar "meu atendimento".
    expect(screen.getByTestId('status-chip-attending')).toHaveTextContent('0');
  });

  it.each([
    ['profile nulo', null],
    ['profile sem id', {}],
  ] as const)('não conta assigned_to undefined como atendimento quando %s', (_cenario, profile) => {
    authState.current = {
      user: { id: AUTH_USER_ID },
      profile,
    };
    const conversations = [makeConversation({ id: 'sem-profile-id', assigned_to: undefined })];

    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={() => {}} />);

    // Sem o guard `profileId != null`, undefined === undefined faria a conversa
    // sem responsável entrar indevidamente em "Em atendimento".
    expect(screen.getByTestId('status-chip-attending')).toHaveTextContent('0');
    expect(screen.getByTestId('status-chip-waiting')).toHaveTextContent('1');
  });
});
