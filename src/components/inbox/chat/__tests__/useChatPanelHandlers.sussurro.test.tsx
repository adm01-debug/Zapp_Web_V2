/**
 * Sussurro no compositor — lado DADOS e ENVIO.
 *
 * O sussurro é uma NOTA INTERNA: o texto digitado com o modo sussurro ligado tem de
 * ser gravado em `whisper_messages` e NUNCA pode chamar `onSendMessage` (o canal).
 * O caso perigoso é o retry: quando a gravação falha, o texto continua no editor e o
 * Enter seguinte precisa tentar de novo o sussurro — jamais virar mensagem de canal.
 *
 * Aqui `useChatPanelHandlers` é o REAL; só o cliente Supabase é controlado pelo teste,
 * com um destino (`contacts.assigned_to`) configurável.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';


const CONTATO = '11111111-1111-4111-8111-111111111111';
const RESPONSAVEL = '22222222-2222-4222-8222-222222222222';
const PERFIL = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  undoToast: vi.fn(),
  editMessageApi: vi.fn(),
  // Estado do banco local do teste.
  assignedTo: '22222222-2222-4222-8222-222222222222' as string | null,
  whisperError: null as { message: string } | null,
  whisperCount: 0,
  insercoes: [] as Array<Record<string, unknown>>,
  consultas: 0,
}));

vi.mock('@/integrations/supabase/client', () => {
  const builder = (tabela: string) => ({
    eq: () => ({
      maybeSingle: async () => {
        if (tabela === 'profiles') return { data: { id: '33333333-3333-4333-8333-333333333333' }, error: null };
        if (tabela === 'contacts') return { data: { assigned_to: mocks.assignedTo }, error: null };
        return { data: null, error: null };
      },
    }),
    // consulta de contagem (count/head) usada por useWhisperCount
    then: undefined,
  });
  return {
    supabase: {
      auth: { getUser: async () => ({ data: { user: { id: 'agente-1' } }, error: null }) },
      from: (tabela: string) => ({
        select: () => {
          if (tabela === 'whisper_messages') {
            mocks.consultas += 1;
            // O builder do supabase é aguardável; devolvemos direto o resultado do count.
            return { eq: () => ({ count: mocks.whisperCount, error: null }) };
          }
          return builder(tabela);
        },
        insert: (payload: Record<string, unknown>) => {
          mocks.insercoes.push(payload);
          return { error: mocks.whisperError };
        },
        update: () => ({ eq: async () => ({ error: null }) }),
      }),
    },
  };
});
vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/undoToast', () => ({ undoToast: (...args: unknown[]) => mocks.undoToast(...args) }));
vi.mock('@/lib/ai-vocabulary', () => ({ normalizeOperationalPriority: () => ({ value: null }) }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: (...args: unknown[]) => mocks.toast(...args) }));
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
  tomorrowAtNine: () => new Date('2026-10-07T09:00:00.000Z'),
}));
vi.mock('@/hooks/system/useNavigationHistory', () => ({ navigateToView: vi.fn() }));
vi.mock('@/components/inbox/SlashCommands', () => ({ SlashCommands: () => null }));

import { useChatPanelHandlers } from '../useChatPanelHandlers';
import { useWhisperMessagesMutation } from '@/hooks/chat/useWhisperMessagesMutation';
import { useWhisperCount } from '@/hooks/chat/useWhisperCount';

function montarHandlers(opts: {
  onSendMessage: (content: string, replyToId?: string | null) => void | Promise<void>;
  contactId?: string;
  temAnexoPendente?: () => boolean;
}) {
  return renderHook(() =>
    useChatPanelHandlers({
      conversationId: 'conv-1',
      contactId: opts.contactId ?? '11111111-1111-4111-8111-111111111111',
      contactPhone: '5511999999999',
      instanceName: 'instancia-1',
      onSendMessage: opts.onSendMessage,
      editMessageApi: mocks.editMessageApi,
      applySignature: (t: string) => t,
      handleTypingStart: vi.fn(),
      handleTypingStop: vi.fn(),
      openDialog: vi.fn(),
      closeDialog: vi.fn(),
      handleSetActiveTool: vi.fn(),
      temAnexoPendente: opts.temAnexoPendente,
    }),
  );
}

/** Liga o sussurro, digita e aciona o envio — o mesmo caminho de Enter/botão. */
async function sussurrar(
  result: { current: ReturnType<typeof useChatPanelHandlers> },
  texto: string,
) {
  act(() => result.current.setIsWhisper(true));
  act(() => result.current.setInputValue(texto));
  await act(async () => {
    await result.current.handleSend();
  });
}

