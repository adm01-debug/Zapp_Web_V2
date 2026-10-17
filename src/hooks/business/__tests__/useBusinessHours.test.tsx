/**
 * Horário comercial da conexão — `useBusinessHours`.
 *
 * O sujeito é o hook REAL; a dublagem é só a fronteira de rede (`supabase`),
 * que grava operação/payload/filtros e responde o que o teste manda. Prova o
 * que o hook pede ao banco (UMA chamada atômica da RPC `save_business_hours`,
 * sem upsert dia a dia), o padrão honesto quando não há linha (domingo fechado),
 * a invalidação do cache e o que ele faz quando a gravação é recusada.
 *
 * Cartão: falta teste do hook de horário na V2.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  ops: [] as Array<{
    table: string;
    op: string;
    payload?: unknown;
    options?: unknown;
    filters: unknown[][];
  }>,
  rpcs: [] as Array<{ fn: string; args: unknown }>,
  hours: [] as unknown[],
  away: null as unknown,
  selectError: null as { message: string } | null,
  upsertError: null as { message: string } | null,
  rpcError: null as { message: string } | null,
  upsertGate: null as null | { promise: Promise<void>; release: () => void },
  toast: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: h.toast }));
vi.mock('@/lib/logger', () => ({ log: { error: h.logError } }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args: unknown) => {
      h.rpcs.push({ fn, args });
      return Promise.resolve({ data: null, error: h.rpcError });
    },
    from: (table: string) => {
      const entry = {
        table,
        op: 'select',
        payload: undefined as unknown,
        options: undefined as unknown,
        filters: [] as unknown[][],
      };
      h.ops.push(entry);
      const builder = {
        select: () => builder,
        eq: (...args: unknown[]) => {
          entry.filters.push(['eq', ...args]);
          return builder;
        },
        order: (...args: unknown[]) => {
          entry.filters.push(['order', ...args]);
          return builder;
        },
        maybeSingle: () =>
          Promise.resolve({ data: table === 'away_messages' ? h.away : null, error: h.selectError }),
        upsert: (payload: unknown, options: unknown) => {
          entry.op = 'upsert';
          entry.payload = payload;
          entry.options = options;
          return builder;
        },
        then: (resolve: (value: unknown) => void) => {
          if (entry.op === 'upsert') {
            if (h.upsertGate) {
              return h.upsertGate.promise.then(() => resolve({ error: h.upsertError }));
            }
            return resolve({ error: h.upsertError });
          }
          const data = table === 'business_hours' ? h.hours : h.away;
          resolve({ data, error: h.selectError });
        },
      };
      return builder;
    },
  },
}));

import { useBusinessHours, type BusinessHour, type AwayMessage } from '../useBusinessHours';

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(() => useBusinessHours('conn-1'), { wrapper });
  return { ...rendered, invalidate };
}

const DIAS = [
  { day_of_week: 0, is_open: true, open_time: '08:00', close_time: '12:00' },
  { day_of_week: 1, is_open: true, open_time: '08:00', close_time: '12:00' },
  { day_of_week: 2, is_open: true, open_time: '08:00', close_time: '12:00' },
  { day_of_week: 3, is_open: true, open_time: '08:00', close_time: '12:00' },
  { day_of_week: 4, is_open: true, open_time: '08:00', close_time: '12:00' },
  { day_of_week: 5, is_open: true, open_time: '08:00', close_time: '12:00' },
  { day_of_week: 6, is_open: false, open_time: '08:00', close_time: '12:00' },
] satisfies Omit<BusinessHour, 'whatsapp_connection_id'>[];

beforeEach(() => {
  vi.clearAllMocks();
  h.ops = [];
  h.rpcs = [];
  h.hours = [];
  h.away = null;
  h.selectError = null;
  h.upsertError = null;
  h.rpcError = null;
  h.upsertGate = null;
});

describe('useBusinessHours — leitura', () => {
  it('sem linha no banco devolve o padrão honesto: 7 dias, domingo e sábado fechados', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.businessHours).toHaveLength(7);
    const dom = result.current.businessHours.find((d) => d.day_of_week === 0);
    const seg = result.current.businessHours.find((d) => d.day_of_week === 1);
    const sab = result.current.businessHours.find((d) => d.day_of_week === 6);
    expect(dom).toMatchObject({ is_open: false, whatsapp_connection_id: 'conn-1' });
    expect(seg).toMatchObject({ is_open: true, open_time: '09:00', close_time: '18:00' });
    // O título do teste promete "domingo e sábado": o sábado tem de ser conferido.
    expect(sab).toMatchObject({ is_open: false, whatsapp_connection_id: 'conn-1' });
    expect(result.current.awayMessage).toMatchObject({
      is_enabled: true,
      whatsapp_connection_id: 'conn-1',
    });
  });

  it('pede os dias na ordem e filtra pela conexão', async () => {
    setup();
    await waitFor(() =>
      expect(h.ops.some((o) => o.table === 'business_hours' && o.filters.length >= 2)).toBe(true),
    );
    const leitura = h.ops.find((o) => o.table === 'business_hours')!;
    expect(leitura.filters).toContainEqual(['eq', 'whatsapp_connection_id', 'conn-1']);
    expect(leitura.filters).toContainEqual(['order', 'day_of_week']);
  });

  it('devolve o horário gravado quando já existe linha', async () => {
    h.hours = DIAS.map((d) => ({ ...d, id: `bh-${d.day_of_week}`, whatsapp_connection_id: 'conn-1' }));
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.businessHours).toHaveLength(7);
    expect(result.current.businessHours[0]).toMatchObject({ is_open: true, open_time: '08:00' });
    expect(result.current.businessHours[6]).toMatchObject({ is_open: false });
  });
});

describe('useBusinessHours — gravação', () => {
  // ---------------------------------------------------------------------------
  // Salvar horário é UMA chamada atômica da RPC `save_business_hours`. O laço de
  // upsert dia a dia saiu: uma falha no 5º dia deixava 4 gravados e 3 não.
  // ---------------------------------------------------------------------------
  it('salva a semana em UMA chamada da RPC save_business_hours (sem upsert dia a dia)', async () => {
    const { result, invalidate } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const horas: BusinessHour[] = DIAS.map((d) => ({ ...d, whatsapp_connection_id: 'conn-1' }));

    await act(async () => {
      await result.current.saveSettings(horas);
    });

    expect(h.rpcs).toHaveLength(1);
    expect(h.rpcs[0].fn).toBe('save_business_hours');
    expect(h.rpcs[0].args).toEqual({
      p_connection_id: 'conn-1',
      p_days: DIAS.map((d) => ({
        day_of_week: d.day_of_week,
        is_open: d.is_open,
        open_time: d.open_time,
        close_time: d.close_time,
      })),
    });
    // Nada de upsert dia a dia em `business_hours`: o horário foi pela RPC.
    const dias = h.ops.filter((o) => o.op === 'upsert' && o.table === 'business_hours');
    expect(dias).toHaveLength(0);

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['business-hours', 'conn-1'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['away-message', 'conn-1'] });
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Configurações salvas' }),
    );
  });

  it('sem `away`, não cria away_messages (a tela de horário não cria a ausência sozinha)', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const horas: BusinessHour[] = DIAS.map((d) => ({ ...d, whatsapp_connection_id: 'conn-1' }));

    await act(async () => {
      await result.current.saveSettings(horas);
    });

    // O horário foi pela RPC; `away_messages` só aparece na LEITURA do hook.
    expect(h.rpcs).toHaveLength(1);
    const escritasAusencia = h.ops.filter((o) => o.op === 'upsert' && o.table === 'away_messages');
    expect(escritasAusencia).toHaveLength(0);
  });

  it('com `away` explícito, grava a mensagem de ausência em ação separada', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const horas: BusinessHour[] = DIAS.map((d) => ({ ...d, whatsapp_connection_id: 'conn-1' }));
    const away: AwayMessage = { whatsapp_connection_id: 'conn-1', content: 'Voltamos já', is_enabled: false };

    await act(async () => {
      await result.current.saveSettings(horas, away);
    });

    // O horário continua indo pela RPC (1 chamada); a ausência é a única escrita avulsa.
    expect(h.rpcs).toHaveLength(1);
    expect(h.rpcs[0].fn).toBe('save_business_hours');
    const dias = h.ops.filter((o) => o.op === 'upsert' && o.table === 'business_hours');
    expect(dias).toHaveLength(0);
    const mensagem = h.ops.find((o) => o.op === 'upsert' && o.table === 'away_messages')!;
    expect(mensagem.payload).toEqual({
      whatsapp_connection_id: 'conn-1',
      content: 'Voltamos já',
      is_enabled: false,
    });
    expect(mensagem.options).toEqual({ onConflict: 'whatsapp_connection_id' });
  });

  it('falha da RPC não grava metade da semana (rejeita e não escreve nada)', async () => {
    h.rpcError = { message: 'intervalo_invalido' };
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const horas: BusinessHour[] = DIAS.map((d) => ({ ...d, whatsapp_connection_id: 'conn-1' }));

    await act(async () => {
      await expect(result.current.saveSettings(horas)).rejects.toMatchObject({
        message: 'intervalo_invalido',
      });
    });

    expect(h.rpcs).toHaveLength(1);
    const upserts = h.ops.filter((o) => o.op === 'upsert');
    expect(upserts).toHaveLength(0);
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Erro ao salvar', variant: 'destructive' }),
    );
    expect(h.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Configurações salvas' }));
    expect(h.logError).toHaveBeenCalled();
  });
});
