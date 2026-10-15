import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { StrictMode } from 'react';

/**
 * B2 (12/10/2026): o canal de `whatsapp_connections` tinha nome FIXO
 * ('whatsapp-connections-changes' no gerente, 'disconnect-banner' na faixa). O
 * `supabase.channel(nome)` devolve o canal já existente quando o nome repete e
 * `.on()` em canal inscrito lança; o unmount de um consumidor também cortava o
 * realtime do outro. Cada montagem precisa de tópico próprio, e o cleanup tem
 * de desfazer a assinatura e remover o canal.
 */
const mocks = vi.hoisted(() => ({
  channel: vi.fn(),
  on: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  removeChannel: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: (...args: unknown[]) => mocks.channel(...args),
    removeChannel: (...args: unknown[]) => mocks.removeChannel(...args),
  },
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  toast: (...args: unknown[]) => mocks.toast(...args),
}));

vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { useConnectionsRealtime } from '@/hooks/inbox/useConnectionsRealtime';

function topicos(): string[] {
  return mocks.channel.mock.calls.map((call) => call[0] as string);
}

function titulosDeToast(): (string | undefined)[] {
  return mocks.toast.mock.calls.map((call) => (call[0] as { title?: string }).title);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.channel.mockImplementation(() => {
    const canal = { on: mocks.on, subscribe: mocks.subscribe, unsubscribe: mocks.unsubscribe };
    mocks.on.mockReturnValue(canal);
    mocks.subscribe.mockReturnValue(canal);
    mocks.unsubscribe.mockReturnValue(canal);
    return canal;
  });
});

describe('useConnectionsRealtime — canal único por montagem', () => {
  it('abre o canal com tópico único (dois consumidores não compartilham)', () => {
    const primeiro = renderHook(() => useConnectionsRealtime());
    const segundo = renderHook(() => useConnectionsRealtime());

    const nomes = topicos();
    expect(nomes).toHaveLength(2);
    expect(nomes.every((nome) => nome.startsWith('whatsapp-connections-changes:'))).toBe(true);
    // O defeito era exatamente este: dois nomes iguais = um canal só para os dois.
    expect(new Set(nomes).size).toBe(2);

    primeiro.unmount();
    segundo.unmount();
  });

  it('desfaz a assinatura e remove o canal no unmount', () => {
    const { unmount } = renderHook(() => useConnectionsRealtime());
    const canal = mocks.channel.mock.results[0].value;

    unmount();

    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
    expect(mocks.removeChannel).toHaveBeenCalledWith(canal);
  });

  it('em StrictMode (monta/desmonta 2x) não reusa tópico nem estoura', () => {
    const { unmount } = renderHook(() => useConnectionsRealtime(), { wrapper: StrictMode });

    const nomes = topicos();
    expect(nomes.length).toBeGreaterThanOrEqual(1);
    expect(new Set(nomes).size).toBe(nomes.length);
    expect(mocks.removeChannel.mock.calls.length).toBeLessThanOrEqual(nomes.length);

    unmount();
  });
});

describe('useConnectionsRealtime — um aviso por transição para conectado', () => {
  it('anuncia uma vez e só volta a anunciar depois de sair do estado conectado', () => {
    const { result } = renderHook(() => useConnectionsRealtime());

    act(() => {
      result.current.announceConnected({ id: 'c1', status: 'connected' });
      // Segunda fonte (realtime E polling de 3s veem a mesma transição).
      result.current.announceConnected({ id: 'c1', status: 'connected' });
    });

    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(titulosDeToast()).toEqual(['WhatsApp conectado!']);

    act(() => { result.current.announceConnected({ id: 'c1', status: 'disconnected' }); });
    act(() => { result.current.announceConnected({ id: 'c1', status: 'connected' }); });

    expect(mocks.toast).toHaveBeenCalledTimes(2);
  });
});
