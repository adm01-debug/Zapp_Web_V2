/**
 * Cartão t_b23807e6 — store do agregado Realtime (selo "Reconectando…").
 * Verifica o estado agregado por canal e a carência de 5 s antes de o selo
 * aparecer (o supabase-js reconecta sozinho; oscilação curta não vira aviso).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  REALTIME_STALE_GRACE_MS,
  getRealtimeNoticeSnapshot,
  getRealtimeStatusSnapshot,
  removeRealtimeChannel,
  resetRealtimeStatus,
  setRealtimeChannelStatus,
  subscribeRealtimeStatus,
  toChannelHealth,
} from '@/hooks/realtime/realtimeStatusStore';

describe('realtimeStatusStore — estado agregado', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetRealtimeStatus();
  });

  afterEach(() => {
    resetRealtimeStatus();
    vi.useRealTimers();
  });

  it('sem canal nenhum o estado é idle e o selo não aparece', () => {
    expect(getRealtimeStatusSnapshot()).toBe('idle');
    expect(getRealtimeNoticeSnapshot()).toBe(false);
  });

  it('canal conectado deixa o agregado em connected', () => {
    setRealtimeChannelStatus('messages:1', 'connected');
    expect(getRealtimeStatusSnapshot()).toBe('connected');
  });

  it('canal ainda abrindo não acusa queda nem conexão', () => {
    setRealtimeChannelStatus('messages:1', 'connecting');
    expect(getRealtimeStatusSnapshot()).toBe('connecting');
  });

  it('um canal em erro derruba o agregado para disconnected', () => {
    setRealtimeChannelStatus('messages:1', 'connected');
    setRealtimeChannelStatus('contatos', 'error');
    expect(getRealtimeStatusSnapshot()).toBe('disconnected');
  });

  it('canal liberado sai do agregado', () => {
    setRealtimeChannelStatus('messages:1', 'error');
    removeRealtimeChannel('messages:1');
    expect(getRealtimeStatusSnapshot()).toBe('idle');
  });

  it('o selo só aparece depois de 5 s de queda', () => {
    setRealtimeChannelStatus('messages:1', 'error');

    vi.advanceTimersByTime(REALTIME_STALE_GRACE_MS - 1);
    expect(getRealtimeNoticeSnapshot()).toBe(false);

    vi.advanceTimersByTime(1);
    expect(getRealtimeNoticeSnapshot()).toBe(true);
  });

  it('oscilação curta (volta antes dos 5 s) nunca mostra o selo', () => {
    setRealtimeChannelStatus('messages:1', 'error');
    vi.advanceTimersByTime(2_000);
    setRealtimeChannelStatus('messages:1', 'connected');
    vi.advanceTimersByTime(REALTIME_STALE_GRACE_MS * 2);

    expect(getRealtimeNoticeSnapshot()).toBe(false);
    expect(getRealtimeStatusSnapshot()).toBe('connected');
  });

  it('reconectar depois do selo apaga o selo na hora', () => {
    setRealtimeChannelStatus('messages:1', 'error');
    vi.advanceTimersByTime(REALTIME_STALE_GRACE_MS);
    expect(getRealtimeNoticeSnapshot()).toBe(true);

    setRealtimeChannelStatus('messages:1', 'connected');
    expect(getRealtimeNoticeSnapshot()).toBe(false);
    expect(getRealtimeStatusSnapshot()).toBe('connected');
  });

  it('avisa os ouvintes quando o estado muda', () => {
    const ouvinte = vi.fn();
    const cancelar = subscribeRealtimeStatus(ouvinte);

    setRealtimeChannelStatus('messages:1', 'connected');
    expect(ouvinte).toHaveBeenCalledTimes(1);

    // Repetir o mesmo estado não re-renderiza a tela.
    setRealtimeChannelStatus('messages:1', 'connected');
    expect(ouvinte).toHaveBeenCalledTimes(1);

    cancelar();
    setRealtimeChannelStatus('messages:1', 'error');
    expect(ouvinte).toHaveBeenCalledTimes(1);
  });
});

describe('toChannelHealth — status do supabase-js', () => {
  it('mapeia SUBSCRIBED para connected', () => {
    expect(toChannelHealth('SUBSCRIBED')).toBe('connected');
  });

  it('mapeia CHANNEL_ERROR, TIMED_OUT e CLOSED para error', () => {
    expect(toChannelHealth('CHANNEL_ERROR')).toBe('error');
    expect(toChannelHealth('TIMED_OUT')).toBe('error');
    expect(toChannelHealth('CLOSED')).toBe('error');
  });

  it('mapeia os demais (JOINING, INITIALIZING) para connecting', () => {
    expect(toChannelHealth('JOINING')).toBe('connecting');
    expect(toChannelHealth('INITIALIZING')).toBe('connecting');
  });
});