describe('sussurro do compositor — grava na nota interna e nunca no canal', () => {
  beforeEach(() => {
    mocks.toast.mockReset();
    mocks.undoToast.mockReset();
    mocks.editMessageApi.mockReset();
    mocks.insercoes.length = 0;
    mocks.consultas = 0;
    mocks.assignedTo = RESPONSAVEL;
    mocks.whisperError = null;
    mocks.whisperCount = 0;
    cleanup();
  });

  it('grava em whisper_messages com o responsável da conversa e NÃO chama onSendMessage', async () => {
    const onSendMessage = vi.fn(async (_c: string, _r?: string | null): Promise<void> => {});
    const { result } = montarHandlers({ onSendMessage });

    await sussurrar(result, 'Fica de olho, o cliente costuma pedir desconto.');

    expect(mocks.insercoes).toHaveLength(1);
    expect(mocks.insercoes[0]).toMatchObject({
      contact_id: CONTATO,
      sender_id: PERFIL,
      target_agent_id: RESPONSAVEL,
      content: 'Fica de olho, o cliente costuma pedir desconto.',
    });
    // O ponto central: nada foi para o canal.
    expect(onSendMessage).not.toHaveBeenCalled();
    // Sucesso limpa o compositor e devolve o modo sussurro ao estado neutro.
    expect(result.current.inputValue).toBe('');
    expect(result.current.isWhisper).toBe(false);
    expect(mocks.toast.mock.calls.some(([a]) => String(a?.title ?? '').includes('Sussurro enviado'))).toBe(true);
  });

  it('retry depois da falha continua sussurro — o texto é preservado e nada vaza ao canal', async () => {
    const onSendMessage = vi.fn(async (_c: string, _r?: string | null): Promise<void> => {});
    const { result } = montarHandlers({ onSendMessage });

    // 1ª tentativa: a gravação falha.
    mocks.whisperError = { message: 'boom' };
    await sussurrar(result, 'nota que não pode virar mensagem');

    expect(onSendMessage).not.toHaveBeenCalled();
    // O texto sobrevive à falha para o retry.
    expect(result.current.inputValue).toBe('nota que não pode virar mensagem');
    expect(result.current.isWhisper).toBe(true);
    expect(mocks.toast.mock.calls.some(([a]) => a?.variant === 'destructive')).toBe(true);

    // 2ª tentativa (retry): gravação passa.
    mocks.whisperError = null;
    await act(async () => {
      await result.current.handleSend();
    });

    expect(mocks.insercoes).toHaveLength(2);
    expect(onSendMessage).not.toHaveBeenCalled();
    expect(result.current.inputValue).toBe('');
  });

  it('conversa sem responsável: recusa, mantém o texto, não grava e não envia', async () => {
    mocks.assignedTo = null;
    const onSendMessage = vi.fn(async (_c: string, _r?: string | null): Promise<void> => {});
    const { result } = montarHandlers({ onSendMessage });

    await sussurrar(result, 'nota para ninguém');

    expect(mocks.insercoes).toHaveLength(0);
    expect(onSendMessage).not.toHaveBeenCalled();
    expect(result.current.inputValue).toBe('nota para ninguém');
    expect(mocks.toast.mock.calls.some(([a]) => String(a?.title ?? '').includes('sem responsável'))).toBe(true);
  });

  it('contato sem UUID: recusa antes de tocar no banco e mantém o texto', async () => {
    const onSendMessage = vi.fn(async (_c: string, _r?: string | null): Promise<void> => {});
    const { result } = montarHandlers({ onSendMessage, contactId: 'contato-x' });

    await sussurrar(result, 'nota em conversa sem contato');

    expect(mocks.insercoes).toHaveLength(0);
    expect(onSendMessage).not.toHaveBeenCalled();
    expect(result.current.inputValue).toBe('nota em conversa sem contato');
  });

  it('com anexo pendente o sussurro é recusado sem gravar nem enviar', async () => {
    const onSendMessage = vi.fn(async (_c: string, _r?: string | null): Promise<void> => {});
    const { result } = montarHandlers({ onSendMessage, temAnexoPendente: () => true });

    await sussurrar(result, 'nota com anexo');

    expect(mocks.insercoes).toHaveLength(0);
    expect(onSendMessage).not.toHaveBeenCalled();
    expect(result.current.inputValue).toBe('nota com anexo');
  });

  it('Escape desliga o modo sussurro', () => {
    const onSendMessage = vi.fn(async (_c: string, _r?: string | null): Promise<void> => {});
    const { result } = montarHandlers({ onSendMessage });

    act(() => result.current.setIsWhisper(true));
    expect(result.current.isWhisper).toBe(true);

    act(() => {
      result.current.handleKeyDown({ key: 'Escape' } as React.KeyboardEvent, false);
    });

    expect(result.current.isWhisper).toBe(false);
  });

  it('sem sussurro ligado o envio continua indo pelo canal (sem regressão)', async () => {
    const onSendMessage = vi.fn(async (_c: string, _r?: string | null): Promise<void> => {});
    const { result } = montarHandlers({ onSendMessage });

    act(() => result.current.setInputValue('mensagem normal'));
    await act(async () => {
      await result.current.handleSend();
    });

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(mocks.insercoes).toHaveLength(0);
  });
});

describe('contador de sussurros (selo do cabeçalho)', () => {
  beforeEach(() => {
    mocks.toast.mockReset();
    mocks.insercoes.length = 0;
    mocks.consultas = 0;
    mocks.assignedTo = RESPONSAVEL;
    mocks.whisperError = null;
    mocks.whisperCount = 0;
    cleanup();
  });

  it('lê o count com o RLS existente e reconsulta quando um sussurro novo é gravado', async () => {
    mocks.whisperCount = 2;
    const { result } = renderHook(() => ({
      count: useWhisperCount(CONTATO),
      enviar: useWhisperMessagesMutation().enviarSussurro,
    }));

    await waitFor(() => expect(result.current.count).toBe(2));

    // Um sussurro novo grava e avisa o contador aberto da mesma conversa.
    mocks.whisperCount = 3;
    await act(async () => {
      await result.current.enviar({ contactId: CONTATO, content: 'mais uma nota' });
    });

    await waitFor(() => expect(result.current.count).toBe(3));
    expect(mocks.consultas).toBeGreaterThanOrEqual(2);
  });
});
