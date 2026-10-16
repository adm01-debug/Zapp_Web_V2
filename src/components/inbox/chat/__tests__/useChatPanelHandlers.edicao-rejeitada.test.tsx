/**
 * R2-INB-014 (item 90) — o ramo de EDIÇÃO do `useChatPanelHandlers.handleSend` não pode
 * anunciar sucesso quando o banco rejeita a atualização.
 *
 * O PostgREST não lança exceção: o builder resolve em `{ error }`. No HEAD o resultado era
 * ignorado, então a UI mostrava "✏️ Mensagem editada", limpava o editor e encerrava o fluxo
 * como êxito mesmo com a gravação recusada (ex.: RLS/permission denied).
 *
 * Prova (vermelho antes, verde depois):
 *  - banco devolve `{ error }`  → nenhum toast de sucesso, toast destrutivo presente e o texto
 *    permanece no editor (o fluxo não é encerrado como êxito);
 *  - banco devolve `{ error: null }` → sucesso normal (toast de êxito, editor limpo);
 *  - falha da Evolution API mantém o tratamento já existente (toast destrutivo, sem êxito).
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '@/types/chat';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  updateArgs: null as null | Record<string, unknown>,
  updateFilter: null as null | { column: string; value: unknown },
  // Resposta do builder aguardado: devolvida sem lançar exceção, como o PostgREST faz.
  editResult: { error: null } as { error: unknown },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      update: (payload: Record<string, unknown>) => {
        mocks.updateArgs = payload;
        return {
          eq: (column: string, value: unknown) => {
            mocks.updateFilter = { column, value };
            return mocks.editResult;
          },
        };
      },
    }),
  },
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: mocks.toast }));
vi.mock('@/lib/logger', () => ({ log: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/undoToast', () => ({ undoToast: vi.fn() }));
vi.mock('@/lib/ai-vocabulary', () => ({ normalizeOperationalPriority: () => ({ value: null }) }));
vi.mock('@/services/outbound-message.service', () => ({ sendOutboundMessage: vi.fn() }));
vi.mock('@/hooks/chat/useConversationActions', () => ({
  useConversationActions: () => ({
    isFavorite: () => false,
    favoriteContact: vi.fn(),
    unfavoriteContact: vi.fn(),
    snoozeConversation: vi.fn(),
  }),
}));
vi.mock('@/hooks/tasks/useMyWorkItems', () => ({
  useMyWorkItems: () => ({ createAndGetId: vi.fn() }),
  tomorrowAtNine: () => new Date(),
}));
vi.mock('@/hooks/system/useNavigationHistory', () => ({ navigateToView: vi.fn() }));

import { useChatPanelHandlers } from '../useChatPanelHandlers';

const TEXTO = 'resposta corrigida';
const MESSAGE_ID = 'msg-1';
const EXTERNAL_ID = 'wamid.EXTERNO';
const CONTACT_PHONE = '5511999999999';

type EditMessageApi = (
  instance: string,
  params: { number: string; messageId: string; text: string },
) => Promise<unknown>;

/** vi.fn() não é atribuível à assinatura exata da prop; a ponte é explícita. */
const comoEditMessageApi = (fn: ReturnType<typeof vi.fn>) => fn as unknown as EditMessageApi;

function montar(editMessageMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({})) {
  const editMessageApi = editMessageMock;
  const utils = renderHook(() =>
    useChatPanelHandlers({
      conversationId: 'conv-1',
      contactId: 'contact-1',
      contactPhone: CONTACT_PHONE,
      instanceName: 'instancia-1',
      onSendMessage: vi.fn().mockResolvedValue(undefined),
      editMessageApi: comoEditMessageApi(editMessageApi),
      applySignature: (text: string) => text,
      handleTypingStart: vi.fn(),
      handleTypingStop: vi.fn(),
      openDialog: vi.fn(),
      closeDialog: vi.fn(),
      handleSetActiveTool: vi.fn(),
    }),
  );
  return { ...utils, editMessageApi };
}

function mensagemEmEdicao(): Message {
  return {
    id: MESSAGE_ID,
    content: 'texto original',
    sender: 'agent',
    type: 'text',
    timestamp: new Date(),
    external_id: EXTERNAL_ID,
  } as unknown as Message;
}

