/**
 * Preferências de alerta de SLA — `useSlaAlertPreferences`.
 *
 * O sujeito é o hook REAL; a dublagem é a fronteira de rede (`supabase.from`). Regras provadas:
 * leitura da própria linha, default quando não existe linha, upsert com `user_id` do logado (a RLS
 * só aceita a própria linha), erro de leitura exposto à tela e erro de gravação não perdido.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SlaAlertPreferences } from '../slaAlertPreferences';

const h = vi.hoisted(() => ({
  ops: [] as Array<{ table: string; op: string; payload?: unknown; filters: unknown[][] }>,
  tables: {} as Record<string, { data: unknown; error: unknown }>,
  writeError: null as unknown,
  userId: 'u-1' as string | null,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: h.userId ? { id: h.userId } : null }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const entry: { table: string; op: string; payload?: unknown; filters: unknown[][] } = {
        table,
        op: 'select',
        filters: [],
      };
      h.ops.push(entry);
      const builder: Record<string, unknown> = {};
      const mesmo = () => builder;
      builder.select = () => mesmo();
      builder.eq = (...a: unknown[]) => {
        entry.filters.push(['eq', ...a]);
        return mesmo();
      };
      builder.maybeSingle = () => mesmo();
      builder.upsert = (payload: unknown) => {
        entry.op = 'upsert';
        entry.payload = payload;
        return mesmo();
      };
      builder.then = (ok?: (v: unknown) => unknown, falhou?: (e: unknown) => unknown) => {
        const base =
          entry.op === 'select'
            ? (h.tables[table] ?? { data: null, error: null })
            : { data: null, error: h.writeError };
        return Promise.resolve(base).then(ok, falhou);
      };
      return builder;
    },
  },
}));

import { useSlaAlertPreferences } from '../useSlaAlertPreferences';
import { toast } from 'sonner';

const toastMock = toast as unknown as {
  success: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
};

const linha = {
  user_id: 'u-1',
  enabled: true,
  alert_first_response: false,
  alert_resolution: true,
  severity_warning: true,
  severity_breached: false,
};

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  const setDataSpy = vi.spyOn(queryClient, 'setQueryData');
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return {
    ...renderHook(() => useSlaAlertPreferences(), { wrapper }),
    queryClient,
    invalidateSpy,
    setDataSpy,
  };
}

beforeEach(() => {
  h.ops = [];
  h.tables = {};
  h.writeError = null;
  h.userId = 'u-1';
  toastMock.success.mockClear();
  toastMock.error.mockClear();
});

describe('useSlaAlertPreferences', () => {
  it('lê a própria linha e devolve as preferências normalizadas', async () => {
    h.tables.sla_alert_preferences = { data: linha, error: null };
    const { result } = setup();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.preferences).toEqual({
      enabled: true,
      alertFirstResponse: false,
      alertResolution: true,
      severityWarning: true,
      severityBreached: false,
    });

    const leitura = h.ops.find((o) => o.table === 'sla_alert_preferences' && o.op === 'select');
    expect(leitura?.filters).toContainEqual(['eq', 'user_id', 'u-1']);
    expect(result.current.isError).toBe(false);
  });

  it('sem linha no banco (usuário novo) vale o default da tabela', async () => {
    h.tables.sla_alert_preferences = { data: null, error: null };
    const { result } = setup();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.preferences).toEqual({
      enabled: true,
      alertFirstResponse: true,
      alertResolution: true,
      severityWarning: true,
      severityBreached: true,
    });
  });

  it('erro de leitura é exposto (não vira "sem preferências")', async () => {
    h.tables.sla_alert_preferences = { data: null, error: { message: 'permission denied' } };
    const { result } = setup();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isLoading).toBe(false);
  });

  it('grava com upsert na própria linha e atualiza o cache', async () => {
    h.tables.sla_alert_preferences = { data: linha, error: null };
    const { result, invalidateSpy, setDataSpy } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const proximo: SlaAlertPreferences = {
      enabled: true,
      alertFirstResponse: true,
      alertResolution: true,
      severityWarning: false,
      severityBreached: true,
    };
    act(() => result.current.save(proximo));

    await waitFor(() => expect(toastMock.success).toHaveBeenCalled());

    const escrita = h.ops.find((o) => o.op === 'upsert');
    expect(escrita?.table).toBe('sla_alert_preferences');
    expect(escrita?.payload).toEqual({
      user_id: 'u-1',
      enabled: true,
      alert_first_response: true,
      alert_resolution: true,
      severity_warning: false,
      severity_breached: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['sla-alert-preferences'] });
    // O valor gravado entra no cache na hora (o monitor de alertas lê o mesmo cache).
    expect(setDataSpy).toHaveBeenCalledWith(['sla-alert-preferences', 'u-1'], proximo);
  });

  it('recusa do banco aparece no toast e não inventa sucesso', async () => {
    h.tables.sla_alert_preferences = { data: linha, error: null };
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    h.writeError = { message: 'new row violates row-level security policy' };
    act(() => result.current.save({ ...result.current.preferences, enabled: false }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith('new row violates row-level security policy');
    // A recusa devolve o valor do servidor: a tela não fica mentindo que salvou.
    await waitFor(() => expect(result.current.preferences.enabled).toBe(true));
  });

  it('sem sessão não consulta o banco', async () => {
    h.userId = null;
    const { result } = setup();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(h.ops.filter((o) => o.op === 'select')).toHaveLength(0);
    // sem sessão o default continua valendo (a tela não fica vazia)
    expect(result.current.preferences.enabled).toBe(true);
  });
});
