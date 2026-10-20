/**
 * R2-INB-014 (item 91) — nenhum caminho do `useChatPanelHandlers` pode anunciar sucesso
 * sem ter feito a ação. Prova (vermelho antes, verde depois) de cinco furos:
 *
 *  1. EDIÇÃO sem `external_id`/JID: o HEAD pulava a Evolution e ainda gravava local e dizia
 *     "Mensagem editada" — o cliente continuava com o texto antigo. Agora não grava nada e
 *     avisa "Edição indisponível" (o editor permanece aberto).
 *  2. EDIÇÃO fora da janela revalidada NO ENVIO: com o editor aberto o prazo pode vencer; o
 *     HEAD só checava na abertura.
 *  3. UPDATE local que afeta 0 linhas: o builder resolve em `{ error: null, data: [] }`;
 *     o HEAD só olhava `error` e anunciava êxito.
 *  4. CÓPIA: `writeText` rejeitado (permissão/contexto) mas o HEAD dizia "Copiado!".
 *  5. Comandos de barra sem argumento (`/snooze`, `/priority`) terminavam em silêncio.
 *  6. `/archive` gravava `assigned_to = null` (devolvia à fila) e dizia "Conversa Arquivada".
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '@/types/chat';

const db = vi.hoisted(() => ({
  toast: vi.fn(),
  snoozeConversation: vi.fn(),
  favoriteContact: vi.fn(),
  unfavoriteContact: vi.fn(),
  updates: [] as {
    table: string;
    payload: Record<string, unknown>;
    filter: { column: string; value: unknown };
  }[],
  messagesResult: { error: null as unknown, data: [{ id: 'msg-1' }] as unknown[] | null },
  contactsResult: { error: null as unknown },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => ({
      update: (payload: Record<string, unknown>) => ({
        eq: (column: string, value: unknown) => {
          db.updates.push({ table, payload, filter: { column, value } });
          const result = table === 'contacts' ? db.contactsResult : db.messagesResult;
          return {
            // `.select('id')` devolve as linhas afetadas; o objeto também é "awaitável"
            // porque o ramo /archive aguarda o retorno de `.eq(...)` direto.
            select: () => Promise.resolve(result),
            then: (res: (v: unknown) => unknown) => Promise.resolve(result).then(res),
          };
        },
      }),
    }),
  },
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: db.toast }));
vi.mock('@/lib/logger', () => ({ log: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/undoToast', () => ({ undoToast: vi.fn() }));
vi.mock('@/lib/ai-vocabulary', () => ({ normalizeOperationalPriority: () => ({ value: null }) }));
vi.mock('@/services/outbound-message.service', () => ({ sendOutboundMessage: vi.fn() }));
vi.mock('@/hooks/chat/useConversationActions', () => ({
  useConversationActions: () => ({
    isFavorite: () => false,
    favoriteContact: db.favoriteContact,
    unfavoriteContact: db.unfavoriteContact,
    snoozeConversation: db.snoozeConversation,
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

const comoEditMessageApi = (fn: ReturnType<typeof vi.fn>) => fn as unknown as EditMessageApi;

function montar(editMessageMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({})) {
  const utils = renderHook(() =>
    useChatPanelHandlers({
      conversationId: 'conv-1',
      contactId: 'contact-1',
      contactPhone: CONTACT_PHONE,
      instanceName: 'instancia-1',
      onSendMessage: vi.fn().mockResolvedValue(undefined),
      editMessageApi: comoEditMessageApi(editMessageMock),
      applySignature: (text: string) => text,
      handleTypingStart: vi.fn(),
      handleTypingStop: vi.fn(),
      openDialog: vi.fn(),
      closeDialog: vi.fn(),
      handleSetActiveTool: vi.fn(),
    }),
  );
  return { ...utils, editMessageApi: editMessageMock };
}

function mensagemEmEdicao(overrides: Partial<Message> = {}): Message {
  return {
    id: MESSAGE_ID,
    content: 'texto original',
    sender: 'agent',
    type: 'text',
    timestamp: new Date(),
    external_id: EXTERNAL_ID,
    ...overrides,
  } as unknown as Message;
}

function toasts() {
  return db.toast.mock.calls.map(([arg]) => arg as { title?: string; variant?: string });
}

function toastsDeSucesso() {
  return toasts().filter((t) => (t.title ?? '').includes('Mensagem editada'));
}

function toastsDestrutivos() {
  return toasts().filter((t) => t.variant === 'destructive');
}

/** Abre a edição e dispara o envio, aguardando todo o fluxo assíncrono. */
async function abrirEEnviar(utils: ReturnType<typeof montar>, mensagem: Message = mensagemEmEdicao()) {
  act(() => {
    utils.result.current.handleEditStart(mensagem);
  });
  act(() => {
    utils.result.current.setInputValue(TEXTO);
  });
  await act(async () => {
    await utils.result.current.handleSend();
  });
}

