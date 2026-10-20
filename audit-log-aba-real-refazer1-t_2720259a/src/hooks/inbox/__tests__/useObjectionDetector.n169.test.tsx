import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useObjectionDetector } from '../useObjectionDetector';

/**
 * N-169 — o detector de objeções não pode confundir FALHA da IA com
 * "nenhuma objeção". A tela (`ObjectionDetector.tsx`) só mostra
 * "Nenhuma objeção!" quando `analyzed === true`, `objections` vazio e
 * `error === null`; logo, tratar resposta vazia/fora do formato como lista
 * vazia faz o vendedor acreditar que o cliente não resistiu.
 * Só um "[]" EXPLÍCITO da IA significa ausência de objeções.
 */

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

function renderDetector() {
  return renderHook(() => useObjectionDetector('contact-A', 'Ana', lastMessages, allMessages));
}

// O hook tem trava anti-repetição de 3 s entre análises (`Date.now()`);
// o relógio é controlado para caber duas análises no mesmo teste.
let fakeNow = 1_000_000;
const avancarRelogio = () => { fakeNow += 10_000; };

async function analisarComSucesso(result: { current: { analyze: () => Promise<void> } }, text: string) {
  invokeMock.mockResolvedValueOnce(objectionsPayload(text));
  await act(async () => { await result.current.analyze(); });
}

describe('useObjectionDetector — falha da IA ≠ "nenhuma objeção" (N-169)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeNow = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => fakeNow);
  });

  it('resposta vazia da IA mostra erro e mantém o resultado anterior', async () => {
    const { result } = renderDetector();
    await analisarComSucesso(result, 'preço');
    expect(result.current.objections).toHaveLength(1);
    expect(result.current.error).toBeNull();

    avancarRelogio();
    invokeMock.mockResolvedValueOnce({ data: { content: '' }, error: null });
    await act(async () => { await result.current.analyze(); });

    expect(result.current.error).not.toBeNull();
    expect(result.current.objections).toHaveLength(1);
    expect(result.current.objections[0].objection).toBe('preço');
    expect(toastMock.error).toHaveBeenCalledTimes(1);
  });

  it('resposta sem lista JSON mostra erro e mantém o resultado anterior', async () => {
    const { result } = renderDetector();
    await analisarComSucesso(result, 'prazo');
    expect(result.current.objections).toHaveLength(1);

    avancarRelogio();
    invokeMock.mockResolvedValueOnce({ data: { content: 'Não foi possível analisar as mensagens.' }, error: null });
    await act(async () => { await result.current.analyze(); });

    expect(result.current.error).not.toBeNull();
    expect(result.current.objections).toHaveLength(1);
    expect(result.current.objections[0].objection).toBe('prazo');
    expect(toastMock.success).toHaveBeenCalledTimes(1);
  });

  it('resposta sem conteúdo nenhum mostra erro em vez de "nenhuma objeção"', async () => {
    const { result } = renderDetector();

    invokeMock.mockResolvedValueOnce({ data: {}, error: null });
    await act(async () => { await result.current.analyze(); });

    expect(result.current.error).not.toBeNull();
    expect(result.current.analyzed).toBe(true);
    expect(result.current.objections).toHaveLength(0);
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('falha reportada pela IA (response.error) mantém o resultado anterior', async () => {
    const { result } = renderDetector();
    await analisarComSucesso(result, 'quantidade');

    avancarRelogio();
    invokeMock.mockResolvedValueOnce({ data: null, error: new Error('ai-proxy indisponível') });
    await act(async () => { await result.current.analyze(); });

    expect(result.current.error).toBe('ai-proxy indisponível');
    expect(result.current.objections).toHaveLength(1);
    expect(result.current.objections[0].objection).toBe('quantidade');
  });

  it('"[]" explícito da IA vira ausência de objeções, sem erro', async () => {
    const { result } = renderDetector();

    invokeMock.mockResolvedValueOnce({ data: { content: '[]' }, error: null });
    await act(async () => { await result.current.analyze(); });

    expect(result.current.objections).toHaveLength(0);
    expect(result.current.error).toBeNull();
    expect(result.current.analyzed).toBe(true);
    expect(toastMock.error).not.toHaveBeenCalled();
  });
});
