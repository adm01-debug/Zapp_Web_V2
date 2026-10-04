import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const crmEnabled = vi.hoisted(() => vi.fn(() => true));
const getContactSidebar = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({
  useCRMIntegrationEnabled: crmEnabled,
}));
vi.mock('@/services/crm/external-crm.service', () => ({
  ExternalCRMService: { getContactSidebar },
}));

import { useContactSidebar } from '../useContactSidebar';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const CONTACT_ID = '11111111-2222-3333-4444-555555555555';

describe('useContactSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    crmEnabled.mockReturnValue(true);
    getContactSidebar.mockResolvedValue(null);
  });

  it('status disabled quando a flag crm.integration está desligada', async () => {
    crmEnabled.mockReturnValue(false);
    const { result } = renderHook(() => useContactSidebar(CONTACT_ID), { wrapper });
    expect(result.current.status).toBe('disabled');
    await new Promise((r) => setTimeout(r, 20));
    expect(getContactSidebar).not.toHaveBeenCalled();
  });

  it('status loading enquanto a query está pendente', () => {
    getContactSidebar.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useContactSidebar(CONTACT_ID), { wrapper });
    expect(result.current.status).toBe('loading');
  });

  it('status not_found quando a RPC devolve found:false ou null', async () => {
    getContactSidebar.mockResolvedValue({ found: false });
    const { result } = renderHook(() => useContactSidebar(CONTACT_ID), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('not_found'));
  });

  it('status error quando a chamada falha', async () => {
    getContactSidebar.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useContactSidebar(CONTACT_ID), { wrapper });
    // o hook tem retry:1 — o estado vira 'error' só depois da segunda tentativa
    await waitFor(() => expect(result.current.status).toBe('error'), { timeout: 4000 });
  });

  it('status ok com dados quando found:true', async () => {
    getContactSidebar.mockResolvedValue({
      found: true,
      contact_id: 'crm-1',
      professional: { whatsapp: { display: '+55 11 99999-9999' } },
    });
    const { result } = renderHook(() => useContactSidebar(CONTACT_ID), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ok'));
    expect(result.current.data?.contact_id).toBe('crm-1');
  });

  it('sem contactId não dispara a query e reporta disabled (nunca loader eterno)', async () => {
    const { result } = renderHook(() => useContactSidebar(undefined), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(getContactSidebar).not.toHaveBeenCalled();
    expect(result.current.status).toBe('disabled');
  });
});
