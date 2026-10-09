/**
 * R2-INB-018 / item 314 — ações rápidas e seleção da busca embutida fechavam
 * sem executar a intenção.
 *
 * Contrato do achado (evidência estática em `GlobalSearch.tsx:40-46/54-59` e
 * `ChatDialogs.tsx:55`):
 *  - "Nova conversa" e "Respostas rápidas" existiam fixas no seletor e a ação
 *    delas era `onOpenChange(false)`: a busca fechava sem abrir a nova conversa
 *    nem a gestão de respostas. Ação sem operação real não pode entrar no seletor.
 *  - A instância embutida no chat (Ctrl+K, `useChatPanelHandlers`) recebia um
 *    `onSelectResult` que só registrava log e mostrava "Resultado selecionado",
 *    mantendo a conversa corrente. Agora usa o MESMO contrato de navegação da
 *    instância da Inbox.
 *
 * Vermelho antes: não havia operação a executar (nem prop para isso) e a seleção
 * anunciava sucesso sem trocar de conversa. Verde depois: a ação executa a
 * operação do host e a seleção abre a conversa do resultado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GlobalSearch } from '@/components/inbox/GlobalSearch';
import { ChatDialogs } from '@/components/inbox/chat/ChatDialogs';
import type { Conversation } from '@/types/chat';

const { toastMock, supabaseMock } = vi.hoisted(() => {
  /** Linha de mensagem que a busca global devolve para o termo digitado. */
  const messageRow = {
    id: 'msg-1',
    content: 'mensagem da busca',
    message_type: 'text',
    created_at: '2026-10-05T10:00:00.000Z',
    contact_id: 'contact-9',
    contacts: { id: 'contact-9', name: 'Ana', surname: 'Souza' },
  };

  /**
   * Cadeia PostgREST "thenable": qualquer método (select/order/limit/ilike/eq/or/
   * gte/not) devolve a própria cadeia e o `await` resolve `{ data }`. É o mesmo
   * formato que `useGlobalSearchData` consome (nada lança, devolve `{ data }`).
   */
  function chain(result: unknown) {
    const self: { current?: unknown } = {};
    const proxy: unknown = new Proxy({} as Record<string, unknown>, {
      get(_target, prop) {
        if (prop === 'then') return (resolve: (value: unknown) => unknown) => resolve(result);
        return () => self.current;
      },
    });
    self.current = proxy;
    return proxy;
  }

  return {
    toastMock: vi.fn(),
    supabaseMock: {
      from: (table: string) => chain({ data: table === 'messages' ? [messageRow] : [], error: null }),
    },
  };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: supabaseMock }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: toastMock }));
vi.mock('@/lib/logger', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { log: logger, getLogger: () => logger };
});
vi.mock('@/hooks/system/useUserRole', () => ({ useUserRole: () => ({ isSupervisor: false, roles: [] }) }));
vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({ useCRMIntegrationEnabled: () => false }));
/**
 * Isolamento do histórico de buscas (R2-PLAT-006): o hook passou a escopar o
 * histórico por usuário e a ler `useAuth`, que exige `AuthProvider`. Este teste
 * prova as ações rápidas/seleção da busca — nada de histórico —, então isola a
 * dependência alheia (mesmo padrão de `GlobalSearch.navigation.test.tsx` e
 * `GlobalSearch.r2-inb-020.test.tsx`) em vez de montar uma sessão de verdade.
 */
vi.mock('@/hooks/system/useSearchHistory', () => ({
  useSearchHistory: () => ({
    history: [],
    addToHistory: vi.fn(),
    removeFromHistory: vi.fn(),
    clearHistory: vi.fn(),
  }),
}));

const conversation = {
  id: 'conv-1',
  contact: { id: 'contact-1', name: 'Maria Silva', phone: '+5511999999999', avatar: '' },
} as unknown as Conversation;

function dialogsState(over: Partial<Record<string, boolean>> = {}) {
  return {
    quickReplies: false, slashCommands: false, transferDialog: false, scheduleDialog: false,
    callDialog: false, globalSearch: false, chatSearch: false, interactiveBuilder: false,
    forwardDialog: false, locationPicker: false, aiAssistant: false, catalogDirect: false,
    whisper: false, templatesWithVars: false, realtimeTranscription: false, closeDialog: false,
    ...over,
  };
}

function renderChatDialogs(onSelectConversation: (contactId: string) => void, openDialog = vi.fn(), closeDialog = vi.fn()) {
  render(
    <ChatDialogs
      dialogs={dialogsState({ globalSearch: true })}
      openDialog={openDialog}
      closeDialog={closeDialog}
      conversation={conversation}
      forwardMessage={null}
      contactId="contact-1"
      onTransfer={vi.fn()}
      onScheduleMessage={vi.fn().mockResolvedValue(undefined)}
      onSendInteractiveMessage={vi.fn().mockResolvedValue(undefined)}
      onForwardToTargets={vi.fn()}
      onSendLocation={vi.fn()}
      onSetInputValue={vi.fn()}
      onSelectConversation={onSelectConversation}
    />,
  );
  return { openDialog, closeDialog };
}

describe('R2-INB-018 — ações rápidas da busca executam a intenção (ou não são oferecidas)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('não oferece ação rápida sem operação real do host', () => {
    render(<GlobalSearch open onOpenChange={vi.fn()} onSelectResult={vi.fn()} />);

    // O seletor de ações está renderizado (prova válida para a ausência abaixo).
    expect(screen.getByText('Ir para Inbox')).toBeInTheDocument();
    // Sem host capaz de abrir a nova conversa / a gestão de respostas, elas saem
    // do seletor em vez de fechar a busca sem fazer nada.
    expect(screen.queryByText('Nova conversa')).not.toBeInTheDocument();
    expect(screen.queryByText('Respostas rápidas')).not.toBeInTheDocument();
  });

  it('"Nova conversa" executa a operação do host e fecha a busca', () => {
    const onNewConversation = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <GlobalSearch open onOpenChange={onOpenChange} onSelectResult={vi.fn()} onNewConversation={onNewConversation} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Nova conversa/i }));

    expect(onNewConversation).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('"Respostas rápidas" executa a operação do host', () => {
    const onManageQuickReplies = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <GlobalSearch open onOpenChange={onOpenChange} onSelectResult={vi.fn()} onManageQuickReplies={onManageQuickReplies} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Respostas rápidas/i }));

    expect(onManageQuickReplies).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('R2-INB-018 — busca embutida no chat usa o mesmo contrato de seleção da Inbox', () => {
  beforeEach(() => vi.clearAllMocks());

  it('selecionar um resultado abre a conversa dele, sem anunciar sucesso falso', async () => {
    const onSelectConversation = vi.fn();
    const { closeDialog } = renderChatDialogs(onSelectConversation);

    const input = await screen.findByPlaceholderText(/Buscar mensagens/i);
    fireEvent.change(input, { target: { value: 'mensagem' } });

    const resultado = await screen.findByRole('button', { name: /Conversa com Ana Souza/i }, { timeout: 3000 });
    fireEvent.click(resultado);

    expect(onSelectConversation).toHaveBeenCalledWith('contact-9');
    expect(closeDialog).toHaveBeenCalledWith('globalSearch');
    // Antes o consumidor só registrava log e mostrava "Resultado selecionado".
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('"Respostas rápidas" na busca do chat abre a gestão de respostas', async () => {
    const { openDialog } = renderChatDialogs(vi.fn());

    const acao = await screen.findByRole('button', { name: /Respostas rápidas/i });
    fireEvent.click(acao);

    expect(openDialog).toHaveBeenCalledWith('quickReplies');
  });
});
