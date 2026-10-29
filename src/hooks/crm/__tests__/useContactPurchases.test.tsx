/**
 * Paridade V3 -> V2 (doc 06) — compras do contato: contrato de ERRO do hook.
 *
 * `useContactPurchases` é casca fina sobre `contact_purchases`, mas o erro do banco
 * precisa SUBIR (a RLS de `contact_purchases` nega quem não enxerga o contato — ver
 * `supabase/tests/`, item PK-15); engolir o erro faria a tela mostrar "sem compras"
 * quando na verdade foi proibido. Este teste prende: erro -> a query rejeita;
 * sucesso -> devolve as linhas na ordem do banco; `contactId` vazio -> não busca.
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const order = vi.fn();
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { order, eq, select, from };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mocks.from },
}));

import { useContactPurchases, contactPurchasesKey } from '@/hooks/crm/useContactPurchases';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
    {children}
  </QueryClientProvider>
);

const LINHAS = [
  { id: 'p2', title: 'B', created_at: '2026-10-11T12:00:00.000Z' },
  { id: 'p1', title: 'A', created_at: '2026-10-10T12:00:00.000Z' },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.order.mockResolvedValue({ data: LINHAS, error: null });
});

describe('useContactPurchases — leitura das compras do contato', () => {
  it('busca por contact_id, ordena por created_at desc e devolve as linhas', async () => {
    const { result } = renderHook(() => useContactPurchases('c1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mocks.from).toHaveBeenCalledWith('contact_purchases');
    expect(mocks.select).toHaveBeenCalledWith('*');
    expect(mocks.eq).toHaveBeenCalledWith('contact_id', 'c1');
    expect(mocks.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(result.current.data?.map((p) => p.id)).toEqual(['p2', 'p1']);
  });

  it('erro do banco (ex.: RLS negando) rejeita a query em vez de virar lista vazia', async () => {
    mocks.order.mockResolvedValue({
      data: null,
      error: { message: 'permission denied for table contact_purchases', code: '42501' },
    });

    const { result } = renderHook(() => useContactPurchases('c1'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toContain('permission denied');
    expect(result.current.data).toBeUndefined();
  });

  it('contactId vazio mantém a query desligada (não chama o banco)', () => {
    const { result } = renderHook(() => useContactPurchases(''), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mocks.from).not.toHaveBeenCalled();
    expect(contactPurchasesKey('c1')).toEqual(['contact-purchases', 'c1']);
  });
});
