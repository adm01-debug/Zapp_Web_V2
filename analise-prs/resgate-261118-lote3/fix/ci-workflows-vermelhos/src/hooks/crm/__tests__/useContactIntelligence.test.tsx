import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Fronteira dublada: o gate do CRM (flag + build) e a chamada de rede à Edge.
const crmEnabled = vi.fn();
const callCRMIntegration = vi.fn();
const logError = vi.fn();

vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({ useCRMIntegrationEnabled: () => crmEnabled() }));
vi.mock('@/lib/crmIntegration', () => ({
  callCRMIntegration: (action: string, payload?: Record<string, unknown>) => callCRMIntegration(action, payload),
}));
vi.mock('@/lib/logger', () => ({ log: { error: (...a: unknown[]) => logError(...a) }, createLogger: () => ({ error: (...a: unknown[]) => logError(...a) }) }));

import { useContactIntelligence } from '../useContactIntelligence';

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function render(contactId: string | undefined) {
  return renderHook(() => useContactIntelligence(contactId), { wrapper: makeWrapper() });
}

describe('useContactIntelligence', () => {
  beforeEach(() => {
    crmEnabled.mockReset().mockReturnValue(true);
    callCRMIntegration.mockReset();
    logError.mockReset();
  });

  afterEach(() => vi.clearAllMocks());

  it('não chama a Edge quando a integração do CRM está desligada', () => {
    crmEnabled.mockReturnValue(false);
    const { result } = render('contato-1');

    expect(callCRMIntegration).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
  });

  it('não chama a Edge sem contato selecionado', () => {
    const { result } = render(undefined);

    expect(callCRMIntegration).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('busca a inteligência do contato e devolve os dados', async () => {
    const payload = { found: true, contact_id: 'contato-1', briefing: { contact_name: 'Ana' } };
    callCRMIntegration.mockResolvedValue({ data: payload });

    const { result } = render('contato-1');

    await waitFor(() => expect(result.current.data).toEqual(payload));
    expect(callCRMIntegration).toHaveBeenCalledWith('contactLookup', {
      contactId: 'contato-1',
      lookup: 'intelligence',
    });
  });

  it('devolve null e registra o erro quando a Edge falha', async () => {
    callCRMIntegration.mockRejectedValue(new Error('Edge fora do ar'));

    const { result } = render('contato-1');

    await waitFor(() => expect(callCRMIntegration).toHaveBeenCalled());
    await waitFor(() => expect(result.current.data).toBeNull());
    expect(logError).toHaveBeenCalledWith('Intelligence RPC error:', expect.any(Error));
  });
});
