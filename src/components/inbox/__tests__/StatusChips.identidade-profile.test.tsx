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
 *
 * Os números dos chips agora nascem em `useInboxFilters.chipCounts` (contados
 * por `countByChip` com o `profileId` que vem do AuthProvider, como
 * RealtimeInboxView faz) e o StatusChips só os exibe — por isso o caminho
 * testado aqui é AuthProvider → useInboxFilters → StatusChips, o mesmo de
 * produção.
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StatusChips } from '../conversation-list/StatusChips';
import { useInboxFilters } from '@/hooks/inbox/useInboxFilters';
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

import { useAuth } from '@/hooks/auth/useAuth';

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

/** Mesmo encanamento do inbox: profileId sai do AuthProvider, chips leem chipCounts. */
function ChipsComoNoInbox({ conversations }: { conversations: ConversationWithMessages[] }) {
  const { profile } = useAuth();
  const inboxFilters = useInboxFilters({ conversations, profileId: profile?.id });
  return <StatusChips counts={inboxFilters.chipCounts} chipTab="all" onChipTabChange={() => {}} />;
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
      makeConversation({ id: 'minha', assigned_to: MY_PROFILE_ID, conversation_status: 'open' }),
      makeConversation({ id: 'do-colega', assigned_to: OUTRO_PROFILE_ID, conversation_status: 'open' }),
      makeConversation({ id: 'sem-dono', assigned_to: null, conversation_status: 'waiting' }),
    ];

    render(<ChipsComoNoInbox conversations={conversations} />, { wrapper: MemoryRouter });

    // Só a conversa com assigned_to = profile.id do logado entra no contador.
    // "Aguardando" segue o status persistido (contacts.conversation_status),
    // como a lista: por isso a conversa sem dono é criada como 'waiting'.
    expect(screen.getByTestId('status-chip-attending')).toHaveTextContent('1');
    expect(screen.getByTestId('status-chip-waiting')).toHaveTextContent('1');
  });

  it('NÃO conta a conversa cujo assigned_to coincide com o AUTH id (auth id não é profile id)', () => {
    const conversations = [makeConversation({ id: 'auth-nao-e-profile', assigned_to: AUTH_USER_ID, conversation_status: 'open' })];

    render(<ChipsComoNoInbox conversations={conversations} />, { wrapper: MemoryRouter });

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
    const conversations = [makeConversation({ id: 'sem-profile-id', assigned_to: undefined, conversation_status: 'waiting' })];

    render(<ChipsComoNoInbox conversations={conversations} />, { wrapper: MemoryRouter });

    // Sem o guard `profileId != null`, undefined === undefined faria a conversa
    // sem responsável entrar indevidamente em "Em atendimento".
    expect(screen.getByTestId('status-chip-attending')).toHaveTextContent('0');
    expect(screen.getByTestId('status-chip-waiting')).toHaveTextContent('1');
  });
});
