import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useObjectionDetector } from '../useObjectionDetector';

const invokeMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

vi.mock('sonner', () => ({ toast: toastMock }));

const allMessages = [
  { id: 'm1', content: 'Achei o preço alto', sender: 'contact', timestamp: new Date().toISOString() },
  { id: 'm2', content: 'Posso explicar', sender: 'agent', timestamp: new Date().toISOString() },
];
const lastMessages = ['Achei o preço alto'];

const objectionsPayload = (text: string) => ({
  data: { content: JSON.stringify([{ objection: text, counterArgument: `${text} — resposta`, confidence: 0.9 }]) },
  error: null,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

function renderDetector(contactId: string) {
  return renderHook(
    (props: { contactId: string }) =>
      useObjectionDetector(props.contactId, 'Ana', lastMessages, allMessages),
    { initialProps: { contactId } },
  );
}

describe('useObjectionDetector — descarte de resposta superada (IA-048)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('analyze aplica objeções do próprio contato', async () => {
    invokeMock.mockResolvedValue(objectionsPayload('preço'));
    const { result } = renderDetector('contact-A');

    await act(async () => { await result.current.analyze(); });

    expect(result.current.objections).toHaveLength(1);
    expect(result.current.analyzed).toBe(true);
  });

  it('analyze DESCARTA objeções em voo quando o contato muda', async () => {
    const pending = deferred<{ data: unknown; error: unknown }>();
    invokeMock.mockReturnValue(pending.promise);

    const { result, rerender } = renderDetector('contact-A');
    act(() => { void result.current.analyze(); });

    rerender({ contactId: 'contact-B' });

    await act(async () => {
      pending.resolve(objectionsPayload('preço do contato A'));
    });

    expect(result.current.objections).toHaveLength(0);
    expect(result.current.analyzed).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it('rewriteSingle DESCARTA reescrita em voo quando o contato muda', async () => {
    const first = deferred<{ data: unknown; error: unknown }>();
    const second = deferred<{ data: unknown; error: unknown }>();
    invokeMock
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const { result, rerender } = renderDetector('contact-A');

    await act(async () => {
      first.resolve(objectionsPayload('preço'));
    });
    await act(async () => { await result.current.analyze(); });
    expect(result.current.objections).toHaveLength(1);

    act(() => { void result.current.rewriteSingle(0); });

    rerender({ contactId: 'contact-B' });

    toastMock.success.mockClear();
    await act(async () => {
      second.resolve({ data: { content: 'texto reescrito do contato A' }, error: null });
    });

    // Nem o objeto foi tocado (lista já zerada pela troca) nem houve toast de sucesso.
    expect(result.current.objections).toHaveLength(0);
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(result.current.rewritingIdx).toBeNull();
  });
});
