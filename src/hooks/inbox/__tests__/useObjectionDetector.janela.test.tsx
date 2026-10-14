import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useObjectionDetector } from '../useObjectionDetector';

/**
 * Objeções: o `ai-proxy` recusa UMA mensagem acima de 50000 caracteres
 * (supabase/functions/ai-proxy/index.ts:54). O cliente precisa recortar e
 * informar o recorte — antes disso, um cliente de conversa longa recebia só
 * "Edge Function returned a non-2xx status code".
 */

const invokeMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));
vi.mock('sonner', () => ({ toast: toastMock }));

const CONTEUDO_50000 = 50000;

const mensagemLonga = (i: number) => ({
  id: `m${i}`,
  content: `${i}`.padEnd(1000, 'a'),
  sender: 'contact',
  timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
});

const responda = () => ({ data: { content: '[]' }, error: null });

describe('useObjectionDetector — teto de caracteres do ai-proxy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('com 200 mensagens grandes, o corpo enviado cabe em 50000 chars', async () => {
    const allMessages = Array.from({ length: 200 }, (_, i) => mensagemLonga(i));
    const { result } = renderHook(() => useObjectionDetector('contact-A', 'Ana', [], allMessages));

    invokeMock.mockResolvedValueOnce(responda());
    await act(async () => { await result.current.analyze(); });

    const corpo = invokeMock.mock.calls[0][1].body as { messages: Array<{ content: string }> };
    const enviado = corpo.messages[corpo.messages.length - 1].content;
    expect(enviado.length).toBeLessThanOrEqual(CONTEUDO_50000);
    // começa pelo recorte mais RECENTE
    expect(enviado.endsWith('199'.padEnd(1000, 'a'))).toBe(true);
    expect(result.current.clientMessagesTotal).toBe(200);
    expect(result.current.clientMessagesOmitted).toBeGreaterThan(0);
  });

  it('informa o recorte no toast quando mensagens ficam de fora', async () => {
    const allMessages = Array.from({ length: 200 }, (_, i) => mensagemLonga(i));
    const { result } = renderHook(() => useObjectionDetector('contact-A', 'Ana', [], allMessages));

    invokeMock.mockResolvedValueOnce({
      data: { content: JSON.stringify([{ objection: 'preço', counterArgument: 'resposta', confidence: 0.9 }]) },
      error: null,
    });
    await act(async () => { await result.current.analyze(); });

    expect(toastMock.success).toHaveBeenCalledTimes(1);
    expect(String(toastMock.success.mock.calls[0][0])).toContain('de 200 mensagens do cliente');
  });

  it('conversa curta continua enviando tudo, sem aviso de recorte', async () => {
    const allMessages = [mensagemLonga(0), { ...mensagemLonga(1), content: 'achei caro' }];
    const { result } = renderHook(() => useObjectionDetector('contact-A', 'Ana', [], allMessages));

    invokeMock.mockResolvedValueOnce({
      data: { content: JSON.stringify([{ objection: 'preço', counterArgument: 'resposta', confidence: 0.9 }]) },
      error: null,
    });
    await act(async () => { await result.current.analyze(); });

    expect(result.current.clientMessages).toHaveLength(2);
    expect(result.current.clientMessagesOmitted).toBe(0);
    expect(String(toastMock.success.mock.calls[0][0])).not.toContain('de 2 mensagens');
  });

  it('422 do servidor vira a mensagem do servidor no erro', async () => {
    const allMessages = [mensagemLonga(0), { ...mensagemLonga(1), content: 'achei caro' }];
    const { result } = renderHook(() => useObjectionDetector('contact-A', 'Ana', [], allMessages));

    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: { clone: () => ({ json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'Payload grande demais.', fields: [] } }) }) },
      },
    });
    await act(async () => { await result.current.analyze(); });

    expect(result.current.error).toBe('Payload grande demais.');
  });
});
