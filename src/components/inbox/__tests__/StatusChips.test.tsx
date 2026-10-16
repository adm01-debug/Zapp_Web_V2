import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { StatusChips, type ChipTab } from '../conversation-list/StatusChips';
import { useInboxFilters } from '@/hooks/inbox/useInboxFilters';
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
  // Cobre os seis chips pelo MESMO critério da lista
  // (contacts.conversation_status):
  // - c1 open + responsável atual + não lidas   -> Todas, Não lidas, Em atendimento
  // - c2 open + outro responsável               -> Todas
  // - c3 waiting sem responsável                -> Todas, Aguardando
  // - c4 open SEM mensagem carregada            -> fora de Todas (guarda de atividade)
  // - c5 resolved sem mensagem                  -> Resolvidas
  // - c6 resolved COM mensagem                  -> Resolvidas (não é "sem mensagem")
  // - c7 archived + responsável + não lidas     -> só Arquivadas
  // - c8 archived sem mensagem                  -> só Arquivadas
  const conversations: ConversationWithMessages[] = [
    makeConversation({ id: 'c1', assigned_to: CURRENT_PROFILE_ID, unreadCount: 2, conversation_status: 'open' }),
    makeConversation({ id: 'c2', assigned_to: OTHER_PROFILE_ID, conversation_status: 'open' }),
    makeConversation({ id: 'c3', assigned_to: null, conversation_status: 'waiting' }),
    makeConversation({ id: 'c4', hasMessages: false, conversation_status: 'open' }),
    makeConversation({ id: 'c5', hasMessages: false, conversation_status: 'resolved' }),
    makeConversation({ id: 'c6', conversation_status: 'resolved' }),
    makeConversation({ id: 'c7', assigned_to: CURRENT_PROFILE_ID, unreadCount: 3, conversation_status: 'archived' }),
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

  it('conta "Aguardando" pelo status persistido waiting, não por "sem responsável"', () => {
    // Único waiting é c3. c4 (sem responsável, status open) NÃO conta; a regra
    // antiga ("sem responsável") daria 2.
    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={() => {}} />);
    expect(screen.getByTestId('status-chip-waiting')).toHaveTextContent('1');
  });

  it('conta "Resolvidas" pelo status resolved, não por "sem mensagem"', () => {
    // c5 e c6. c4 tem 0 mensagens mas status open: a regra antiga ("sem
    // mensagens") o colocaria aqui e c6 (resolvida com mensagem) ficaria de fora.
    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={() => {}} />);
    expect(screen.getByTestId('status-chip-resolved')).toHaveTextContent('2');
  });

  it('conta "Arquivadas" pelo status archived e as exclui dos outros chips', () => {
    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={() => {}} />);
    // c7 (com mensagem e não lida) e c8 (sem mensagem): só em Arquivadas.
    expect(screen.getByTestId('status-chip-archived')).toHaveTextContent('2');
    expect(screen.getByTestId('status-chip-all')).toHaveTextContent('3');
    expect(screen.getByTestId('status-chip-unread')).toHaveTextContent('1');
    expect(screen.getByTestId('status-chip-attending')).toHaveTextContent('1');
    expect(screen.getByTestId('status-chip-waiting')).toHaveTextContent('1');
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
    // O design do dono (11/10) trocou o ativo para `border-primary` + anel
    // (`ring-2 ring-primary/40`) e o texto inativo para `text-foreground`.
    // A prova mede as classes REAIS do componente; além dos tokens, compara
    // Arquivadas ativa com outro chip ativo para travar a PARIDADE (não um
    // valor fixo de token que envelhece).
    const activeClassTokens = ['status-chip-active', 'bg-accent', 'border-primary', 'ring-2', 'ring-primary/40', 'text-foreground'] as const;
    const { unmount } = render(<StatusChips conversations={conversations} chipTab="archived" onChipTabChange={() => {}} />);

    const archivedChip = screen.getByTestId('status-chip-archived');
    for (const classToken of activeClassTokens) {
      expect(archivedChip).toHaveClass(classToken);
    }
    const archivedActiveClasses = [...archivedChip.classList].sort().join(' ');
    unmount();

    render(<StatusChips conversations={conversations} chipTab="attending" onChipTabChange={() => {}} />);
    // Paridade: um chip ativo em outra aba sai com exatamente as mesmas classes.
    expect([...screen.getByTestId('status-chip-attending').classList].sort().join(' ')).toBe(archivedActiveClasses);

    const inactiveChipIds = ['all', 'unread', 'waiting', 'resolved'] as const;
    for (const chipId of inactiveChipIds) {
      const inactiveChip = screen.getByTestId(`status-chip-${chipId}`);
      expect(inactiveChip).not.toHaveClass('status-chip-active');
      expect(inactiveChip).not.toHaveClass('bg-accent');
      expect(inactiveChip).toHaveClass('bg-muted/40');
      expect(inactiveChip).toHaveClass('border-border');
      expect(inactiveChip).toHaveClass('text-foreground');
    }
  });

  it('mostra 0 em "Arquivadas" quando a fixture padrao nao tem conversation_status archived', () => {
    const semArquivadas: ConversationWithMessages[] = [
      makeConversation({ id: 'c1', assigned_to: CURRENT_PROFILE_ID, unreadCount: 2, conversation_status: 'open' }),
      makeConversation({ id: 'c2', assigned_to: null, conversation_status: 'waiting' }),
    ];
    render(<StatusChips conversations={semArquivadas} chipTab="all" onChipTabChange={() => {}} />);
    expect(screen.getByTestId('status-chip-archived')).toHaveTextContent('0');
    expect(screen.getByTestId('status-chip-all')).toHaveTextContent('2');
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

/**
 * As opções com que a LISTA conta chegam ao contador do chip.
 *
 * O componente deixou de ter contagem própria: usa `countByChip`
 * (src/hooks/inbox/chipCounts.ts) com as mesmas opções de useInboxFilters.
 * Estes testes fixam os insumos que faziam o número do chip divergir da lista
 * quando faltavam — adiamento, "Mostrar todos", fila, busca, tipo de contato e
 * painel Filtros — e fecham a conta contra o `length` da lista real.
 */
describe('contadores dos chips com as mesmas opções da lista', () => {
  const counter = (chip: ChipTab): string =>
    screen.getByTestId(`status-chip-${chip}`).querySelector('span')?.textContent ?? '';

  // Mesma base da fixture principal do arquivo (o bloco de cima é um describe à
  // parte), com os seis chips representados pelo estado persistido.
  const CONVERSAS: ConversationWithMessages[] = [
    makeConversation({ id: 'c1', assigned_to: CURRENT_PROFILE_ID, unreadCount: 2, conversation_status: 'open' }),
    makeConversation({ id: 'c2', assigned_to: OTHER_PROFILE_ID, conversation_status: 'open' }),
    makeConversation({ id: 'c3', assigned_to: null, conversation_status: 'waiting' }),
    makeConversation({ id: 'c4', hasMessages: false, conversation_status: 'open' }),
    makeConversation({ id: 'c5', hasMessages: false, conversation_status: 'resolved' }),
    makeConversation({ id: 'c6', conversation_status: 'resolved' }),
    makeConversation({ id: 'c7', assigned_to: CURRENT_PROFILE_ID, unreadCount: 3, conversation_status: 'archived' }),
    makeConversation({ id: 'c8', hasMessages: false, conversation_status: 'archived' }),
  ];

  it('exclui a conversa adiada, como a lista (R2-INB-029)', () => {
    render(
      <StatusChips
        conversations={CONVERSAS}
        chipTab="all"
        onChipTabChange={() => {}}
        countOpts={{ snoozedIds: new Set(['c1']) }}
      />
    );
    expect(counter('all')).toBe('2');
    expect(counter('unread')).toBe('0');
    expect(counter('attending')).toBe('0');
  });

  it('com "Mostrar todos" Em atendimento acompanha Todas', () => {
    render(
      <StatusChips
        conversations={CONVERSAS}
        chipTab="all"
        onChipTabChange={() => {}}
        countOpts={{ showAll: true }}
      />
    );
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
        countOpts={{ selectedQueueId: 'fila-a' }}
      />
    );
    expect(counter('all')).toBe('1');
    expect(counter('archived')).toBe('1');
  });

  it('a busca recorta os contadores, como recorta a lista', () => {
    const comBusca: ConversationWithMessages[] = [
      makeConversation({ id: 'b1', name: 'Ana Souza', conversation_status: 'open', unreadCount: 2 }),
      makeConversation({ id: 'b2', name: 'Ana Paula', conversation_status: 'open' }),
      makeConversation({ id: 'b3', name: 'Joao Lima', conversation_status: 'waiting' }),
      makeConversation({ id: 'b4', name: 'Ana Clara', conversation_status: 'archived' }),
    ];
    render(
      <StatusChips
        conversations={comBusca}
        chipTab="all"
        onChipTabChange={() => {}}
        countOpts={{ search: 'ana' }}
      />
    );
    // Só as "Ana" abertas (b1 e b2): b3 é outro nome e b4 é arquivada.
    expect(counter('all')).toBe('2');
    expect(counter('unread')).toBe('1');
    expect(counter('waiting')).toBe('0');
    expect(counter('archived')).toBe('1');
  });

  it('o painel Filtros (status) e o tipo de contato entram nos contadores', () => {
    const matriz: ConversationWithMessages[] = [
      makeConversation({ id: 'f1', phone: '5511999990001', conversation_status: 'open', unreadCount: 1 }),
      makeConversation({ id: 'f2', phone: '5511999990002', conversation_status: 'open' }),
      // Telefone em formato de JID de grupo: casa o tipo "grupo" do ContactTypeFilter.
      makeConversation({ id: 'f3', phone: '120363111111-556699999999', conversation_status: 'open' }),
    ];
    const { unmount } = render(
      <StatusChips
        conversations={matriz}
        chipTab="all"
        onChipTabChange={() => {}}
        countOpts={{ filters: { status: ['unread'], agentId: null, dateRange: { from: null, to: null } } }}
      />
    );
    expect(counter('all')).toBe('1');
    unmount();

    render(
      <StatusChips
        conversations={matriz}
        chipTab="all"
        onChipTabChange={() => {}}
        countOpts={{ selectedContactType: 'grupo' }}
      />
    );
    expect(counter('all')).toBe('1');
  });
});

describe('contador do chip é o length da lista real (useInboxFilters)', () => {
  const PARIDADE: ConversationWithMessages[] = [
    makeConversation({ id: 'p1', name: 'Ana Souza', assigned_to: CURRENT_PROFILE_ID, unreadCount: 2, conversation_status: 'open' }),
    makeConversation({ id: 'p2', name: 'Ana Paula', assigned_to: OTHER_PROFILE_ID, conversation_status: 'open' }),
    makeConversation({ id: 'p3', name: 'Ana Clara', conversation_status: 'waiting' }),
    makeConversation({ id: 'p4', name: 'Ana Melo', conversation_status: 'resolved' }),
    makeConversation({ id: 'p5', name: 'Ana Bento', assigned_to: CURRENT_PROFILE_ID, conversation_status: 'archived' }),
    makeConversation({ id: 'p6', name: 'Joao Lima', conversation_status: 'open' }),
    makeConversation({ id: 'p7', name: 'Ana Nunes', conversation_status: 'open' }),
  ];
  const ADIADAS = new Set(['p7']);
  const CHIPS_INBOX: ChipTab[] = ['all', 'unread', 'attending', 'waiting', 'resolved', 'archived'];
  const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

  // Espelha o que ConversationListSidebar entrega ao componente: as opções saem
  // do próprio useInboxFilters — o mesmo hook que monta a lista —, então o
  // contador não tem de onde divergir do que a lista mostra.
  const montar = () =>
    renderHook(
      () => useInboxFilters({ conversations: PARIDADE, profileId: CURRENT_PROFILE_ID, snoozedIds: ADIADAS }),
      { wrapper }
    );

  it.each(CHIPS_INBOX)('chip %s: contador == length da lista (com busca e adiada)', (chip) => {
    const { result } = montar();
    act(() => result.current.setChipTab(chip));
    act(() => result.current.setSearch('ana'));

    const { unmount } = render(
      <StatusChips
        conversations={PARIDADE}
        chipTab={chip}
        onChipTabChange={() => {}}
        countOpts={{
          snoozedIds: ADIADAS,
          showAll: result.current.showAll,
          selectedQueueId: result.current.selectedQueueId,
          search: result.current.search,
          selectedContactType: result.current.selectedContactType,
          filters: result.current.filters,
        }}
      />
    );

    const doChip = screen.getByTestId(`status-chip-${chip}`).querySelector('span')?.textContent ?? '';
    expect(doChip).toBe(String(result.current.filteredConversations.length));
    unmount();
  });
});