/** Títulos dos toasts disparados, com a variante — a chamada real é toast({ title, variant }). */
function toasts() {
  return mocks.toast.mock.calls.map(([arg]) => arg as { title?: string; variant?: string });
}

function toastsDeSucesso() {
  return toasts().filter((t) => (t.title ?? '').includes('Mensagem editada'));
}

function toastsDestrutivos() {
  return toasts().filter((t) => t.variant === 'destructive');
}

/** Começa a edição e dispara o envio, aguardando todo o fluxo assíncrono. */
async function editarEEnviar(utils: ReturnType<typeof montar>) {
  act(() => {
    utils.result.current.handleEditStart(mensagemEmEdicao());
  });
  act(() => {
    utils.result.current.setInputValue(TEXTO);
  });
  expect(utils.result.current.editingMessage?.id).toBe(MESSAGE_ID);

  await act(async () => {
    await utils.result.current.handleSend();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateArgs = null;
  mocks.updateFilter = null;
  mocks.editResult = { error: null };
});

describe('useChatPanelHandlers — edição rejeitada pelo banco', () => {
  beforeEach(() => {
    mocks.editResult = { error: { message: 'permission denied for table messages' } };
  });

  it('não anuncia sucesso quando o banco rejeita a edição', async () => {
    const utils = montar();
    await editarEEnviar(utils);

    // A atualização local foi tentada (id certo), mas o `{ error }` não pode ser lido como êxito.
    expect(mocks.updateFilter).toEqual({ column: 'id', value: MESSAGE_ID });
    expect(toastsDeSucesso()).toHaveLength(0);
  });

  it('mostra apenas feedback destrutivo na rejeição', async () => {
    const utils = montar();
    await editarEEnviar(utils);

    expect(toastsDestrutivos()).toHaveLength(1);
    expect(toastsDeSucesso()).toHaveLength(0);
  });

  it('não encerra o fluxo como êxito: texto e modo de edição permanecem', async () => {
    const utils = montar();
    await editarEEnviar(utils);

    expect(utils.result.current.inputValue).toBe(TEXTO);
    expect(utils.result.current.editingMessage?.id).toBe(MESSAGE_ID);
  });

  it('persiste conteúdo novo e updated_at junto do id da mensagem editada', async () => {
    const utils = montar();
    await editarEEnviar(utils);

    expect(mocks.updateArgs).toMatchObject({ content: TEXTO });
    expect(typeof mocks.updateArgs?.updated_at).toBe('string');
    expect(Number.isNaN(Date.parse(String(mocks.updateArgs?.updated_at)))).toBe(false);
  });
});

describe('useChatPanelHandlers — edição aceita e contrato preservado', () => {
  it('com { error: null } mantém o sucesso normal (toast de êxito e editor limpo)', async () => {
    mocks.editResult = { error: null };

    const utils = montar();
    await editarEEnviar(utils);

    expect(toastsDeSucesso()).toHaveLength(1);
    expect(toastsDestrutivos()).toHaveLength(0);
    expect(utils.result.current.inputValue).toBe('');
    expect(utils.result.current.editingMessage).toBeNull();
  });

  it('chama a Evolution API com o alvo canônico antes de gravar localmente', async () => {
    mocks.editResult = { error: null };

    const utils = montar();
    await editarEEnviar(utils);

    expect(utils.editMessageApi).toHaveBeenCalledWith('instancia-1', {
      number: `${CONTACT_PHONE}@s.whatsapp.net`,
      messageId: EXTERNAL_ID,
      text: TEXTO,
    });
  });

  it('falha da Evolution API preserva o tratamento destrutivo já existente (sem êxito)', async () => {
    const editMessageApi = vi.fn().mockRejectedValue(new Error('evolution fora do ar'));

    const utils = montar(editMessageApi);
    await editarEEnviar(utils);

    expect(editMessageApi).toHaveBeenCalledTimes(1);
    expect(toastsDeSucesso()).toHaveLength(0);
    expect(toastsDestrutivos()).toHaveLength(1);
  });
});
