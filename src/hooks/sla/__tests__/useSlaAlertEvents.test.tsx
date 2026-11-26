/**
 * Alertas de SLA — `useSlaAlertEvents`.
 *
 * O sujeito é o hook REAL; a dublagem é a fronteira de rede (`supabase.from`/`rpc`/`channel`).
 * Regras provadas: filtros de status/tipo/severidade chegando ao PostgREST, ordem e teto da leitura,
 * nome do contato resolvido em uma consulta só, linha fora do contrato descartada, resolução pelo
 * RPC `resolve_sla_alert` (mensagens de erro traduzidas) e canal de Realtime aberto/limpo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SlaAlertFilters } from '../useSlaAlertEvents';

const h = vi.hoisted(() => ({
  ops: [] as Array<{ table: string; op: string; payload?: unknown; filters: unknown[][] }>,
  tables: {} as Record<string, { data: unknown; error: unknown }>,
  rpcs: [] as Array<{ fn: string; args: unknown }>,
  rpcError: null as unknown,
  channels: [] as string[],
  removed: [] as unknown[],
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
      builder.order = (...a: unknown[]) => {
        entry.filters.push(['order', ...a]);
        return mesmo();
      };
      builder.limit = (...a: unknown[]) => {
        entry.filters.push(['limit', ...a]);
        return mesmo();
      };
      builder.eq = (...a: unknown[]) => {
        entry.filters.push(['eq', ...a]);
        return mesmo();
      };
      builder.is = (...a: unknown[]) => {
        entry.filters.push(['is', ...a]);
        return mesmo();
      };
      builder.not = (...a: unknown[]) => {
        entry.filters.push(['not', ...a]);
        return mesmo();
      };
      builder.in = (...a: unknown[]) => {
        entry.filters.push(['in', ...a]);
        return mesmo();
      };
      builder.then = (ok?: (v: unknown) => unknown, falhou?: (e: unknown) => unknown) =>
        Promise.resolve(h.tables[table] ?? { data: [], error: null }).then(ok, falhou);
      return builder;
    },
    rpc: (fn: string, args: unknown) => {
      h.rpcs.push({ fn, args });
      return Promise.resolve({ data: null, error: h.rpcError });
    },
    channel: (topic: string) => {
      h.channels.push(topic);
      const canal: Record<string, unknown> = {};
      canal.on = () => canal;
      canal.subscribe = () => canal;
      return canal;
    },
    removeChannel: (canal: unknown) => {
      h.removed.push(canal);
      return Promise.resolve('ok');
    },
  },
}));

import { fetchSlaAlertEvents, useSlaAlertEvents } from '../useSlaAlertEvents';
import { DEFAULT_SLA_ALERT_FILTERS } from '../useSlaAlertEvents';
import { toast } from 'sonner';

const toastMock = toast as unknown as {
  success: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
};

const evento = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  contact_id: 'c-1',
  alert_type: 'first_response',
  severity: 'breached',
  created_at: '2026-11-26T12:00:00.000Z',
  resolved_at: null,
  resolved_by: null,
  queue_id: null,
  ...extra,
});

function setup(filters: SlaAlertFilters = DEFAULT_SLA_ALERT_FILTERS) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return {
    ...renderHook(() => useSlaAlertEvents(filters), { wrapper }),
    queryClient,
    invalidateSpy,
  };
}

const filtrosDe = (table: string) =>
  h.ops.filter((o) => o.table === table).map((o) => o.filters);

beforeEach(() => {
  h.ops = [];
  h.tables = {};
  h.rpcs = [];
  h.rpcError = null;
  h.channels = [];
  h.removed = [];
  h.userId = 'u-1';
  toastMock.success.mockClear();
  toastMock.error.mockClear();
});

describe('fetchSlaAlertEvents', () => {
  it('padrão: só abertos, mais recentes primeiro, com teto de leitura', async () => {
    h.tables.sla_alert_events = { data: [evento('e1')], error: null };
    h.tables.contacts = { data: [{ id: 'c-1', name: 'Ana', phone: '+55 11 90000-0000' }], error: null };

    const alerts = await fetchSlaAlertEvents(DEFAULT_SLA_ALERT_FILTERS);

    const filtros = filtrosDe('sla_alert_events').flat();
    expect(filtros).toContainEqual(['is', 'resolved_at', null]);
    expect(filtros).toContainEqual(['order', 'created_at', { ascending: false }]);
    expect(filtros).toContainEqual(['limit', 100]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      id: 'e1',
      contactId: 'c-1',
      contactName: 'Ana',
      contactPhone: '+55 11 90000-0000',
      alertType: 'first_response',
      severity: 'breached',
    });
  });

  it('resolvidos + tipo + severidade viram filtro no servidor', async () => {
    h.tables.sla_alert_events = { data: [], error: null };

    await fetchSlaAlertEvents({ status: 'resolvidos', type: 'resolution', severity: 'warning' });

    const filtros = filtrosDe('sla_alert_events').flat();
    expect(filtros).toContainEqual(['not', 'resolved_at', 'is', null]);
    expect(filtros).toContainEqual(['eq', 'alert_type', 'resolution']);
    expect(filtros).toContainEqual(['eq', 'severity', 'warning']);
    expect(filtros).not.toContainEqual(['is', 'resolved_at', null]);
  });

  it('linha fora do contrato (tipo/severidade desconhecidos) é descartada', async () => {
    h.tables.sla_alert_events = {
      data: [evento('e1'), evento('e2', { alert_type: 'outro' }), evento('e3', { severity: 'critico' })],
      error: null,
    };
    h.tables.contacts = { data: [], error: null };

    const alerts = await fetchSlaAlertEvents(DEFAULT_SLA_ALERT_FILTERS);
    expect(alerts.map((a) => a.id)).toEqual(['e1']);
  });

  it('falha ao ler os contatos não apaga a lista (alerta sem nome)', async () => {
    h.tables.sla_alert_events = { data: [evento('e1')], error: null };
    h.tables.contacts = { data: null, error: { message: 'permission denied' } };

    const alerts = await fetchSlaAlertEvents(DEFAULT_SLA_ALERT_FILTERS);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].contactName).toBeNull();
  });

  it('erro da consulta de eventos sobe para a tela', async () => {
    h.tables.sla_alert_events = { data: null, error: { message: 'boom' } };
    await expect(fetchSlaAlertEvents(DEFAULT_SLA_ALERT_FILTERS)).rejects.toMatchObject({
      message: 'boom',
    });
  });
});

describe('useSlaAlertEvents', () => {
  it('abre e limpa o canal de Realtime dos alertas', async () => {
    h.tables.sla_alert_events = { data: [], error: null };
    const { unmount } = setup();

    await waitFor(() => expect(h.channels).toHaveLength(1));
    expect(h.channels[0]).toContain('sla-alert-events');

    unmount();
    await waitFor(() => expect(h.removed).toHaveLength(1));
  });

  it('resolve pelo RPC, avisa e invalida o cache', async () => {
    h.tables.sla_alert_events = { data: [evento('e1')], error: null };
    h.tables.contacts = { data: [{ id: 'c-1', name: 'Ana', phone: null }], error: null };
    const { result, invalidateSpy } = setup();

    await waitFor(() => expect(result.current.alerts).toHaveLength(1));
    act(() => result.current.resolve('e1'));

    await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
    expect(h.rpcs).toEqual([{ fn: 'resolve_sla_alert', args: { p_event_id: 'e1' } }]);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['sla-alert-events'] });
  });

  it('recusa do RPC vira mensagem de negócio (não o erro cru do banco)', async () => {
    h.tables.sla_alert_events = { data: [evento('e1')], error: null };
    h.tables.contacts = { data: [], error: null };
    const { result } = setup();
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));

    h.rpcError = { message: 'somente_staff_resolve_alerta' };
    act(() => result.current.resolve('e1'));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(toastMock.error).toHaveBeenCalledWith('Só a supervisão pode resolver um alerta de SLA');
  });

  it('sem sessão não consulta o banco', async () => {
    h.userId = null;
    const { result } = setup();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(h.ops).toHaveLength(0);
    expect(result.current.alerts).toEqual([]);
  });
});
