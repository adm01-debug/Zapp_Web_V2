/**
 * Testes de `src/hooks/crm/useExternalContact360Batch.ts` — o hook do "lote 360"
 * do CRM externo (uma chamada por conjunto de conversas, não uma por item).
 *
 * Como se prova aqui: o hook REAL é montado e a única coisa dublada é a
 * FRONTEIRA (`ExternalCRMService.getContact360Batch`, que por sua vez é
 * coberta em `src/services/__tests__/external-crm.service.test.ts`). O back-end
 * que o hook recebe é um `Map<phone, CRMBatchResult>` — a chave que a Edge usa
 * é o telefone já normalizado, então o `lookup` do hook tem de resolver tanto o
 * telefone com máscara quanto o mesmo número com e sem o DDI 55.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  getContact360Batch: vi.fn(),
  crmEnabled: true,
}));

vi.mock('@/services/crm/external-crm.service', () => ({
  ExternalCRMService: {
    getContact360Batch: (...args: unknown[]) => h.getContact360Batch(...args),
  },
}));

vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({
  useCRMIntegrationEnabled: () => h.crmEnabled,
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() })},
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }),
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }),
}));

import { useExternalContact360Batch } from '@/hooks/crm/useExternalContact360Batch';
import type { CRMBatchResult } from '@/hooks/crm/useExternalContact360Batch';

function wrapperCom(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function novoClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/** Linha do lote para um telefone (é o que a Edge devolve, indexado pelo número). */
function linha(company: string): CRMBatchResult {
  return {
    company_name: company,
    logo_url: null,
    vendedor_nome: null,
    cliente_ativado: true,
    total_pedidos: 2,
    valor_total_compras: 100,
    rfm_segment: null,
    rfm_score: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.crmEnabled = true;
  h.getContact360Batch.mockResolvedValue(new Map<string, CRMBatchResult>());
});

describe('useExternalContact360Batch — consulta do lote', () => {
  it('busca UMA vez o conjunto de conversas e expõe o retorno como batchData', async () => {
    const resultado = new Map<string, CRMBatchResult>([['5511999999999', linha('Acme')]]);
    h.getContact360Batch.mockResolvedValue(resultado);

    const contatos = [
      { id: 'c1', phone: '5511999999999' },
      { id: 'c2', phone: '5511888888888' },
    ];
    const { result } = renderHook(() => useExternalContact360Batch(contatos), { wrapper: wrapperCom(novoClient()) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(h.getContact360Batch).toHaveBeenCalledTimes(1);
    expect(h.getContact360Batch).toHaveBeenCalledWith(contatos);
    expect(result.current.batchData.get('5511999999999')?.company_name).toBe('Acme');
  });

  it('lookup resolve o mesmo número com máscara, com DDI 55 e sem ele', async () => {
    // A Edge indexa pelo número canônico COM o DDI.
    h.getContact360Batch.mockResolvedValue(new Map([['5511999999999', linha('Acme')]]));

    const { result } = renderHook(
      () => useExternalContact360Batch([{ id: 'c1', phone: '(11) 99999-9999' }]),
      { wrapper: wrapperCom(novoClient()) },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.lookup('5511999999999')?.company_name).toBe('Acme');
    expect(result.current.lookup('+55 11 99999-9999')?.company_name).toBe('Acme');
    expect(result.current.lookup('11999999999')?.company_name).toBe('Acme');
  });

  it('telefone que não veio no lote devolve undefined (não inventa empresa)', async () => {
    h.getContact360Batch.mockResolvedValue(new Map([['5511999999999', linha('Acme')]]));

    const { result } = renderHook(
      () => useExternalContact360Batch([{ id: 'c1', phone: '5511999999999' }]),
      { wrapper: wrapperCom(novoClient()) },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.lookup('5511977777777')).toBeUndefined();
  });

  it('lista vazia não vira chamada de rede: batchData fica vazio', async () => {
    const { result } = renderHook(() => useExternalContact360Batch([]), { wrapper: wrapperCom(novoClient()) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(h.getContact360Batch).not.toHaveBeenCalled();
    expect(result.current.batchData.size).toBe(0);
    expect(result.current.lookup('5511999999999')).toBeUndefined();
  });

  it('CRM desligado não consulta e marca isConfigured=false', async () => {
    h.crmEnabled = false;

    const { result } = renderHook(
      () => useExternalContact360Batch([{ id: 'c1', phone: '5511999999999' }]),
      { wrapper: wrapperCom(novoClient()) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(h.getContact360Batch).not.toHaveBeenCalled();
    expect(result.current.isConfigured).toBe(false);
    expect(result.current.batchData.size).toBe(0);
  });

  it('falha do serviço não deixa a tela presa: a consulta termina com lote vazio', async () => {
    h.getContact360Batch.mockRejectedValue(new Error('Todos os lotes de enriquecimento CRM falharam'));

    const { result } = renderHook(
      () => useExternalContact360Batch([{ id: 'c1', phone: '5511999999999' }]),
      { wrapper: wrapperCom(novoClient()) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(h.getContact360Batch).toHaveBeenCalledTimes(1);
    expect(result.current.batchData.size).toBe(0);
    expect(result.current.lookup('5511999999999')).toBeUndefined();
  });

  it('a chave da consulta independe da ordem: a mesma lista trocada de ordem não refaz a chamada', async () => {
    const qc = novoClient();
    const contatos = [
      { id: 'c1', phone: '5511999999999' },
      { id: 'c2', phone: '5511888888888' },
    ];
    const { result, rerender } = renderHook(
      ({ lista }: { lista: Array<{ id: string; phone: string }> }) => useExternalContact360Batch(lista),
      { wrapper: wrapperCom(qc), initialProps: { lista: contatos } },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(h.getContact360Batch).toHaveBeenCalledTimes(1);

    rerender({ lista: [contatos[1], contatos[0]] });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(h.getContact360Batch).toHaveBeenCalledTimes(1);
  });
});
