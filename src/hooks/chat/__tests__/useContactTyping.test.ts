/**
 * Cartão t_51c0ff3d — hook leve de "digitando…" para a linha da lista.
 *
 * Contrato do `useContactTyping`:
 *  - assina o canal EXATO `typing:${contactId}` — o mesmo que o webhook da
 *    Evolution publica (evolution-webhook-handlers.ts);
 *  - broadcast `contact_typing` { isTyping: true } → true; expira sozinho após
 *    TYPING_AUTO_CLEAR_MS (nunca fica "digitando" eterno);
 *  - STOP com DEBOUNCE: { isTyping: false } só derruba após
 *    TYPING_STOP_DEBOUNCE_MS sem reativação (anti-flicker composing/paused);
 *  - `enabled=false` (linha fora da tela) NÃO cria canal;
 *  - defesa: ignora `@broadcast` e `@g.us`;
 *  - cleanup: unsubscribe + removeChannel (sem vazamento de canal).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useContactTyping, TYPING_AUTO_CLEAR_MS, TYPING_STOP_DEBOUNCE_MS } from '../useContactTyping';

interface ChannelEntry {
  topic: string;
  broadcastCb?: (envelope: unknown) => void;
  unsubscribed: boolean;
}

const fake = vi.hoisted(() => {
  const entries: ChannelEntry[] = [];
  const unsubscribes: Array<ReturnType<typeof vi.fn>> = [];

  const channel = vi.fn((topic: string) => {
    const entry: ChannelEntry = { topic, unsubscribed: false };
    entries.push(entry);
    const unsubscribe = vi.fn(() => { entry.unsubscribed = true; });
    unsubscribes.push(unsubscribe);
    const instance = {
      on: vi.fn((type: string, _opts: unknown, cb?: (envelope: unknown) => void) => {
        if (type === 'broadcast') entry.broadcastCb = cb;
        return instance;
      }),
      subscribe: vi.fn(() => instance),
      unsubscribe,
    };
    return instance;
  });

  const removeChannel = vi.fn();
  return { entries, unsubscribes, channel, removeChannel, supabase: { channel, removeChannel } };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: fake.supabase }));

const CONTACT = 'contato-123';

function broadcast(entry: ChannelEntry, payload: unknown) {
  // O callback do supabase-js recebe o ENVELOPE { payload } — o hook destrutura.
  act(() => { entry.broadcastCb?.({ payload }); });
}

describe('useContactTyping (aviso de digitando da lista)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fake.entries.length = 0;
    fake.unsubscribes.length = 0;
    fake.channel.mockClear();
    fake.removeChannel.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('assina o canal exato `typing:${contactId}`', () => {
    renderHook(() => useContactTyping(CONTACT));
    expect(fake.channel).toHaveBeenCalledTimes(1);
    expect(fake.channel).toHaveBeenCalledWith(`typing:${CONTACT}`);
    expect(fake.entries[0].broadcastCb).toBeTypeOf('function');
  });

  it('typing:true → true e expira após TYPING_AUTO_CLEAR_MS (nunca eterno)', () => {
    const { result } = renderHook(() => useContactTyping(CONTACT));
    broadcast(fake.entries[0], { isTyping: true });
    expect(result.current).toBe(true);

    act(() => { vi.advanceTimersByTime(TYPING_AUTO_CLEAR_MS - 1); });
    expect(result.current).toBe(true);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe(false);
  });

  it('anti-flicker: stop só derruba após TYPING_STOP_DEBOUNCE_MS sem reativação', () => {
    const { result } = renderHook(() => useContactTyping(CONTACT));
    broadcast(fake.entries[0], { isTyping: true });
    expect(result.current).toBe(true);

    broadcast(fake.entries[0], { isTyping: false });
    act(() => { vi.advanceTimersByTime(TYPING_STOP_DEBOUNCE_MS - 1); });
    expect(result.current).toBe(true); // ainda dentro da janela de debounce
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe(false);
  });

  it('reativação dentro da janela de debounce não apaga o aviso', () => {
    const { result } = renderHook(() => useContactTyping(CONTACT));
    broadcast(fake.entries[0], { isTyping: true });
    broadcast(fake.entries[0], { isTyping: false });
    act(() => { vi.advanceTimersByTime(TYPING_STOP_DEBOUNCE_MS - 1); });
    broadcast(fake.entries[0], { isTyping: true });
    act(() => { vi.advanceTimersByTime(TYPING_STOP_DEBOUNCE_MS); });
    expect(result.current).toBe(true);
  });

  it('enabled=false (linha fora da tela) não cria canal', () => {
    renderHook(() => useContactTyping(CONTACT, { enabled: false }));
    renderHook(() => useContactTyping(CONTACT, false));
    expect(fake.channel).not.toHaveBeenCalled();
  });

  it('ignora @broadcast e @g.us (sem criar canal)', () => {
    renderHook(() => useContactTyping('status@broadcast'));
    renderHook(() => useContactTyping('1203630123456789@g.us'));
    expect(fake.channel).not.toHaveBeenCalled();
  });

  it('limpa o canal ao desmontar (unsubscribe + removeChannel)', () => {
    const { unmount } = renderHook(() => useContactTyping(CONTACT));
    unmount();
    expect(fake.unsubscribes[0]).toHaveBeenCalledTimes(1);
    expect(fake.removeChannel).toHaveBeenCalledTimes(1);
  });

  it('troca de contato re-assina no canal novo e libera o antigo', () => {
    const { rerender } = renderHook(({ id }) => useContactTyping(id), {
      initialProps: { id: CONTACT },
    });
    expect(fake.channel).toHaveBeenCalledWith(`typing:${CONTACT}`);

    act(() => { rerender({ id: 'contato-999' }); });
    expect(fake.unsubscribes[0]).toHaveBeenCalledTimes(1);
    expect(fake.channel).toHaveBeenLastCalledWith('typing:contato-999');
  });
});
