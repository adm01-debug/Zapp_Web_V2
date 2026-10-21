/**
 * PK-21 — envio de texto em FILA SERIAL por conversa.
 *
 * Defeito de origem (doc 06, 2ª passada): o compositor ficava travado até o
 * enqueue + o despacho no Edge + dois refetches; um Enter durante um envio em
 * andamento era descartado (mensagem perdida) e a ordem de duas mensagens
 * seguidas não era garantida. Estas provas fixam o comportamento novo, e as
 * duas primeiras também fixam o contrato anterior que precisa continuar:
 * sucesso limpa o editor e anuncia; falha devolve o rascunho sem anunciar.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  undoToast: vi.fn(),
  toast: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: mocks.logError, debug: vi.fn(), warn: vi.fn(), info: vi.fn() },
  createLogger: () => ({ error: mocks.logError, debug: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

vi.mock('@/lib/undoToast', () => ({
  undoToast: (...args: unknown[]) => mocks.undoToast(...args),
}));

vi.mock('@/lib/ai-vocabulary', () => ({
  normalizeOperationalPriority: () => ({ value: null }),
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  toast: (...args: unknown[]) => mocks.toast(...args),
}));

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
  tomorrowAtNine: () => new Date('2026-10-06T09:00:00.000Z'),
}));

vi.mock('@/hooks/system/useNavigationHistory', () => ({ navigateToView: vi.fn() }));

vi.mock('@/components/inbox/SlashCommands', () => ({}));

import { useChatPanelHandlers } from '../useChatPanelHandlers';

type OnSend = (content: string, replyToId?: string | null) => Promise<void> | void;

function montarHook(onSendMessage: OnSend, conversationIdInicial = 'conv-1') {
  return renderHook(
    (props: { conversationId: string }) =>
      useChatPanelHandlers({
        conversationId: props.conversationId,
        contactId: 'contato-1',
        contactPhone: '5511999999999',
        instanceName: 'instancia-1',
        onSendMessage,
        editMessageApi: vi.fn(),
        applySignature: (texto: string) => texto,
        handleTypingStart: vi.fn(),
        handleTypingStop: vi.fn(),
        openDialog: vi.fn(),
        closeDialog: vi.fn(),
        handleSetActiveTool: vi.fn(),
      }),
    { initialProps: { conversationId: conversationIdInicial } },
  );
}

describe('useChatPanelHandlers — envio em fila serial por conversa (PK-21)', () => {
  beforeEach(() => {
    mocks.undoToast.mockReset();
    mocks.toast.mockReset();
    mocks.logError.mockReset();
  });

  it('Enter repetido enfileira em série por conversa, preserva a ordem e libera o compositor logo após o enqueue', async () => {
    const chamadas: string[] = [];
    let liberarPrimeira!: () => void;
    const onSendMessage = vi.fn((content: string) => {
      chamadas.push(`inicio:${content}`);
      if (content === 'primeira') {
        return new Promise<void>((resolve) => {
          liberarPrimeira = () => { chamadas.push('fim:primeira'); resolve(); };
        });
      }
      chamadas.push(`fim:${content}`);
      return Promise.resolve();
    });
    const { result } = montarHook(onSendMessage);

    act(() => { result.current.setInputValue('primeira'); });
    let primeiraEntrega!: Promise<void>;
    await act(async () => { primeiraEntrega = result.current.handleSend(); });

    // O compositor NÃO espera o despacho: o editor já está limpo e a 1ª saiu.
    expect(result.current.inputValue).toBe('');
    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(chamadas).toEqual(['inicio:primeira']);

    // Segundo Enter com a 1ª ainda em voo: entra na fila em vez de ser descartado.
    act(() => { result.current.setInputValue('segunda'); });
    await act(async () => { void result.current.handleSend(); });

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(result.current.inputValue).toBe('');
    expect(chamadas).toEqual(['inicio:primeira']);

    await act(async () => { liberarPrimeira(); await primeiraEntrega; });

    // Ordem preservada: a segunda só começou depois que a primeira terminou.
    expect(chamadas).toEqual(['inicio:primeira', 'fim:primeira', 'inicio:segunda', 'fim:segunda']);
    expect(mocks.undoToast).toHaveBeenCalledTimes(2);
  });

  it('falha de enqueue preserva o rascunho e não toca a animação/som de enviado', async () => {
    const onSendMessage = vi.fn().mockRejectedValueOnce(new Error('sem conexão'));
    const { result } = montarHook(onSendMessage);

    act(() => { result.current.setInputValue('texto que falhou'); });
    await act(async () => { await result.current.handleSend(); });

    expect(result.current.inputValue).toBe('texto que falhou');
    expect(mocks.undoToast).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledTimes(1);
  });

  it('transporte que lança de forma SÍNCRONA preserva o rascunho, avisa e não anuncia enviado', async () => {
    const onSendMessage = vi.fn((): void => { throw new Error('transporte síncrono'); });
    const { result } = montarHook(onSendMessage);

    act(() => { result.current.setInputValue('texto síncrono'); });
    await act(async () => { await result.current.handleSend(); });

    expect(result.current.inputValue).toBe('texto síncrono');
    expect(mocks.undoToast).not.toHaveBeenCalled();
    expect(mocks.logError).toHaveBeenCalledTimes(1);
    expect(mocks.toast).toHaveBeenCalledTimes(1);
  });

  it('a falha preserva os DOIS textos: o que falhou e o rascunho novo digitado durante o voo', async () => {
    let rejeitar!: (erro: Error) => void;
    const onSendMessage = vi.fn(() => new Promise<void>((_resolve, reject) => { rejeitar = reject; }));
    const { result } = montarHook(onSendMessage);

    act(() => { result.current.setInputValue('antiga'); });
    await act(async () => { void result.current.handleSend(); });
    expect(result.current.inputValue).toBe('');

    act(() => { result.current.setInputValue('nova'); });
    await act(async () => { rejeitar(new Error('sem rede')); await Promise.resolve(); });

    // Nenhum dos dois some: o que falhou volta acima do texto novo.
    expect(result.current.inputValue).toBe('antiga\nnova');
    expect(mocks.undoToast).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledTimes(1);
  });

  it('a fila é por conversa: outro contato não espera a mensagem em voo do primeiro', async () => {
    const ordem: string[] = [];
    let liberarLenta!: () => void;
    const onSendMessage = vi.fn((content: string) => {
      ordem.push(content);
      if (content === 'lenta') return new Promise<void>((resolve) => { liberarLenta = resolve; });
      return Promise.resolve();
    });
    const { result, rerender } = montarHook(onSendMessage);

    act(() => { result.current.setInputValue('lenta'); });
    await act(async () => { void result.current.handleSend(); });
    expect(ordem).toEqual(['lenta']);

    rerender({ conversationId: 'conv-2' });
    act(() => { result.current.setInputValue('outro-contato'); });
    await act(async () => { await result.current.handleSend(); });

    expect(ordem).toEqual(['lenta', 'outro-contato']);
    liberarLenta();
    await act(async () => { await Promise.resolve(); });
  });
});
