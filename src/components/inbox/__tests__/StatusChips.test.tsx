import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatusChips } from '../conversation-list/StatusChips';
import type { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';

// R2-INB-056 (#349): o usuário logado tem DOIS ids distintos — o do auth
// (auth.users.id, exposto em `user`) e o do perfil (public.profiles.id, alvo
// da FK contacts.assigned_to). O mock dá valores DIFERENTES aos dois, como no
// runtime: um mock com o mesmo valor nos dois papéis esconderia o defeito do
// contador comparando o id errado (auth id no lugar do profile id).
const AUTH_USER_ID = 'auth-user-1';
const CURRENT_PROFILE_ID = 'perfil-atual-1';
const OTHER_PROFILE_ID = 'perfil-colega-2';

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: AUTH_USER_ID }, profile: { id: CURRENT_PROFILE_ID } }),
}));

function makeConversation(overrides: Partial<ConversationWithMessages['contact']> & { hasMessages?: boolean; unreadCount?: number }): ConversationWithMessages {
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

describe('StatusChips', () => {
  const conversations: ConversationWithMessages[] = [
    makeConversation({ id: 'c1', assigned_to: CURRENT_PROFILE_ID, unreadCount: 2 }),
    makeConversation({ id: 'c2', assigned_to: OTHER_PROFILE_ID }),
    makeConversation({ id: 'c3', assigned_to: null }),
    makeConversation({ id: 'c4', hasMessages: false }),
  ];

  it('renders the 6 chips (no Spam — não existe no modelo)', () => {
    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={() => {}} />);
    expect(screen.getByTestId('status-chip-all')).toBeInTheDocument();
    expect(screen.getByTestId('status-chip-unread')).toBeInTheDocument();
    expect(screen.getByTestId('status-chip-attending')).toBeInTheDocument();
    expect(screen.getByTestId('status-chip-waiting')).toBeInTheDocument();
    expect(screen.getByTestId('status-chip-resolved')).toBeInTheDocument();
    expect(screen.getByTestId('status-chip-archived')).toBeInTheDocument();
    expect(screen.queryByTestId('status-chip-spam')).not.toBeInTheDocument();
  });

  it('maps "Todas" to open conversations count', () => {
    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={() => {}} />);
    expect(screen.getByTestId('status-chip-all')).toHaveTextContent('3');
  });

  it('maps "Não lidas" to conversations with unreadCount > 0', () => {
    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={() => {}} />);
    expect(screen.getByTestId('status-chip-unread')).toHaveTextContent('1');
  });

  it('conta "Em atendimento" pelo profile.id logado, não pelo auth id (#349)', () => {
    // c1 está atribuída ao profile do usuário logado; c2 está com o perfil de
    // um colega e c3 não tem responsável. Comparando com o auth id — que não é
    // um profile id válido — o contador zeraria mesmo com a conversa atribuída
    // ao próprio usuário.
    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={() => {}} />);
    expect(screen.getByTestId('status-chip-attending').querySelector('span')?.textContent).toBe('1');
  });

  it('maps "Aguardando" to unassigned open conversations', () => {
    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={() => {}} />);
    expect(screen.getByTestId('status-chip-waiting')).toHaveTextContent('1');
  });

  it('maps "Resolvidas" to conversations with no messages', () => {
    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={() => {}} />);
    expect(screen.getByTestId('status-chip-resolved')).toHaveTextContent('1');
  });

  it('calls onChipTabChange with the clicked chip id', () => {
    const onChipTabChange = vi.fn();
    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={onChipTabChange} />);
    fireEvent.click(screen.getByTestId('status-chip-resolved'));
    expect(onChipTabChange).toHaveBeenCalledWith('resolved');
  });

  it('conta "Arquivadas" pelo conversation_status real e as exclui da lista ativa', () => {
    // Arquivada NÃO é "sem mensagens": o status persistido em
    // contacts.conversation_status é a fonte. c2 tem mensagens e não lidas, e
    // ainda assim sai de Todas/Não lidas/Em atendimento; c3 está sem responsável
    // e não entra em Aguardando. Todas são contadas em Arquivadas.
    const withArchived: ConversationWithMessages[] = [
      makeConversation({ id: 'c1', assigned_to: CURRENT_PROFILE_ID, unreadCount: 2 }),
      makeConversation({ id: 'c2', assigned_to: CURRENT_PROFILE_ID, unreadCount: 1, conversation_status: 'archived' }),
      makeConversation({ id: 'c3', assigned_to: null, conversation_status: 'archived' }),
      makeConversation({ id: 'c4', hasMessages: false, conversation_status: 'archived' }),
    ];
    render(<StatusChips conversations={withArchived} chipTab="all" onChipTabChange={() => {}} />);

    expect(screen.getByTestId('status-chip-archived')).toHaveTextContent('3');
    expect(screen.getByTestId('status-chip-all')).toHaveTextContent('1');
    expect(screen.getByTestId('status-chip-unread')).toHaveTextContent('1');
    expect(screen.getByTestId('status-chip-attending')).toHaveTextContent('1');
    expect(screen.getByTestId('status-chip-waiting')).toHaveTextContent('0');
  });

  it('mostra o ícone Archive apenas no chip Arquivadas', () => {
    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={() => {}} />);
    const archiveIcon = screen.getByTestId('status-chip-archived').querySelector('svg');
    expect(archiveIcon).not.toBeNull();
    expect(archiveIcon).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('status-chip-all').querySelector('svg')).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Design do dono (11/10) — chips em pílula grande, badge redondo.
  //
  // O jsdom não aplica o CSS do Tailwind: a geometria NÃO é computável aqui.
  // A prova é sobre as classes que o componente REALMENTE renderiza — o que o
  // Tailwind aplica no navegador é a classe presente (h-11 = 44px,
  // rounded-full = pílula). Se uma classe sumir do componente, o teste cai.
  // ─────────────────────────────────────────────────────────────────────────
  describe('pílula grande e badge redondo (design do dono 11/10)', () => {
    const renderComAtivo = () =>
      render(<StatusChips conversations={conversations} chipTab="attending" onChipTabChange={() => {}} />);

    it('o chip é pílula de 44px com rótulo de 15px', () => {
      renderComAtivo();
      const chip = screen.getByTestId('status-chip-attending');
      for (const classe of ['h-11', 'px-4', 'rounded-full', 'text-[15px]', 'font-medium', 'border']) {
        expect(chip.className, `chip sem "${classe}"`).toContain(classe);
      }
    });

    it('o contador é badge redondo (rounded-full, h-7, min-w-7, text-sm)', () => {
      renderComAtivo();
      const badge = screen.getByTestId('status-chip-attending').querySelector('span');
      expect(badge).not.toBeNull();
      for (const classe of ['rounded-full', 'h-7', 'min-w-7', 'px-2', 'text-sm', 'font-bold']) {
        expect(badge!.className, `badge sem "${classe}"`).toContain(classe);
      }
    });

    it('o container usa gap-2 e pt-3/pb-3', () => {
      renderComAtivo();
      const box = screen.getByTestId('status-chips');
      expect(box.className).toContain('gap-2');
      expect(box.className).toContain('pt-3');
      expect(box.className).toContain('pb-3');
      expect(box.className).toContain('flex-wrap');
    });

    it('a transição é só de cores (transition-colors, sem transition-all)', () => {
      renderComAtivo();
      const chip = screen.getByTestId('status-chip-attending');
      expect(chip.className).toContain('transition-colors');
      expect(chip.className).not.toContain('transition-all');
    });

    it('o chip ativo tem anel e foco visível por token (nada de cor crua)', () => {
      renderComAtivo();
      const chip = screen.getByTestId('status-chip-attending');
      expect(chip.className).toContain('ring-2');
      expect(chip.className).toContain('ring-primary/40');
      expect(chip.className).toContain('focus-visible:ring-2');
      expect(chip.className).toContain('focus-visible:ring-primary/50');
    });

    it('aria-pressed marca só o chip ativo', () => {
      renderComAtivo();
      expect(screen.getByTestId('status-chip-attending')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('status-chip-all')).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByTestId('status-chip-resolved')).toHaveAttribute('aria-pressed', 'false');
    });

    it('o ícone Archive vai em h-4 w-4 antes do texto', () => {
      renderComAtivo();
      const svg = screen.getByTestId('status-chip-archived').querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg!.getAttribute('class')).toContain('h-4');
      expect(svg!.getAttribute('class')).toContain('w-4');
    });
  });
});
