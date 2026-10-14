import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUniversityHelp } from '../useUniversityHelp';

/**
 * Universitário: o `ai-proxy` recusa UMA mensagem acima de 50000 caracteres
 * (supabase/functions/ai-proxy/index.ts:54). Selecionar muitas mensagens (ou uma
 * gigante) precisa enviar só o que cabe e informar o recorte — antes disso a
 * única resposta era "Edge Function returned a non-2xx status code".
 */

const invokeMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));
vi.mock('sonner', () => ({ toast: toastMock }));

const TETO = 50000;

const mensagemGrande = (i: number) => ({
  id: `m${i}`,
  content: `[${i}]`.padEnd(1000, 'b'),
  sender: 'contact',
  timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
});

const resposta = () => ({ data: { content: 'Sugestão de resposta.' }, error: null });

describe('useUniversityHelp — teto de caracteres do ai-proxy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('com 100 mensagens selecionadas, o corpo enviado cabe em 50000 chars', async () => {
    const messages = Array.from({ length: 100 }, (_, i) => mensagemGrande(i));
    const { result } = renderHook(() => useUniversityHelp('contact-A', 'Ana', messages));

    act(() => {
      for (let i = 0; i < 100; i++) result.current.toggleMessage(`m${i}`);
    });
    expect(result.current.selectedIds.size).toBe(100);

    invokeMock.mockResolvedValueOnce(resposta());
    await act(async () => { await result.current.generateResponse(); });

    const corpo = invokeMock.mock.calls[0][1].body as { messages: Array<{ role: string; content: string }> };
    const enviado = corpo.messages[corpo.messages.length - 1].content;
    expect(enviado.length).toBeLessThanOrEqual(TETO);
    expect(result.current.selectedMessagesTotal).toBe(100);
    expect(result.current.selectedMessagesOmitted).toBeGreaterThan(0);
    // recorte do mais RECENTE para o mais antigo
    expect(enviado.endsWith('[99]'.padEnd(1000, 'b'))).toBe(true);
  });

  it('informa o recorte no toast quando mensagens selecionadas ficam de fora', async () => {
    const messages = Array.from({ length: 100 }, (_, i) => mensagemGrande(i));
    const { result } = renderHook(() => useUniversityHelp('contact-A', 'Ana', messages));

    act(() => {
      for (let i = 0; i < 100; i++) result.current.toggleMessage(`m${i}`);
    });
    invokeMock.mockResolvedValueOnce(resposta());
    await act(async () => { await result.current.generateResponse(); });

    expect(toastMock.success).toHaveBeenCalledTimes(1);
    expect(String(toastMock.success.mock.calls[0][0])).toContain('de 100 mensagens selecionadas');
  });

  it('seleção curta continua enviando tudo, sem aviso de recorte', async () => {
    const messages = [
      { ...mensagemGrande(0), content: 'Como faço o pedido?' },
      { ...mensagemGrande(1), content: 'Qual o prazo?' },
    ];
    const { result } = renderHook(() => useUniversityHelp('contact-A', 'Ana', messages));

    act(() => { result.current.toggleMessage('m0'); result.current.toggleMessage('m1'); });
    invokeMock.mockResolvedValueOnce(resposta());
    await act(async () => { await result.current.generateResponse(); });

    expect(result.current.selectedMessagesAnalyzed).toBe(2);
    expect(result.current.selectedMessagesOmitted).toBe(0);
    expect(toastMock.success).toHaveBeenCalledWith('Resposta gerada com sucesso!');
  });

  it('422 do servidor vira a mensagem do servidor no erro', async () => {
    const messages = [
      { ...mensagemGrande(0), content: 'Como faço o pedido?' },
      { ...mensagemGrande(1), content: 'Qual o prazo?' },
    ];
    const { result } = renderHook(() => useUniversityHelp('contact-A', 'Ana', messages));

    act(() => { result.current.toggleMessage('m0'); result.current.toggleMessage('m1'); });
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: { clone: () => ({ json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'Payload grande demais.', fields: [] } }) }) },
      },
    });
    await act(async () => { await result.current.generateResponse(); });

    expect(result.current.error).toBe('Payload grande demais.');
  });
});
