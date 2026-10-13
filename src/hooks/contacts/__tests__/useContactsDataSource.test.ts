import { createElement, type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * RD-012 — estado da origem dos dados do módulo Contatos.
 *
 * O hook é exercitado de verdade: só o portão da integração (`crm.integration`)
 * e o lote de CRM do Singu (a fonte do dado, o MESMO serviço que o
 * `realAdapter` do CT-002 usa) são trocados. O hook não faz requisição: ele lê
 * o estado da consulta que o módulo já dispara — por isso os casos montam o
 * hook do módulo (`useExternalContact360Batch`) junto e contam as chamadas.
 */

const crmEnabled = vi.hoisted(() => vi.fn(() => true));
const getContact360Batch = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({
  useCRMIntegrationEnabled: crmEnabled,
}));
vi.mock('@/services/crm/external-crm.service', () => ({
  ExternalCRMService: { getContact360Batch },
}));

import { useExternalContact360Batch } from '@/hooks/crm/useExternalContact360Batch';
import { useContactsDataSource } from '../useContactsDataSource';

const CONTATOS = [{ id: 'contato-1', phone: '+5511999999999' }];

/** Cliente por teste (já com o cliente em mãos para provocar um refetch). */
function criarAmbiente() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}

describe('useContactsDataSource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    crmEnabled.mockReturnValue(true);
    getContact360Batch.mockResolvedValue(new Map());
  });

  it("fonte 'zapp' com a ligação do Singu desligada", async () => {
    crmEnabled.mockReturnValue(false);
    const { wrapper } = criarAmbiente();
    const { result } = renderHook(
      () => ({ estado: useContactsDataSource(), lote: useExternalContact360Batch(CONTATOS) }),
      { wrapper },
    );

    expect(result.current.estado).toEqual({ fonte: 'zapp', carregando: false });
    await new Promise((r) => setTimeout(r, 20));
    expect(getContact360Batch).not.toHaveBeenCalled();
  });

  it("fonte 'singu' quando a ligação está ativa e o Singu respondeu", async () => {
    const { wrapper } = criarAmbiente();
    const { result } = renderHook(
      () => ({ estado: useContactsDataSource(), lote: useExternalContact360Batch(CONTATOS) }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.estado.carregando).toBe(false));
    expect(result.current.estado).toEqual({ fonte: 'singu', carregando: false });
    expect(getContact360Batch).toHaveBeenCalledTimes(1);
  });

  it("carregando enquanto o Singu ainda não respondeu", () => {
    getContact360Batch.mockReturnValue(new Promise(() => {}));
    const { wrapper } = criarAmbiente();
    const { result } = renderHook(
      () => ({ estado: useContactsDataSource(), lote: useExternalContact360Batch(CONTATOS) }),
      { wrapper },
    );

    expect(result.current.estado).toEqual({ fonte: 'singu', carregando: true });
  });

  it("fonte 'indisponivel' quando a consulta ao Singu falha", async () => {
    getContact360Batch.mockRejectedValue(new Error('Singu fora do ar'));
    const { wrapper } = criarAmbiente();
    const { result } = renderHook(
      () => ({ estado: useContactsDataSource(), lote: useExternalContact360Batch(CONTATOS) }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.estado.fonte).toBe('indisponivel'));
    expect(result.current.estado).toEqual({ fonte: 'indisponivel', carregando: false });
  });

  it("volta para 'singu' quando o Singu responde de novo (aviso não fica preso)", async () => {
    getContact360Batch.mockRejectedValueOnce(new Error('Singu fora do ar'));
    const { client, wrapper } = criarAmbiente();
    const { result } = renderHook(
      () => ({ estado: useContactsDataSource(), lote: useExternalContact360Batch(CONTATOS) }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.estado.fonte).toBe('indisponivel'));

    getContact360Batch.mockResolvedValue(new Map());
    await client.refetchQueries({ queryKey: ['external-contact-360-batch'] });

    await waitFor(() => expect(result.current.estado.fonte).toBe('singu'));
    expect(result.current.estado.carregando).toBe(false);
  });

  it('não faz requisição nova: sozinho, não chama o lote de CRM', async () => {
    const { wrapper } = criarAmbiente();
    const { result } = renderHook(() => useContactsDataSource(), { wrapper });

    await new Promise((r) => setTimeout(r, 20));
    expect(getContact360Batch).not.toHaveBeenCalled();
    expect(result.current).toEqual({ fonte: 'singu', carregando: false });
  });
});
