import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * PD-38: preferencias de alerta de conexao. O hook le a PROPRIA linha (RLS) e grava
 * com upsert otimista em onConflict=user_id: o interruptor muda na hora e, se o banco
 * recusar, o cache volta ao valor anterior (rollback) com a falha anunciada.
 */
const h = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  row: null as Record<string, unknown> | null,
  upsertArgs: null as { payload: Record<string, unknown>; opts: unknown } | null,
  upsertPromise: Promise.resolve({ data: null, error: null }) as Promise<{ data: unknown; error: unknown }>,
  toastError: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        maybeSingle: async () => ({ data: h.row, error: null }),
      }),
      upsert: (payload: Record<string, unknown>, opts: unknown) => {
        h.upsertArgs = { payload, opts };
        // `select(...)` depois do upsert: a RLS pode nao devolver a linha.
        return { select: () => ({ maybeSingle: () => h.upsertPromise }) };
      },
    }),
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: h.user, session: null, profile: null, loading: false }),
}));

vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => h.toastError(...args), success: vi.fn() },
}));

import {
  useConnectionAlertPreferences,
  shouldNotifyConnectionAlert,
  CONNECTION_ALERT_DEFAULTS,
} from '../useConnectionAlertPreferences';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const montar = () => renderHook(() => useConnectionAlertPreferences(), { wrapper });

describe('useConnectionAlertPreferences — leitura', () => {
  beforeEach(() => {
    h.user = { id: 'user-1' };
    h.row = null;
    h.upsertArgs = null;
    h.upsertPromise = Promise.resolve({ data: null, error: null });
    h.toastError.mockReset();
  });

  it('sem linha no banco, tudo fica LIGADO (mesmo padrao das colunas)', async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.preferences).toEqual(CONNECTION_ALERT_DEFAULTS);
  });

  it('le a linha salva e sobrepoe o padrao campo a campo', async () => {
    h.row = { push_enabled: false, email_enabled: true, alert_on_degraded: false, alert_on_disconnected: false };
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.preferences).toEqual({
      push_enabled: false,
      email_enabled: true,
      alert_on_degraded: false,
      alert_on_disconnected: false,
    });
  });

  it('sem usuario autenticado nao consulta e nao grava', async () => {
    h.user = null;
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.preferences).toEqual(CONNECTION_ALERT_DEFAULTS);
    await expect(result.current.updatePreferenceAsync({ alert_on_disconnected: false })).rejects.toThrow(
      /Sem usuário autenticado/,
    );
    expect(h.upsertArgs).toBeNull();
  });
});

describe('useConnectionAlertPreferences — gravacao otimista com rollback', () => {
  beforeEach(() => {
    h.user = { id: 'user-1' };
    // O servidor ja tem o aviso LIGADO: e a esse valor que o rollback deve voltar.
    h.row = { push_enabled: true, email_enabled: true, alert_on_degraded: true, alert_on_disconnected: true };
    h.upsertArgs = null;
    h.upsertPromise = Promise.resolve({ data: null, error: null });
    h.toastError.mockReset();
  });

  it('muda a preferencia NA HORA (antes do banco responder) e grava em onConflict=user_id', async () => {
    let resolver!: (v: { data: unknown; error: unknown }) => void;
    h.upsertPromise = new Promise((r) => { resolver = r; });

    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.preferences.alert_on_disconnected).toBe(true);

    act(() => {
      result.current.updatePreference({ alert_on_disconnected: false });
    });

    // Ainda pendente: o otimista ja vale.
    await waitFor(() => expect(result.current.preferences.alert_on_disconnected).toBe(false));

    await act(async () => {
      resolver({
        data: { push_enabled: true, email_enabled: true, alert_on_degraded: true, alert_on_disconnected: false },
        error: null,
      });
    });

    expect(h.upsertArgs?.payload).toEqual({ user_id: 'user-1', alert_on_disconnected: false });
    expect(h.upsertArgs?.opts).toEqual({ onConflict: 'user_id' });
    await waitFor(() => expect(result.current.preferences.alert_on_disconnected).toBe(false));
    expect(h.toastError).not.toHaveBeenCalled();
  });

  it('banco recusa: volta ao valor anterior e a falha NAO e engolida', async () => {
    h.upsertPromise = Promise.resolve({ data: null, error: new Error('permission denied') });

    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await expect(result.current.updatePreferenceAsync({ alert_on_disconnected: false })).rejects.toThrow(
        /permission denied/,
      );
    });

    expect(h.toastError).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.preferences.alert_on_disconnected).toBe(true));
  });

  it('upsert aceito mas SEM linha devolvida (RLS) e tratado como falha, nao como sucesso', async () => {
    h.upsertPromise = Promise.resolve({ data: null, error: null });

    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await expect(result.current.updatePreferenceAsync({ email_enabled: false })).rejects.toThrow(
        /não foi gravada/,
      );
    });

    expect(h.toastError).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.preferences.email_enabled).toBe(true));
  });
});

describe('shouldNotifyConnectionAlert — o tipo e o interruptor mestre', () => {
  it('degradada segue alert_on_degraded; desconectada segue alert_on_disconnected', () => {
    expect(shouldNotifyConnectionAlert(CONNECTION_ALERT_DEFAULTS, 'degraded')).toBe(true);
    expect(shouldNotifyConnectionAlert(CONNECTION_ALERT_DEFAULTS, 'disconnected')).toBe(true);
    expect(
      shouldNotifyConnectionAlert({ ...CONNECTION_ALERT_DEFAULTS, alert_on_degraded: false }, 'degraded'),
    ).toBe(false);
    expect(
      shouldNotifyConnectionAlert({ ...CONNECTION_ALERT_DEFAULTS, alert_on_disconnected: false }, 'disconnected'),
    ).toBe(false);
    // canal desligado nao desliga o TIPO (o tipo decide SE avisa; o canal, POR ONDE)
    expect(
      shouldNotifyConnectionAlert({ ...CONNECTION_ALERT_DEFAULTS, push_enabled: false, email_enabled: false }, 'disconnected'),
    ).toBe(true);
  });
});
