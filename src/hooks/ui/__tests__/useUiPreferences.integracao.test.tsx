import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * R2-PREF-001 — ponta a ponta no front: cada hook de preferência lê do servidor
 * (quando há sessão) e grava na conta, com o localStorage como cache do boot.
 */
const h = vi.hoisted(() => {
  const estado = {
    uid: 'user-1' as string | null,
    prefs: {} as Record<string, unknown> | null,
    adiarLeitura: false,
    liberarLeitura: null as null | (() => void),
  };
  const gravacoes: Array<{ user_id: string; prefs: Record<string, unknown> }> = [];
  const upsert = vi.fn(async (linha: { user_id: string; prefs: Record<string, unknown> }) => {
    gravacoes.push(linha);
    return { error: null };
  });
  const from = vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => {
          if (estado.adiarLeitura) await new Promise<void>(resolver => { estado.liberarLeitura = resolver; });
          return { data: estado.prefs ? { prefs: estado.prefs } : null, error: null };
        }),
      })),
    })),
    upsert,
  }));
  const getSession = vi.fn(async () => ({ data: { session: estado.uid ? { user: { id: estado.uid } } : null } }));
  const getUser = vi.fn(async () => ({ data: { user: estado.uid ? { id: estado.uid } : null } }));
  return { estado, gravacoes, upsert, from, getSession, getUser };
});

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: h.getSession, getUser: h.getUser }, from: h.from },
}));

import { UI_PREFERENCES_CACHE_KEY, __resetUiPreferencesParaTeste } from '@/hooks/ui/useUiPreferences';
import { useDensity } from '@/hooks/ui/useDensity';
import { useCustomShortcuts } from '@/hooks/ui/useCustomShortcuts';
import { useMessageSignature } from '@/hooks/chat/useMessageSignature';

async function esperarEnvio() {
  await act(async () => { await new Promise(resolver => setTimeout(resolver, 700)); });
}

describe('preferências de UI — os hooks falam com a conta (user_ui_preferences)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    h.gravacoes.length = 0;
    h.estado.uid = 'user-1';
    h.estado.prefs = {};
    h.estado.adiarLeitura = false;
    h.estado.liberarLeitura = null;
    __resetUiPreferencesParaTeste();
  });

  it('useDensity: a densidade da conta vence o cache local e o setDensity sobe no upsert', async () => {
    localStorage.setItem(UI_PREFERENCES_CACHE_KEY, JSON.stringify({ density: 'comfortable' }));
    h.estado.prefs = { density: 'dense' };
    __resetUiPreferencesParaTeste();

    const { result } = renderHook(() => useDensity());
    await waitFor(() => expect(result.current.density).toBe('dense'));
    expect(document.documentElement.getAttribute('data-density')).toBe('dense');

    act(() => { result.current.setDensity('compact'); });
    expect(result.current.density).toBe('compact');
    await esperarEnvio();

    expect(h.gravacoes[h.gravacoes.length - 1]?.user_id).toBe('user-1');
    expect(h.gravacoes[h.gravacoes.length - 1]?.prefs).toMatchObject({ density: 'compact' });
  });

  it('useDensity: ciclo de densidade continua funcionando e também é gravado', async () => {
    h.estado.prefs = { density: 'comfortable' };
    const { result } = renderHook(() => useDensity());
    await waitFor(() => expect(result.current.density).toBe('comfortable'));

    act(() => { result.current.cycleDensity(); });
    expect(result.current.density).toBe('compact');

    act(() => { result.current.cycleDensity(); });
    expect(result.current.density).toBe('dense');
    await esperarEnvio();
    expect(h.gravacoes[h.gravacoes.length - 1]?.prefs.density).toBe('dense');
  });

  it('useDensity: edição durante a leitura atrasada do servidor não é desfeita', async () => {
    h.estado.adiarLeitura = true;
    h.estado.prefs = { density: 'dense' };

    const { result } = renderHook(() => useDensity());
    await waitFor(() => expect(h.estado.liberarLeitura).toBeTruthy());

    act(() => { result.current.setDensity('compact'); });
    await act(async () => { h.estado.liberarLeitura?.(); });
    await esperarEnvio();

    expect(result.current.density).toBe('compact');
    expect(h.gravacoes[h.gravacoes.length - 1]?.prefs.density).toBe('compact');
  });

  it('useMessageSignature: preferência da conta vence e o toggle vai para o servidor', async () => {
    localStorage.setItem(UI_PREFERENCES_CACHE_KEY, JSON.stringify({ signatureEnabled: true }));
    h.estado.prefs = { signatureEnabled: false };
    __resetUiPreferencesParaTeste();

    const { result } = renderHook(() => useMessageSignature());
    await waitFor(() => expect(result.current.signatureEnabled).toBe(false));

    act(() => { result.current.toggleSignature(); });
    expect(result.current.signatureEnabled).toBe(true);
    await esperarEnvio();
    expect(h.gravacoes[h.gravacoes.length - 1]?.prefs.signatureEnabled).toBe(true);
  });

  it('useCustomShortcuts: o mapa de atalhos da conta entra na tela e a edição sobe', async () => {
    localStorage.setItem(UI_PREFERENCES_CACHE_KEY, JSON.stringify({}));
    h.estado.prefs = { shortcuts: { 'focus-input': { key: 'j', modifiers: { ctrlKey: true } } } };
    __resetUiPreferencesParaTeste();

    const { result } = renderHook(() => useCustomShortcuts());
    await waitFor(() => {
      expect(result.current.getShortcutById('focus-input')?.customKey).toBe('j');
    });

    act(() => { result.current.updateShortcut('templates', 'b', { ctrlKey: true, shiftKey: true }); });
    await esperarEnvio();
    // O envio carrega o mapa inteiro (a leitura do servidor não é perdida ao gravar).
    expect(h.gravacoes[h.gravacoes.length - 1]?.prefs.shortcuts).toMatchObject({
      'focus-input': { key: 'j', modifiers: { ctrlKey: true } },
      templates: { key: 'b', modifiers: { ctrlKey: true, shiftKey: true } },
    });
  });

  it('storage bloqueado: o consumidor continua funcionando e a conta recebe', async () => {
    const { result } = renderHook(() => useDensity());
    await waitFor(() => expect(result.current.density).toBe('comfortable'));

    const escrita = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    try {
      act(() => { result.current.setDensity('dense'); });
      await esperarEnvio();
    } finally {
      escrita.mockRestore();
    }

    expect(result.current.density).toBe('dense');
    expect(h.upsert).toHaveBeenCalledTimes(1);
    expect(h.gravacoes[0].prefs.density).toBe('dense');
  });
});
