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

/** Texto do contador (o <span> que segue o rótulo, não o rótulo). */
function counter(testId: string): string {
  return screen.getByTestId(`status-chip-${testId}`).querySelector('span')?.textContent ?? '';
}

describe('StatusChips', () => {
  // Cobre os seis chips pelo MESMO critério da lista (contacts.conversation_status):
  // - c1 open + responsável atual + não lidas  -> Todas, Não lidas, Em atendimento
  // - c2 open + outro responsável              -> Todas
  // - c3 waiting sem responsável               -> Todas, Aguardando
  // - c4 open SEM mensagem carregada           -> fora de Todas (guarda de atividade)
  // - c5 resolved sem mensagem                 -> Resolvidas
  // - c6 resolved COM mensagem                 -> Resolvidas (não é "sem mensagem")
  // - c7 archived + responsável + não lidas     -> só Arquivadas
  // - c8 archived sem mensagem                 -> só Arquivadas
  const conversations: ConversationWithMessages[] = [
    makeConversation({ id: 'c1', assigned_to: CURRENT_PROFILE_ID, unreadCount: 2, conversation_status: 'open' }),
    makeConversation({ id: 'c2', assigned_to: OTHER_PROFILE_ID, conversation_status: 'open' }),
    makeConversation({ id: 'c3', assigned_to: null, conversation_status: 'waiting' }),
    makeConversation({ id: 'c4', hasMessages: false, conversation_status: 'open' }),
    makeConversation({ id: 'c5', hasMessages: false, conversation_status: 'resolved' }),
    makeConversation({ id: 'c6', conversation_status: 'resolved' }),
    makeConversation({ id: 'c7', assigned_to: CURRENT_PROFILE_ID, unreadCount: 5, conversation_status: 'archived' }),
    makeConversation({ id: 'c8', hasMessages: false, conversation_status: 'archived' }),
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

  it('conta "Todas" por open|waiting com mensagem carregada', () => {
    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={() => {}} />);
    // c1, c2 e c3; c4 (open sem mensagem) não entra pela guarda de atividade.
    expect(counter('all')).toBe('3');
  });

  it('conta "Não lidas" por conversa aberta com não lidas', () => {
    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={() => {}} />);
    // c1. A não lida de c7 não conta: c7 está arquivada.
    expect(counter('unread')).toBe('1');
  });

  it('conta "Em atendimento" pelo profile.id logado, não pelo auth id (#349)', () => {
    // c1 está atribuída ao profile do usuário logado; c2 está com o perfil de
    // um colega; c3 não tem responsável. Comparando com o auth id — que não é
    // um profile id válido — o contador zeraria mesmo com a conversa atribuída
    // ao próprio usuário.
    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={() => {}} />);
    expect(counter('attending')).toBe('1');
  });

  it('conta "Aguardando" pelo status persistido waiting, não por "sem responsável"', () => {
    // Único waiting é c3. c4 (sem responsável, status open) NÃO conta; a regra
    // antiga ("sem responsável") daria 2.
    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={() => {}} />);
    expect(counter('waiting')).toBe('1');
  });

  it('conta "Resolvidas" pelo status resolved, não por "sem mensagem"', () => {
    // c5 e c6. c4 tem 0 mensagens mas status open: a regra antiga ("sem
    // mensagens") o colocaria aqui e c6 (resolvida com mensagem) ficaria de fora.
    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={() => {}} />);
    expect(counter('resolved')).toBe('2');
  });

  it('conta "Arquivadas" pelo status archived e as exclui dos outros chips', () => {
    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={() => {}} />);
    // c7 (com mensagem e não lida) e c8 (sem mensagem): só em Arquivadas.
    expect(counter('archived')).toBe('2');
    expect(counter('all')).toBe('3');
    expect(counter('unread')).toBe('1');
    expect(counter('attending')).toBe('1');
    expect(counter('waiting')).toBe('1');
  });

  it('mostra 0 em "Arquivadas" quando nenhuma conversa tem conversation_status archived', () => {
    const semArquivadas: ConversationWithMessages[] = [
      makeConversation({ id: 'c1', conversation_status: 'open' }),
      makeConversation({ id: 'c2', conversation_status: 'waiting' }),
    ];
    render(<StatusChips conversations={semArquivadas} chipTab="all" onChipTabChange={() => {}} />);
    expect(screen.getByTestId('status-chip-archived').querySelector('span')?.textContent).toBe('0');
  });

  it('calls onChipTabChange with the clicked chip id', () => {
    const onChipTabChange = vi.fn();
    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={onChipTabChange} />);
    fireEvent.click(screen.getByTestId('status-chip-resolved'));
    expect(onChipTabChange).toHaveBeenCalledWith('resolved');
  });

  it('chama onChipTabChange com archived ao clicar no chip Arquivadas', () => {
    const onChipTabChange = vi.fn();
    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={onChipTabChange} />);
    fireEvent.click(screen.getByTestId('status-chip-archived'));
    expect(onChipTabChange).toHaveBeenCalledWith('archived');
  });

  it('aplica o mesmo estilo ativo dos demais chips em Arquivadas', () => {
    const activeClassTokens = ['status-chip-active', 'bg-accent', 'border-primary/50', 'text-foreground'] as const;
    render(<StatusChips conversations={conversations} chipTab="archived" onChipTabChange={() => {}} />);

    const archivedChip = screen.getByTestId('status-chip-archived');
    for (const classToken of activeClassTokens) {
      expect(archivedChip).toHaveClass(classToken);
    }

    const inactiveChipIds = ['all', 'unread', 'attending', 'waiting', 'resolved'] as const;
    for (const chipId of inactiveChipIds) {
      const inactiveChip = screen.getByTestId(`status-chip-${chipId}`);
      expect(inactiveChip).not.toHaveClass('status-chip-active');
      expect(inactiveChip).not.toHaveClass('bg-accent');
      expect(inactiveChip).toHaveClass('bg-muted/40');
      expect(inactiveChip).toHaveClass('border-border');
      expect(inactiveChip).toHaveClass('text-muted-foreground');
    }
  });

  it('conta "Arquivadas" pelo conversation_status real e as exclui da lista ativa', () => {
    // Arquivada NÃO é "sem mensagens": o status persistido em
    // contacts.conversation_status é a fonte. c2 tem mensagens e não lidas, e
    // ainda assim sai de Todas/Não lidas/Em atendimento; c3 está sem responsável
    // e não entra em Aguardando. Todas são contadas em Arquivadas.
    const withArchived: ConversationWithMessages[] = [
      makeConversation({ id: 'c1', assigned_to: CURRENT_PROFILE_ID, unreadCount: 2, conversation_status: 'open' }),
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

  it('exclui conversas adiadas do contador, como a lista (R2-INB-029)', () => {
    // c1 adiada: sai de Todas/Não lidas/Em atendimento — o mesmo conjunto que
    // useInboxFilters suspende enquanto o prazo vigora.
    render(
      <StatusChips
        conversations={conversations}
        chipTab="all"
        onChipTabChange={() => {}}
        snoozedIds={new Set(['c1'])}
      />
    );
    expect(counter('all')).toBe('2');
    expect(counter('unread')).toBe('0');
    expect(counter('attending')).toBe('0');
  });

  it('com "Mostrar todos" Em atendimento acompanha Todas', () => {
    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={() => {}} showAll />);
    // Sem showAll, Em atendimento = 1 (só c1). Com showAll, todas as ativas: c1, c2, c3.
    expect(counter('attending')).toBe('3');
  });

  it('aplica a fila selecionada aos chips abertos e a Arquivadas', () => {
    const withQueue: ConversationWithMessages[] = [
      makeConversation({ id: 'q1', queue_id: 'fila-a', conversation_status: 'open' }),
      makeConversation({ id: 'q2', queue_id: 'fila-b', conversation_status: 'open' }),
      makeConversation({ id: 'q3', queue_id: 'fila-a', conversation_status: 'archived' }),
    ];
    render(
      <StatusChips
        conversations={withQueue}
        chipTab="all"
        onChipTabChange={() => {}}
        selectedQueueId="fila-a"
      />
    );
    expect(counter('all')).toBe('1');
    expect(counter('archived')).toBe('1');
  });
});
