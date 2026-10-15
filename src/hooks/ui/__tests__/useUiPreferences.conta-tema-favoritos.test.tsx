import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * R2-PREF-001 (refazer 1, ponto 4) — os dois consumidores que faltavam cobrir:
 * useThemePreset (skin/raio) e useQuickReplies (favoritos). Para cada um, o
 * mesmo trio: o valor da conta vence o cache, a gravação sobe no upsert, e a
 * edição feita durante a leitura atrasada não é desfeita.
 *
 * O `supabase` é fingido com cadeia de verdade por tabela: `user_ui_preferences`
 * (linha do usuário + upsert) e `message_templates` (lista vazia de modelos).
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
  const from = vi.fn((tabela: string) => {
    if (tabela === 'message_templates') {
      return {
        select: vi.fn(() => ({
          or: vi.fn(() => ({
            order: vi.fn(async () => ({ data: [], error: null })),
          })),
        })),
      };
    }
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => {
            if (estado.adiarLeitura) await new Promise<void>(resolver => { estado.liberarLeitura = resolver; });
            return { data: estado.prefs ? { prefs: estado.prefs } : null, error: null };
          }),
        })),
      })),
      upsert,
    };
  });
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

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/hooks/ui/useTheme', () => ({
  useTheme: () => ({ setTheme: vi.fn(), resolvedTheme: 'dark' as const }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { UI_PREFERENCES_CACHE_KEY, __resetUiPreferencesParaTeste } from '@/hooks/ui/useUiPreferences';
import { useThemePreset } from '@/components/settings/theme/useThemePreset';
import { useQuickReplies } from '@/hooks/chat/useQuickReplies';

/** Espera o debounce (400ms) + folga, sem depender de relógio falso. */
async function esperarEnvio() {
  await act(async () => { await new Promise(resolver => setTimeout(resolver, 700)); });
}

function montarWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe('preferências de UI — tema e favoritos falam com a conta (user_ui_preferences)', () => {
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

  it('useThemePreset: o tema da conta vence o cache e o updateConfig sobe no upsert', async () => {
    h.estado.prefs = { theme: { preset: 'sunset', borderRadius: 6 } };

    const { result } = renderHook(() => useThemePreset());
    await waitFor(() => expect(result.current.config.preset).toBe('sunset'));
    expect(result.current.config).toEqual({ preset: 'sunset', borderRadius: 6 });

    act(() => { result.current.updateConfig({ borderRadius: 8 }); });
    expect(result.current.config).toEqual({ preset: 'sunset', borderRadius: 8 });
    await esperarEnvio();

    expect(h.gravacoes[h.gravacoes.length - 1]?.user_id).toBe('user-1');
    expect(h.gravacoes[h.gravacoes.length - 1]?.prefs.theme).toEqual({ preset: 'sunset', borderRadius: 8 });
  });

  it('useThemePreset: edição durante a leitura atrasada do servidor não é desfeita', async () => {
    h.estado.adiarLeitura = true;
    h.estado.prefs = { theme: { preset: 'sunset', borderRadius: 6 } };

    const { result } = renderHook(() => useThemePreset());
    await waitFor(() => expect(result.current.config.preset).toBe('corporate'));

    act(() => { result.current.updateConfig({ preset: 'emerald' }); });
    expect(result.current.config.preset).toBe('emerald');

    await act(async () => { h.estado.liberarLeitura?.(); });
    // A leitura chegou (o envio do que o local venceu prova): a edição segue intacta.
    await waitFor(() => expect(h.upsert).toHaveBeenCalled());
    expect(result.current.config.preset).toBe('emerald');

    await esperarEnvio();
    expect(h.gravacoes[h.gravacoes.length - 1]?.prefs.theme).toMatchObject({ preset: 'emerald' });
  });

  it('useQuickReplies: os favoritos da conta vencem o cache e o toggle sobe no upsert', async () => {
    h.estado.prefs = { quickReplyFavorites: [{ id: 'f1', templateId: 't1', order: 0 }] };

    const { result } = renderHook(() => useQuickReplies(), { wrapper: montarWrapper() });
    await waitFor(() => {
      expect(result.current.favorites).toEqual([{ id: 'f1', templateId: 't1', order: 0 }]);
    });

    act(() => { result.current.toggleFavorite('t2'); });
    await waitFor(() => expect(result.current.favorites).toHaveLength(2));
    await esperarEnvio();

    expect(h.gravacoes[h.gravacoes.length - 1]?.user_id).toBe('user-1');
    const favoritas = h.gravacoes[h.gravacoes.length - 1]?.prefs.quickReplyFavorites as Array<{ templateId: string }>;
    expect(favoritas.map(f => f.templateId).sort()).toEqual(['t1', 't2']);
  });

  it('useQuickReplies: edição durante a leitura atrasada do servidor não é desfeita', async () => {
    h.estado.adiarLeitura = true;
    h.estado.prefs = { quickReplyFavorites: [{ id: 'f1', templateId: 't1', order: 0 }] };

    const { result } = renderHook(() => useQuickReplies(), { wrapper: montarWrapper() });
    await waitFor(() => expect(result.current.favorites).toEqual([]));

    act(() => { result.current.toggleFavorite('t9'); });
    await waitFor(() => {
      expect(result.current.favorites.map(f => f.templateId)).toEqual(['t9']);
    });

    await act(async () => { h.estado.liberarLeitura?.(); });
    // A leitura chegou (o envio do que o local venceu prova): a edição segue intacta.
    await waitFor(() => expect(h.upsert).toHaveBeenCalled());
    expect(result.current.favorites.map(f => f.templateId)).toContain('t9');

    await esperarEnvio();
    const favoritas = h.gravacoes[h.gravacoes.length - 1]?.prefs.quickReplyFavorites as Array<{ templateId: string }>;
    expect(favoritas.map(f => f.templateId)).toContain('t9');
  });
});
