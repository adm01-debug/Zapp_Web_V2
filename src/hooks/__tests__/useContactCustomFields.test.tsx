/**
 * `useContactCustomFields` — campos personalizados do contato.
 *
 * O hook real + o `ContactService` real; a única dublagem é a fronteira de rede
 * (`supabase.from`). O que se prova: o UUID do contato é validado antes de tocar o banco,
 * um erro do banco NÃO vira lista vazia em cache, e as mutações invalidam a consulta.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  selectChamadas: 0,
  upsertPayloads: [] as Record<string, unknown>[],
  deleteIds: [] as string[],
  rows: [] as Record<string, unknown>[],
  error: null as null | { message: string },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => mocks.from(...args) },
}));
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { log } from '@/lib/logger';
import { useContactCustomFields } from '@/hooks/crm/useContactCustomFields';

/** UUID válido — o hook só consulta o banco com id nesse formato. */
const CONTATO = '11111111-2222-4333-8444-555555555555';

function wrapperDe(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function novoQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.selectChamadas = 0;
  mocks.upsertPayloads = [];
  mocks.deleteIds = [];
  mocks.rows = [{ id: 'cf1', contact_id: CONTATO, field_name: 'CPF', field_value: '123', field_type: 'text' }];
  mocks.error = null;

  mocks.from.mockImplementation(() => ({
    select: () => {
      mocks.selectChamadas += 1;
      return {
        eq: () => ({ order: async () => ({ data: mocks.rows, error: mocks.error }) }),
      };
    },
    upsert: async (payload: Record<string, unknown>) => {
      mocks.upsertPayloads.push(payload);
      return { error: mocks.error };
    },
    delete: () => ({
      eq: async (coluna: string, valor: string) => {
        mocks.deleteIds.push(`${coluna}=${valor}`);
        return { error: mocks.error };
      },
    }),
  }));
});

describe('useContactCustomFields — leitura', () => {
  it('busca os campos do contato e devolve as linhas', async () => {
    const { result } = renderHook(() => useContactCustomFields(CONTATO), { wrapper: wrapperDe(novoQueryClient()) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.from).toHaveBeenCalledWith('contact_custom_fields');
    expect(result.current.fields).toEqual([
      { id: 'cf1', contact_id: CONTATO, field_name: 'CPF', field_value: '123', field_type: 'text' },
    ]);
  });

  it('contact_id que não é UUID não consulta o banco nem fica carregando', () => {
    const { result } = renderHook(() => useContactCustomFields('novo-contato'), { wrapper: wrapperDe(novoQueryClient()) });

    expect(result.current.fields).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('contactId undefined não consulta o banco', () => {
    const { result } = renderHook(() => useContactCustomFields(undefined), { wrapper: wrapperDe(novoQueryClient()) });

    expect(result.current.fields).toEqual([]);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('expõe addField, removeField e refetch', () => {
    const { result } = renderHook(() => useContactCustomFields(CONTATO), { wrapper: wrapperDe(novoQueryClient()) });

    expect(typeof result.current.addField).toBe('function');
    expect(typeof result.current.removeField).toBe('function');
    expect(typeof result.current.refetch).toBe('function');
  });

  it('erro do banco sobe para a query em vez de virar lista vazia em cache', async () => {
    mocks.error = { message: 'RLS' };
    const qc = novoQueryClient();
    const { result } = renderHook(() => useContactCustomFields(CONTATO), { wrapper: wrapperDe(qc) });

    await waitFor(() => expect(log.error).toHaveBeenCalled());
    expect(result.current.fields).toEqual([]);
    // A consulta ficou em erro: um `return []` a teria marcado como sucesso e a lista
    // vazia ficaria em cache pelo staleTime.
    await waitFor(() => {
      const consulta = qc.getQueryCache().getAll().find((q) => q.queryKey[0] === 'contact-custom-fields');
      expect(consulta?.state.status).toBe('error');
    });
  });
});

describe('useContactCustomFields — mutações invalidam a lista', () => {
  it('addField grava o campo e reconsulta', async () => {
    const { result } = renderHook(() => useContactCustomFields(CONTATO), { wrapper: wrapperDe(novoQueryClient()) });
    await waitFor(() => expect(mocks.selectChamadas).toBe(1));

    await act(async () => {
      await result.current.addField('CPF', '999');
    });

    expect(mocks.upsertPayloads).toEqual([
      { contact_id: CONTATO, field_name: 'CPF', field_value: '999', field_type: 'text' },
    ]);
    await waitFor(() => expect(mocks.selectChamadas).toBeGreaterThan(1));
  });

  it('addField com id inválido não vai ao banco', async () => {
    const { result } = renderHook(() => useContactCustomFields('novo-contato'), { wrapper: wrapperDe(novoQueryClient()) });

    await act(async () => {
      await result.current.addField('CPF', '999');
    });

    expect(mocks.upsertPayloads).toEqual([]);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('removeField apaga pelo id e reconsulta', async () => {
    const { result } = renderHook(() => useContactCustomFields(CONTATO), { wrapper: wrapperDe(novoQueryClient()) });
    await waitFor(() => expect(mocks.selectChamadas).toBe(1));

    await act(async () => {
      await result.current.removeField('cf1');
    });

    expect(mocks.deleteIds).toEqual(['id=cf1']);
    await waitFor(() => expect(mocks.selectChamadas).toBeGreaterThan(1));
  });

  it('falha no addField sobe pelo throw (o chamador trata)', async () => {
    mocks.error = { message: 'RLS' };
    const { result } = renderHook(() => useContactCustomFields(CONTATO), { wrapper: wrapperDe(novoQueryClient()) });

    await expect(result.current.addField('CPF', '999')).rejects.toBeTruthy();
  });
});
