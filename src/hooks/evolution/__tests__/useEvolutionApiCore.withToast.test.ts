/**
 * Testes de `src/hooks/evolution/useEvolutionApiCore.ts` — os caminhos que a
 * suíte principal (`useEvolutionApiCore.test.ts`, do cartão pai EVO-TIMEOUT) não
 * cobre: o caminho de SUCESSO do `withToast`, o corpo padrão (`{}`) quando a
 * chamada vai sem `body` e a resposta que não é objeto.
 *
 * Como se prova aqui: o hook REAL é montado e a única fronteira dublada é a
 * rede (`supabase.functions.invoke`) — que devolve `{ data, error }` como o
 * supabase-js devolve de verdade.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: h.invoke } },
}));
vi.mock('sonner', () => ({ toast: h.toast }));
vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },

  getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
  createLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
}));

import { useEvolutionApiCore } from '@/hooks/evolution/useEvolutionApiCore';

beforeEach(() => {
  vi.clearAllMocks();
  h.invoke.mockResolvedValue({ data: null, error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('withToast — caminho de sucesso', () => {
  it('devolve o dado e avisa o usuário com a mensagem de sucesso', async () => {
    h.invoke.mockResolvedValue({ data: { instance: { state: 'open' } }, error: null });
    const { result } = renderHook(() => useEvolutionApiCore());

    let out: unknown;
    await act(async () => {
      out = await result.current.withToast('instance-info', { instanceName: 'zap-01' }, 'Conexão ativa', 'Falhou');
    });

    expect(out).toEqual({ instance: { state: 'open' } });
    expect(h.toast.success).toHaveBeenCalledWith('Conexão ativa');
    expect(h.toast.error).not.toHaveBeenCalled();
  });

  it('a chamada sem `body` chega à Edge com corpo vazio `{}` (o contrato do invoke não recebe undefined)', async () => {
    const { result } = renderHook(() => useEvolutionApiCore());

    await act(async () => {
      await result.current.withToast('status', undefined, 'Ok', 'Falhou', 'GET');
    });

    const [, options] = h.invoke.mock.calls[0] as [string, { body: unknown }];
    expect(options.body).toEqual({});
  });
});

describe('callApi — resposta que não é objeto', () => {
  it('um texto devolvido pela Edge passa direto (não é confundido com corpo de erro)', async () => {
    h.invoke.mockResolvedValue({ data: 'pong', error: null });
    const { result } = renderHook(() => useEvolutionApiCore());

    let out: unknown;
    await act(async () => {
      out = await result.current.callApi('ping', undefined, 'GET');
    });

    expect(out).toBe('pong');
    expect(result.current.isLoading).toBe(false);
  });
});
