/**
 * Paridade V3 -> doc 06 (L5) — compras do contato: a GRAVAÇÃO não engole o erro.
 * No erro do insert o usuário vê o toast pt-BR, o erro é logado e a mutation
 * rejeita — por isso quem chama só fecha/limpa o formulário no sucesso, e no
 * erro os dados digitados permanecem. No sucesso, as duas consultas são
 * invalidadas (a lista do painel e o card 360 do contato).
 */
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  toastError: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(() => ({ insert: mocks.insert })) },
}));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));
vi.mock('@/lib/logger', () => ({ log: { error: mocks.logError, info: vi.fn(), warn: vi.fn() } ,
  getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
  createLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
}));

import { useCreateContactPurchase } from '@/hooks/crm/useContactPurchases';

const REGISTRO = {
  contactId: 'c1',
  title: '  Caneca  ',
  amount: 25.5,
  purchaseType: 'purchase',
  profileId: 'p1',
} as const;

let qc: QueryClient;
let invalidar: ReturnType<typeof vi.spyOn>;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  invalidar = vi.spyOn(qc, 'invalidateQueries');
});

describe('useCreateContactPurchase — gravação das compras do contato', () => {
  it('erro do insert vira toast pt-BR e a mutation rejeita (os dados digitados ficam)', async () => {
    const erro = { message: 'permission denied for table contact_purchases', code: '42501' };
    mocks.insert.mockResolvedValue({ error: erro });

    const { result } = renderHook(() => useCreateContactPurchase(), { wrapper });
    let rejeitou = false;
    await act(async () => {
      try {
        await result.current.mutateAsync(REGISTRO);
      } catch {
        rejeitou = true;
      }
    });

    expect(mocks.insert).toHaveBeenCalledWith({
      contact_id: 'c1',
      title: 'Caneca',
      amount: 25.5,
      purchase_type: 'purchase',
      created_by: 'p1',
    });
    expect(mocks.toastError).toHaveBeenCalledWith('Não foi possível registrar. Tente novamente.');
    expect(mocks.logError).toHaveBeenCalled();
    expect(invalidar).not.toHaveBeenCalled();
    expect(rejeitou).toBe(true);
  });

  it('sucesso invalida a lista do painel e o card 360, sem toast de erro', async () => {
    mocks.insert.mockResolvedValue({ error: null });

    const { result } = renderHook(() => useCreateContactPurchase(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(REGISTRO);
    });

    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['contact-crm-360', 'c1'] });
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['contact-purchases', 'c1'] });
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('profileId ausente grava created_by nulo', async () => {
    mocks.insert.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useCreateContactPurchase(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ ...REGISTRO, profileId: null });
    });
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ created_by: null }));
  });
});