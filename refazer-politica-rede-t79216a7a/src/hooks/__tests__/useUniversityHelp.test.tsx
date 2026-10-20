import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mockFunctionsInvoke = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockFunctionsInvoke(...args) },
  },
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastWarning = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
    warning: (...args: unknown[]) => toastWarning(...args),
  },
}));

import { useUniversityHelp } from '@/hooks/ui/useUniversityHelp';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Datas relativas a agora: o período "today"/"7d" do seletor é recalculado a
// cada render e mensagens fixas de outra data ficariam fora do recorte.
const agora = Date.now();
const messages = [
  { id: 'm1', content: 'Bom dia, preciso de ajuda com o pedido', sender: 'client', timestamp: new Date(agora - 60_000).toISOString() },
  { id: 'm2', content: 'Claro, como posso ajudar?', sender: 'agent', timestamp: new Date(agora - 30_000).toISOString() },
  { id: 'm3', content: 'Qual o prazo de entrega?', sender: 'client', timestamp: new Date(agora - 10_000).toISOString() },
];

function setup() {
  return renderHook(() => useUniversityHelp('contact-1', 'Maria', messages));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useUniversityHelp — R2-MOD-012: resposta de análise após a troca do período', () => {
  it('descarta a resposta em voo e não emite toast de sucesso quando o período muda', async () => {
    const request = deferred<{ data: unknown; error: unknown }>();
    mockFunctionsInvoke.mockReturnValue(request.promise);

    const { result } = setup();

    act(() => {
      result.current.toggleMessage('m1');
    });
    expect(result.current.selectedIds.size).toBe(1);

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.generateResponse();
    });
    await waitFor(() => expect(mockFunctionsInvoke).toHaveBeenCalledTimes(1));
    expect(result.current.loading).toBe(true);

    // Troca do período ENQUANTO a requisição está pendente.
    act(() => {
      result.current.periodFilter.setAnalysisPeriod('today');
    });
    expect(result.current.selectedIds.size).toBe(0);

    // A resposta do período anterior chega DEPOIS da troca.
    await act(async () => {
      request.resolve({ data: { content: 'Resposta do período anterior' }, error: null });
      await pending;
    });

    expect(result.current.response).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('aplica a resposta quando o período não mudou (não descarta requisição legítima)', async () => {
    mockFunctionsInvoke.mockResolvedValue({ data: { content: 'Resposta válida' }, error: null });

    const { result } = setup();
    act(() => {
      result.current.toggleMessage('m1');
    });

    await act(async () => {
      await result.current.generateResponse();
    });

    expect(result.current.response).toBe('Resposta válida');
    expect(result.current.loading).toBe(false);
    expect(toastSuccess).toHaveBeenCalledTimes(1);
  });

  it('não sobrescreve a resposta nova quando a resposta antiga chega depois', async () => {
    const antiga = deferred<{ data: unknown; error: unknown }>();
    const nova = deferred<{ data: unknown; error: unknown }>();
    mockFunctionsInvoke.mockReturnValueOnce(antiga.promise).mockReturnValueOnce(nova.promise);

    const { result } = setup();
    act(() => {
      result.current.toggleMessage('m1');
    });

    let pAntiga!: Promise<void>;
    act(() => {
      pAntiga = result.current.generateResponse();
    });
    await waitFor(() => expect(mockFunctionsInvoke).toHaveBeenCalledTimes(1));

    // Troca de período invalida a requisição em voo e limpa a seleção.
    act(() => {
      result.current.periodFilter.setAnalysisPeriod('today');
    });
    act(() => {
      result.current.toggleMessage('m1');
    });
    act(() => {
      // Fura o throttle de 3s: os dois cliques são do mesmo teste, não do usuário.
      result.current.lastCallRef.current = 0;
    });

    let pNova!: Promise<void>;
    act(() => {
      pNova = result.current.generateResponse();
    });
    await waitFor(() => expect(mockFunctionsInvoke).toHaveBeenCalledTimes(2));

    // A resposta NOVA chega primeiro…
    await act(async () => {
      nova.resolve({ data: { content: 'Resposta nova' }, error: null });
      await pNova;
    });
    expect(result.current.response).toBe('Resposta nova');

    // …e a ANTIGA (período anterior) chega depois: tem de ser descartada.
    await act(async () => {
      antiga.resolve({ data: { content: 'Resposta antiga' }, error: null });
      await pAntiga;
    });

    expect(result.current.response).toBe('Resposta nova');
    expect(toastSuccess).toHaveBeenCalledTimes(1);
  });

  it('descarta falha de rede de requisição obsoleta: sem toast de erro após a troca do período', async () => {
    const request = deferred<{ data: unknown; error: unknown }>();
    mockFunctionsInvoke.mockReturnValue(request.promise);

    const { result } = setup();
    act(() => {
      result.current.toggleMessage('m1');
    });

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.generateResponse();
    });
    await waitFor(() => expect(mockFunctionsInvoke).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.periodFilter.setAnalysisPeriod('today');
    });

    await act(async () => {
      request.reject(new Error('falha de rede'));
      await pending;
    });

    expect(result.current.error).toBeNull();
    expect(result.current.response).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(toastError).not.toHaveBeenCalled();
  });
});
