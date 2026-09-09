import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatPanelHandlers } from '../useChatPanelHandlers';

const { toastMock, undoToastMock } = vi.hoisted(() => ({
  toastMock: vi.fn(),
  undoToastMock: vi.fn(),
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: toastMock }));
vi.mock('@/lib/undoToast', () => ({ undoToast: undoToastMock }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(onSendMessage: (content: string) => void | Promise<void>) {
  const handleTypingStop = vi.fn();
  const handleSetActiveTool = vi.fn();
  const hook = renderHook(() => useChatPanelHandlers({
    conversationId: 'conversation-1',
    contactId: 'contact-1',
    contactPhone: '5511999999999',
    instanceName: 'instance-1',
    onSendMessage,
    editMessageApi: vi.fn(),
    applySignature: (text) => text,
    handleTypingStart: vi.fn(),
    handleTypingStop,
    openDialog: vi.fn(),
    closeDialog: vi.fn(),
    handleSetActiveTool,
  }));

  act(() => hook.result.current.setInputValue('Mensagem de teste'));
  return { ...hook, handleTypingStop, handleSetActiveTool };
}

describe('useChatPanelHandlers — contrato assíncrono de envio', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mantém editor e isSending até o transporte confirmar, limpando após sucesso', async () => {
    const operation = deferred();
    const onSendMessage = vi.fn(() => operation.promise);
    const { result, handleTypingStop } = setup(onSendMessage);

    let pending!: Promise<void>;
    act(() => { pending = result.current.handleSend(); });

    expect(onSendMessage).toHaveBeenCalledWith('Mensagem de teste');
    expect(result.current.inputValue).toBe('Mensagem de teste');
    expect(result.current.isSending).toBe(true);
    expect(undoToastMock).not.toHaveBeenCalled();

    await act(async () => {
      operation.resolve();
      await pending;
    });

    expect(result.current.inputValue).toBe('');
    expect(result.current.isSending).toBe(false);
    expect(handleTypingStop).toHaveBeenCalledTimes(1);
    expect(undoToastMock).toHaveBeenCalledTimes(1);
  });

  it('preserva o editor e não anuncia sucesso quando o transporte rejeita', async () => {
    const operation = deferred();
    const onSendMessage = vi.fn(() => operation.promise);
    const { result, handleTypingStop } = setup(onSendMessage);

    let pending!: Promise<void>;
    act(() => { pending = result.current.handleSend(); });

    await act(async () => {
      operation.reject(new Error('transport unavailable'));
      await pending;
    });

    expect(result.current.inputValue).toBe('Mensagem de teste');
    expect(result.current.isSending).toBe(false);
    expect(handleTypingStop).not.toHaveBeenCalled();
    expect(undoToastMock).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Erro ao enviar',
      variant: 'destructive',
    }));
  });

  it('bloqueia um segundo envio antes do primeiro render assíncrono concluir', async () => {
    const operation = deferred();
    const onSendMessage = vi.fn(() => operation.promise);
    const { result } = setup(onSendMessage);

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.handleSend();
      second = result.current.handleSend();
    });

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    await expect(second).resolves.toBeUndefined();

    await act(async () => {
      operation.resolve();
      await first;
    });
  });

  it('delega Ctrl/Cmd+F exclusivamente ao listener do ChatPanel', () => {
    const { result, handleSetActiveTool } = setup(vi.fn());
    const preventDefault = vi.fn();

    act(() => {
      result.current.handleKeyDown({
        key: 'f',
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
        preventDefault,
      } as unknown as React.KeyboardEvent, false);
    });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(handleSetActiveTool).not.toHaveBeenCalled();
  });
});
