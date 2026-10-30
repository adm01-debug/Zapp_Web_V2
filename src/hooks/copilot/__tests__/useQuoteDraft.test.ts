/**
 * CV-086 — testes do hook useQuoteDraft.
 */
import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useQuoteDraft } from '../useQuoteDraft';

const BASE_ITEMS = [
  { description: 'Caneta personalizada', quantity: 100, unitPrice: 3.5 },
  { description: 'Caneca cerâmica', quantity: 50, unitPrice: 12.0 },
];

describe('useQuoteDraft', () => {
  it('calcula totalValue corretamente', () => {
    const { result } = renderHook(() =>
      useQuoteDraft({
        clientName: 'Empresa ABC',
        items: BASE_ITEMS,
        deliveryDays: 10,
        paymentTerms: '50% entrada + 50% entrega',
      }),
    );
    expect(result.current.totalValue).toBe(100 * 3.5 + 50 * 12.0);
  });

  it('draft está ready com dados completos', () => {
    const { result } = renderHook(() =>
      useQuoteDraft({
        clientName: 'Empresa ABC',
        items: BASE_ITEMS,
        deliveryDays: 10,
        paymentTerms: 'à vista',
      }),
    );
    expect(result.current.ready).toBe(true);
  });

  it('draft não está ready com items vazio', () => {
    const { result } = renderHook(() =>
      useQuoteDraft({
        clientName: 'Empresa ABC',
        items: [],
        deliveryDays: 10,
        paymentTerms: 'à vista',
      }),
    );
    expect(result.current.ready).toBe(false);
  });

  it('textSummary contém o nome do cliente', () => {
    const { result } = renderHook(() =>
      useQuoteDraft({
        clientName: 'Empresa XYZ',
        items: BASE_ITEMS,
        deliveryDays: 7,
        paymentTerms: '30 dias',
      }),
    );
    expect(result.current.textSummary).toContain('Empresa XYZ');
  });

  it('validade é 5 dias', () => {
    const { result } = renderHook(() =>
      useQuoteDraft({
        clientName: 'Teste',
        items: BASE_ITEMS,
        deliveryDays: 10,
        paymentTerms: 'boleto',
      }),
    );
    expect(result.current.validity).toBe(5);
  });
});