function definirClipboard(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.updates = [];
  db.messagesResult = { error: null, data: [{ id: MESSAGE_ID }] };
  db.contactsResult = { error: null };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('edição — só anuncia êxito quando a edição realmente aconteceu', () => {
  it('sem external_id não grava nada e avisa "Edição indisponível" (editor permanece)', async () => {
    const editMessageApi = vi.fn().mockResolvedValue({});
    const utils = montar(editMessageApi);

    await abrirEEnviar(utils, mensagemEmEdicao({ external_id: undefined }));

    expect(editMessageApi).not.toHaveBeenCalled();
    expect(db.updates).toHaveLength(0);
    expect(toastsDeSucesso()).toHaveLength(0);
    expect(toastsDestrutivos().some((t) => (t.title ?? '').includes('indisponível'))).toBe(true);
    // O fluxo NÃO é encerrado como êxito: o texto e o modo de edição continuam.
    expect(utils.result.current.editingMessage?.id).toBe(MESSAGE_ID);
    expect(utils.result.current.inputValue).toBe(TEXTO);
  });

  it('revalida a janela de edição no envio (prazo venceu com o editor aberto)', async () => {
    vi.useFakeTimers();
    const t0 = new Date('2026-10-11T12:00:00Z').getTime();
    vi.setSystemTime(t0);

    const editMessageApi = vi.fn().mockResolvedValue({});
    const utils = montar(editMessageApi);

    act(() => {
      utils.result.current.handleEditStart(mensagemEmEdicao({ timestamp: new Date(t0) }));
    });
    act(() => {
      utils.result.current.setInputValue(TEXTO);
    });
    expect(utils.result.current.editingMessage?.id).toBe(MESSAGE_ID);

    // 16 minutos depois: o WhatsApp já recusaria a edição.
    vi.setSystemTime(t0 + 16 * 60_000);
    await act(async () => {
      await utils.result.current.handleSend();
    });

    expect(editMessageApi).not.toHaveBeenCalled();
    expect(db.updates).toHaveLength(0);
    expect(toastsDeSucesso()).toHaveLength(0);
    expect(toastsDestrutivos().some((t) => (t.title ?? '').includes('expirado'))).toBe(true);
    expect(utils.result.current.editingMessage?.id).toBe(MESSAGE_ID);
  });

  it('UPDATE local com 0 linhas avisa e não anuncia edição', async () => {
    db.messagesResult = { error: null, data: [] };
    const editMessageApi = vi.fn().mockResolvedValue({});
    const utils = montar(editMessageApi);

    await abrirEEnviar(utils);

    // O transporte do WhatsApp foi acionado, mas o espelho local não registrou nada.
    expect(editMessageApi).toHaveBeenCalledTimes(1);
    expect(toastsDeSucesso()).toHaveLength(0);
    expect(toastsDestrutivos().some((t) => (t.title ?? '').includes('não registrada'))).toBe(true);
    expect(utils.result.current.editingMessage?.id).toBe(MESSAGE_ID);
  });

  it('caminho feliz continua funcionando (≥1 linha afetada)', async () => {
    const editMessageApi = vi.fn().mockResolvedValue({});
    const utils = montar(editMessageApi);

    await abrirEEnviar(utils);

    expect(toastsDeSucesso()).toHaveLength(1);
    expect(toastsDestrutivos()).toHaveLength(0);
    expect(utils.result.current.editingMessage).toBeNull();
    expect(utils.result.current.inputValue).toBe('');
  });
});

describe('cópia — o aviso segue o resultado real do clipboard', () => {
  it('não anuncia "Copiado!" quando o clipboard rejeita', async () => {
    definirClipboard(vi.fn().mockRejectedValue(new Error('NotAllowedError')));
    const utils = montar();

    await act(async () => {
      await utils.result.current.handleCopyMessage('texto');
    });

    expect(toasts().some((t) => (t.title ?? '').includes('Copiado!'))).toBe(false);
    expect(toastsDestrutivos().some((t) => (t.title ?? '').includes('copiar'))).toBe(true);
  });

  it('anuncia "Copiado!" quando o clipboard resolve', async () => {
    definirClipboard(vi.fn().mockResolvedValue(undefined));
    const utils = montar();

    await act(async () => {
      await utils.result.current.handleCopyMessage('texto');
    });

    expect(toasts().some((t) => (t.title ?? '').includes('Copiado!'))).toBe(true);
    expect(toastsDestrutivos()).toHaveLength(0);
  });
});

describe('comandos de barra — nunca terminam em silêncio', () => {
  it('/snooze sem argumento avisa o formato e não adia', () => {
    const utils = montar();

    act(() => {
      utils.result.current.handleSlashCommand({ id: 'snooze', label: 'Adiar', description: '' } as never);
    });

    expect(db.snoozeConversation).not.toHaveBeenCalled();
    expect(db.updates).toHaveLength(0);
    const informativos = toasts().filter((t) => (t.title ?? '').includes('Adiar'));
    expect(informativos).toHaveLength(1);
    expect(informativos[0].variant).toBeUndefined();
  });

  it('/priority sem argumento avisa o formato e não grava prioridade', () => {
    const utils = montar();

    act(() => {
      utils.result.current.handleSlashCommand({ id: 'priority', label: 'Prioridade', description: '' } as never);
    });

    expect(db.updates).toHaveLength(0);
    const informativos = toasts().filter((t) => (t.title ?? '').includes('prioridade'));
    expect(informativos).toHaveLength(1);
    expect(informativos[0].variant).toBeUndefined();
  });

  it('/archive grava o estado de FSM (conversation_status), não assigned_to', async () => {
    const utils = montar();

    await act(async () => {
      utils.result.current.handleSlashCommand({ id: 'archive', label: 'Arquivar', description: '' } as never);
      await Promise.resolve();
    });

    const archive = db.updates.find((u) => u.table === 'contacts');
    expect(archive?.payload).toMatchObject({ conversation_status: 'archived' });
    expect(archive?.payload.assigned_to).toBeUndefined();
    expect(toasts().some((t) => (t.title ?? '').includes('Arquivada'))).toBe(true);
  });
});
