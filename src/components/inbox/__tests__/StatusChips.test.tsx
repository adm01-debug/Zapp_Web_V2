import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StatusChips } from '../conversation-list/StatusChips';
import type { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';
import { countByChip, type ChipCounts } from '@/hooks/inbox/chipCounts';
import { useInboxFilters } from '@/hooks/inbox/useInboxFilters';

// R2-INB-056 (#349): o usuário logado tem DOIS ids distintos — o do auth
// (auth.users.id) e o do perfil (public.profiles.id, alvo da FK
// contacts.assigned_to). O contador compara com o PROFILE id; aqui ele é
// passado explicitamente (como RealtimeInboxView faz com inbox.profile?.id).
const CURRENT_PROFILE_ID = 'perfil-atual-1';
const OTHER_PROFILE_ID = 'perfil-colega-2';

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

/** Número total de conversas por chip, com a MESMA função que useInboxFilters usa. */
function countsOf(
  conversations: ConversationWithMessages[],
  opts: Parameters<typeof countByChip>[2] = {},
): ChipCounts {
  return countByChip(conversations, CURRENT_PROFILE_ID, opts);
}

/** Todos os zeros, para montar contagens arbitrárias por prop. */
function makeCounts(partial: Partial<ChipCounts> = {}): ChipCounts {
  return { all: 0, unread: 0, attending: 0, waiting: 0, resolved: 0, archived: 0, ...partial };
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
    render(<StatusChips counts={countsOf(conversations)} chipTab="all" onChipTabChange={() => {}} />);
    expect(screen.getByTestId('status-chip-all')).toBeInTheDocument();
    expect(screen.getByTestId('status-chip-unread')).toBeInTheDocument();
    expect(screen.getByTestId('status-chip-attending')).toBeInTheDocument();
    expect(screen.getByTestId('status-chip-waiting')).toBeInTheDocument();
    expect(screen.getByTestId('status-chip-resolved')).toBeInTheDocument();
    expect(screen.getByTestId('status-chip-archived')).toBeInTheDocument();
    expect(screen.queryByTestId('status-chip-spam')).not.toBeInTheDocument();
  });

  it('mostra os seis números recebidos por prop, sem calcular nada por conta própria', () => {
    // Números que NÃO saem das conversas de exemplo: se o componente voltar a
    // contar sozinho, os chips mostram os totais antigos (3/1/1/1/2/2) e o teste fica vermelho.
    const counts = makeCounts({ all: 41, unread: 7, attending: 5, waiting: 3, resolved: 11, archived: 2 });
    render(<StatusChips counts={counts} chipTab="all" onChipTabChange={() => {}} />);
    expect(counter('all')).toBe('41');
    expect(counter('unread')).toBe('7');
    expect(counter('attending')).toBe('5');
    expect(counter('waiting')).toBe('3');
    expect(counter('resolved')).toBe('11');
    expect(counter('archived')).toBe('2');
  });

  it('rotula cada chip com o nome e a contagem filtrada (singular/plural)', () => {
    render(
      <StatusChips
        counts={makeCounts({ all: 1, unread: 2, attending: 0, archived: 1 })}
        chipTab="all"
        onChipTabChange={() => {}}
      />
    );
    expect(screen.getByTestId('status-chip-all')).toHaveAccessibleName('Todas, 1 conversa');
    expect(screen.getByTestId('status-chip-unread')).toHaveAccessibleName('Não lidas, 2 conversas');
    expect(screen.getByTestId('status-chip-attending')).toHaveAccessibleName('Em atendimento, 0 conversas');
    expect(screen.getByTestId('status-chip-archived')).toHaveAccessibleName('Arquivadas, 1 conversa');
  });

  it('conta "Todas" por open|waiting com mensagem carregada', () => {
    render(<StatusChips counts={countsOf(conversations)} chipTab="all" onChipTabChange={() => {}} />);
    // c1, c2 e c3; c4 (open sem mensagem) não entra pela guarda de atividade.
    expect(counter('all')).toBe('3');
  });

  it('conta "Não lidas" por conversa aberta com não lidas', () => {
    render(<StatusChips counts={countsOf(conversations)} chipTab="all" onChipTabChange={() => {}} />);
    // c1. A não lida de c7 não conta: c7 está arquivada.
    expect(counter('unread')).toBe('1');
  });

  it('conta "Em atendimento" pelo profile.id logado, não pelo auth id (#349)', () => {
    // c1 está atribuída ao profile do usuário logado; c2 está com o perfil de
    // um colega; c3 não tem responsável. Comparando com o auth id — que não é
    // um profile id válido — o contador zeraria mesmo com a conversa atribuída
    // ao próprio usuário.
    render(<StatusChips counts={countsOf(conversations)} chipTab="all" onChipTabChange={() => {}} />);
    expect(counter('attending')).toBe('1');
  });

  it('conta "Aguardando" pelo status persistido waiting, não por "sem responsável"', () => {
    // Único waiting é c3. c4 (sem responsável, status open) NÃO conta; a regra
    // antiga ("sem responsável") daria 2.
    render(<StatusChips counts={countsOf(conversations)} chipTab="all" onChipTabChange={() => {}} />);
    expect(counter('waiting')).toBe('1');
  });

  it('conta "Resolvidas" pelo status resolved, não por "sem mensagem"', () => {
    // c5 e c6. c4 tem 0 mensagens mas status open: a regra antiga ("sem
    // mensagens") o colocaria aqui e c6 (resolvida com mensagem) ficaria de fora.
    render(<StatusChips counts={countsOf(conversations)} chipTab="all" onChipTabChange={() => {}} />);
    expect(counter('resolved')).toBe('2');
  });

  it('conta "Arquivadas" pelo status archived e as exclui dos outros chips', () => {
    render(<StatusChips counts={countsOf(conversations)} chipTab="all" onChipTabChange={() => {}} />);
    // c7 (com mensagem e não lida) e c8 (sem mensagem): só em Arquivadas.
    expect(counter('archived')).toBe('2');
    expect(counter('all')).toBe('3');
    expect(counter('unread')).toBe('1');
    expect(counter('attending')).toBe('1');
    expect(counter('waiting')).toBe('1');
  });

  it('calls onChipTabChange with the clicked chip id', () => {
    const onChipTabChange = vi.fn();
    render(<StatusChips counts={countsOf(conversations)} chipTab="all" onChipTabChange={onChipTabChange} />);
    fireEvent.click(screen.getByTestId('status-chip-resolved'));
    expect(onChipTabChange).toHaveBeenCalledWith('resolved');
  });

  it('chama onChipTabChange com archived ao clicar no chip Arquivadas', () => {
    const onChipTabChange = vi.fn();
    render(<StatusChips counts={countsOf(conversations)} chipTab="all" onChipTabChange={onChipTabChange} />);
    fireEvent.click(screen.getByTestId('status-chip-archived'));
    expect(onChipTabChange).toHaveBeenCalledWith('archived');
  });

  it('mostra o ícone Archive apenas no chip Arquivadas', () => {
    render(<StatusChips counts={countsOf(conversations)} chipTab="all" onChipTabChange={() => {}} />);
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
        counts={countsOf(conversations, { snoozedIds: new Set(['c1']) })}
        chipTab="all"
        onChipTabChange={() => {}}
      />
    );
    expect(counter('all')).toBe('2');
    expect(counter('unread')).toBe('0');
    expect(counter('attending')).toBe('0');
  });

  it('com "Mostrar todos" Em atendimento acompanha Todas', () => {
    render(<StatusChips counts={countsOf(conversations, { showAll: true })} chipTab="all" onChipTabChange={() => {}} />);
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
        counts={countsOf(withQueue, { selectedQueueId: 'fila-a' })}
        chipTab="all"
        onChipTabChange={() => {}}
      />
    );
    expect(counter('all')).toBe('1');
    expect(counter('archived')).toBe('1');
  });

  it('mostra 0 em "Arquivadas" quando as conversas carregadas são todas ativas', () => {
    const somenteAtivas: ConversationWithMessages[] = [
      makeConversation({ id: 'a1', assigned_to: CURRENT_PROFILE_ID, unreadCount: 1, conversation_status: 'open' }),
      makeConversation({ id: 'a2', assigned_to: null, conversation_status: 'open' }),
    ];
    render(<StatusChips counts={countsOf(somenteAtivas)} chipTab="all" onChipTabChange={() => {}} />);
    expect(screen.getByTestId('status-chip-archived').querySelector('span')?.textContent).toBe('0');
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
    render(<StatusChips counts={countsOf(withArchived)} chipTab="all" onChipTabChange={() => {}} />);

    expect(screen.getByTestId('status-chip-archived')).toHaveTextContent('3');
    expect(screen.getByTestId('status-chip-all')).toHaveTextContent('1');
    expect(screen.getByTestId('status-chip-unread')).toHaveTextContent('1');
    expect(screen.getByTestId('status-chip-attending')).toHaveTextContent('1');
    expect(screen.getByTestId('status-chip-waiting')).toHaveTextContent('0');
  });

  it('aplica o mesmo estilo ativo dos demais chips em Arquivadas', () => {
    // O design do dono (11/10) trocou o ativo para `border-primary` + anel
    // (`ring-2 ring-primary/40`) e o texto inativo para `text-foreground`.
    // A prova mede as classes REAIS do componente; além dos tokens, compara
    // Arquivadas ativa com outro chip ativo para travar a PARIDADE (não um
    // valor fixo de token que envelhece).
    const activeClassTokens = ['status-chip-active', 'bg-accent', 'border-primary', 'ring-2', 'ring-primary/40', 'text-foreground'] as const;
    const { unmount } = render(<StatusChips counts={countsOf(conversations)} chipTab="archived" onChipTabChange={() => {}} />);

    const archivedChip = screen.getByTestId('status-chip-archived');
    for (const classToken of activeClassTokens) {
      expect(archivedChip).toHaveClass(classToken);
    }
    const archivedActiveClasses = [...archivedChip.classList].sort().join(' ');
    unmount();

    render(<StatusChips counts={countsOf(conversations)} chipTab="attending" onChipTabChange={() => {}} />);
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
      render(<StatusChips counts={countsOf(conversations)} chipTab="attending" onChipTabChange={() => {}} />);

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
 * Menor contêiner que reproduz o encanamento de produção: a busca da lista chama
 * `useInboxFilters.setSearch` e os chips leem `useInboxFilters.chipCounts`
 * (exatamente o que ConversationListSidebar faz com `inboxFilters.chipCounts`).
 */
function BuscaHarness({ conversations }: { conversations: ConversationWithMessages[] }) {
  const inboxFilters = useInboxFilters({ conversations, profileId: CURRENT_PROFILE_ID });
  return (
    <div>
      <input
        aria-label="Buscar contato pelo nome"
        value={inboxFilters.search}
        onChange={(e) => inboxFilters.setSearch(e.target.value)}
      />
      <StatusChips
        counts={inboxFilters.chipCounts}
        chipTab={inboxFilters.chipTab}
        onChipTabChange={inboxFilters.setChipTab}
      />
    </div>
  );
}

describe('StatusChips — números acompanham a busca', () => {
  const atendidas = (nome: string, id: string) =>
    makeConversation({ id, name: nome, phone: `+5511${id}`, assigned_to: CURRENT_PROFILE_ID, conversation_status: 'open' });

  it('digitar na busca atualiza o número do chip ativo, sem recarregar', () => {
    const conversas = [
      atendidas('Ana Souza', '900000001'),
      atendidas('Bruno Lima', '900000002'),
      atendidas('Carla Dias', '900000003'),
    ];
    render(<BuscaHarness conversations={conversas} />, { wrapper: MemoryRouter });

    // Chip ativo (attending, o padrão do hook) e "Todas" mostram as 3 conversas.
    expect(counter('attending')).toBe('3');
    expect(counter('all')).toBe('3');

    fireEvent.change(screen.getByLabelText('Buscar contato pelo nome'), { target: { value: 'Bruno' } });

    // O mesmo render, sem remontar: o número do chip ativo passa a refletir a busca.
    expect(counter('attending')).toBe('1');
    expect(counter('all')).toBe('1');
    expect(screen.getByTestId('status-chip-attending')).toHaveAccessibleName('Em atendimento, 1 conversa');
  });
});
