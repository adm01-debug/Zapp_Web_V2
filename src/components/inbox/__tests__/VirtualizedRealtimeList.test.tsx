/**
 * Cobre exatamente os achados centrais das auditorias desta sessão:
 * 1) o badge de canal (Instagram/Facebook/...) some para WhatsApp (bug
 *    original corrigido na PR #616 — logo invertida mostrava o logo do
 *    WhatsApp em todo contato).
 * 2) o mini-avatar do atendente só aparece quando a conversa está com
 *    OUTRA pessoa, não quando é o próprio usuário logado vendo suas
 *    próprias conversas (feature da PR #620).
 * 3) R2-SLA-003: a linha com SLA aberto precisa resolver o prazo por
 *    useApplicableSLA (atributos do contato/conversa) e repassar o valor
 *    resolvido ao SLAIndicator compacto — antes o componente mandava 5
 *    fixo e ignorava a regra granular.
 *
 * O virtualizer real do @tanstack/react-virtual depende de medições de
 * layout que o jsdom não fornece de forma confiável (clientHeight fica 0
 * sem um ResizeObserver real) — mockado para retornar todas as linhas,
 * já que o alvo do teste é o conteúdo de cada linha, não a virtualização.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode, ComponentProps } from 'react';
import type { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';
import type { AgentLite } from '@/hooks/crm/useAgentsLite';

const CURRENT_USER_ID = 'me-profile-id';
const OTHER_AGENT_ID = 'colleague-profile-id';

let agentsMapMock: Map<string, AgentLite> = new Map();

// Espiões hoisted: os factories de vi.mock são içados acima dos imports, então
// as referências precisam existir nesse momento.
const mocks = vi.hoisted(() => ({
  useApplicableSLA: vi.fn(),
  slaIndicator: vi.fn(),
}));

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

// O hook de resolução de SLA é mockado: o alvo é o contrato da linha (com que
// parâmetros ela consulta e qual valor resolvedor ela repassa), não a
// hierarquia do resolver — que tem testes próprios e não deve ser duplicada.
vi.mock('@/hooks/sla/useApplicableSLA', () => ({
  useApplicableSLA: mocks.useApplicableSLA,
}));

// SLAIndicator mockado para capturar os props recebidos e provar de forma
// direta o firstResponseMinutes resolvido. O marcador mantém role="status"
// com "SLA" no nome acessível para os testes que só checam presença/ausência.
vi.mock('@/components/inbox/SLAIndicator', () => ({
  SLAIndicator: (props: { firstMessageAt: Date; firstResponseMinutes: number }) => {
    mocks.slaIndicator(props);
    return <div role="status" aria-label={`SLA compacto ${props.firstResponseMinutes}min`} />;
  },
}));

// Radix Popover não abre de forma confiável sob jsdom+fireEvent (padrão já
// usado em ChatPanelHeader.test.tsx) — mockado como pass-through pra poder
// clicar direto nas opções de snooze sem depender do estado real de open.
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

function withConversationSla(
  conversation: ConversationWithMessages,
  rows: Array<{ first_message_at: string; first_response_at: string | null }>
): ConversationWithMessages {
  (conversation.contact as unknown as { conversation_sla: typeof rows }).conversation_sla = rows;
  return conversation;
}

function renderList(
  conversations: ConversationWithMessages[],
  extraProps: Partial<ComponentProps<typeof VirtualizedRealtimeList>> = {}
) {
  // Cliente novo por render: sem cache compartilhado entre testes e sem
  // retry para não mascarar falha de query no jsdom.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <VirtualizedRealtimeList
        conversations={conversations}
        selectedContactId={null}
        onSelectConversation={vi.fn()}
        {...extraProps}
      />
    </QueryClientProvider>
  );
}

// Algumas árvores de teste montam a lista direto, sem provider de
// react-query — o componente precisa tolerar a ausência do cliente.
function renderListWithoutProvider(conversations: ConversationWithMessages[]) {
  return render(
    <VirtualizedRealtimeList
      conversations={conversations}
      selectedContactId={null}
      onSelectConversation={vi.fn()}
    />
  );
}

beforeEach(() => {
  agentsMapMock = new Map();
  mocks.useApplicableSLA.mockReset();
  mocks.slaIndicator.mockReset();
  // Padrão do sistema: mantém os testes legados com o comportamento de 5 min.
  mocks.useApplicableSLA.mockReturnValue({
    data: { firstResponseMinutes: 5, resolutionMinutes: 60, ruleName: 'Padrão do Sistema', ruleId: null },
  });
});

describe('VirtualizedRealtimeList — badge de canal e mini-avatar do atendente', () => {
  it('mostra o badge do canal para Instagram, mas não para WhatsApp', () => {
    const conversations = [
      makeConversation({ id: 'insta-1', channel_type: 'instagram' }),
      makeConversation({ id: 'wpp-1', channel_type: 'whatsapp' }),
      makeConversation({ id: 'wpp-2', channel_type: null }),
    ];
    const { container } = renderList(conversations);

    // channelBadge é decorativo (aria-hidden) — não dá pra usar getByRole.
    // Seletor casa exatamente as classes do span do badge (VirtualizedRealtimeList.tsx),
    // não os ícones lucide (que não têm rounded-full nem w-5/h-5 no wrapper).
    const badges = container.querySelectorAll('span.w-5.h-5.rounded-full[aria-hidden="true"]');
    expect(badges.length).toBe(1);
  });

  it('esconde o mini-avatar quando a conversa é do próprio usuário logado', () => {
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

  it('sem entrada no agentsMap para o assigned_to, não quebra e não mostra mini-avatar', () => {
    agentsMapMock = new Map(); // colega existe mas perfil não veio na query (RLS)
    const conversations = [makeConversation({ id: 'orphan-assignment', assigned_to: OTHER_AGENT_ID })];
    renderList(conversations);

    expect(screen.queryAllByRole('img', { name: /Atendido por/i })).toHaveLength(0);
  });
});

describe('VirtualizedRealtimeList — popover de snooze', () => {
  it('clicar numa opção chama onSnooze com a duração e fecha o popover', () => {
    const onSnooze = vi.fn();
    renderList([makeConversation({ id: 'c1' })], { onSnooze });

    fireEvent.click(screen.getByRole('button', { name: 'Amanhã às 9h' }));

    expect(onSnooze).toHaveBeenCalledWith('c1', 'tomorrow');
    // Popover mockado como pass-through: fechar (setSnoozeOpen(false)) não
    // desmonta o conteúdo, mas confirma que o handler não quebrou o restante
    // da linha — outra opção continua clicável e chama de novo.
    fireEvent.click(screen.getByRole('button', { name: 'Em 1 hora' }));
    expect(onSnooze).toHaveBeenCalledWith('c1', '1h');
    expect(onSnooze).toHaveBeenCalledTimes(2);
  });

  it('sem onSnooze, o conteúdo do popover não é renderizado', () => {
    renderList([makeConversation({ id: 'c1' })]);

    expect(screen.queryByRole('button', { name: 'Amanhã às 9h' })).not.toBeInTheDocument();
  });
});

describe('VirtualizedRealtimeList — SLA não é 1:1 com o contato', () => {
  it('usa a linha de conversation_sla aberta (first_response_at null), não a primeira do array', () => {
    // Simula o histórico real: 1 linha antiga já respondida (poderia mostrar
    // "violado" de um atendimento encerrado) + 1 linha aberta do atendimento atual.
    const conversation = withConversationSla(makeConversation({ id: 'c1' }), [
      { first_message_at: '2026-01-01T00:00:00Z', first_response_at: '2026-01-01T00:10:00Z' },
      { first_message_at: '2026-09-24T11:00:00Z', first_response_at: null },
    ]);

    renderList([conversation]);

    // SLAIndicator só é renderizado quando firstMessageAt vem definido — confirma
    // que achou a linha aberta (2ª do array), não a 1ª (que já tem first_response_at).
    expect(screen.getByRole('status', { name: /SLA/i })).toBeInTheDocument();
  });

  it('sem nenhuma linha aberta em conversation_sla, não mostra SLA (não cai pra uma linha fechada)', () => {
    const conversation = withConversationSla(makeConversation({ id: 'c1' }), [
      { first_message_at: '2026-01-01T00:00:00Z', first_response_at: '2026-01-01T00:10:00Z' },
    ]);

    renderList([conversation]);

    expect(screen.queryByRole('status', { name: /SLA/i })).not.toBeInTheDocument();
  });
});

describe('VirtualizedRealtimeList — prazo granular de SLA por conversa (R2-SLA-003)', () => {
  // Contato com histórico (1 linha fechada + 1 aberta) e todos os atributos que
  // alimentam o resolver de SLA.
  function conversationWithOpenSla(): ConversationWithMessages {
    return withConversationSla(
      makeConversation({
        id: 'c1',
        company: 'Acme',
        job_title: 'Gerente',
        contact_type: 'lead',
        queue_id: 'queue-1',
        assigned_to: 'agent-1',
      }),
      [
        { first_message_at: '2026-01-01T00:00:00Z', first_response_at: '2026-01-01T00:10:00Z' },
        { first_message_at: '2026-09-24T11:00:00Z', first_response_at: null },
      ]
    );
  }

  it('repassa ao SLAIndicator compacto o prazo resolvido (2 min), não o 5 fixo', () => {
    mocks.useApplicableSLA.mockReturnValue({
      data: { firstResponseMinutes: 2, resolutionMinutes: 30, ruleName: 'Regra Granular', ruleId: 'rule-2' },
    });

    renderList([conversationWithOpenSla()]);

    expect(mocks.slaIndicator).toHaveBeenCalledTimes(1);
    const props = mocks.slaIndicator.mock.calls[0][0];
    expect(props.firstResponseMinutes).toBe(2);
    expect(props.firstResponseMinutes).not.toBe(5);
    expect(props.compact).toBe(true);
  });

  it('consulta useApplicableSLA com os atributos do contato e usa a linha aberta', () => {
    renderList([conversationWithOpenSla()]);

    expect(mocks.useApplicableSLA).toHaveBeenCalledWith({
      contactId: 'c1',
      company: 'Acme',
      jobTitle: 'Gerente',
      contactType: 'lead',
      queueId: 'queue-1',
      agentId: 'agent-1',
    });
    // firstMessageAt vem da linha ABERTA (2ª), não da fechada (1ª): prova que a
    // seleção do registro aberto continua correta junto com a resolução do prazo.
    expect(mocks.slaIndicator).toHaveBeenCalledWith(
      expect.objectContaining({ firstMessageAt: new Date('2026-09-24T11:00:00Z') })
    );
  });

  it('sem QueryClientProvider não lança e mantém o indicador com o prazo fixo de 5 min (regressão da recusa)', () => {
    // Prova direta da falha "No QueryClient set" que derrubou a entrega
    // anterior: a linha com SLA aberto renderiza mesmo sem provider,
    // caindo no comportamento anterior (5 fixo) sem chamar o hook.
    renderListWithoutProvider([conversationWithOpenSla()]);

    expect(screen.getByTestId('conversation-item')).toBeInTheDocument();
    expect(mocks.slaIndicator).toHaveBeenCalledTimes(1);
    const props = mocks.slaIndicator.mock.calls[0][0];
    expect(props.firstResponseMinutes).toBe(5);
    expect(props.firstResponseAt).toBeNull();
    expect(props.compact).toBe(true);
    expect(mocks.useApplicableSLA).not.toHaveBeenCalled();
  });

  it('sem SLA aberto, não consulta o resolver nem renderiza o indicador', () => {
    const conversation = withConversationSla(makeConversation({ id: 'c1' }), [
      { first_message_at: '2026-01-01T00:00:00Z', first_response_at: '2026-01-01T00:10:00Z' },
    ]);

    renderList([conversation]);

    expect(mocks.useApplicableSLA).not.toHaveBeenCalled();
    expect(mocks.slaIndicator).not.toHaveBeenCalled();
  });
});
