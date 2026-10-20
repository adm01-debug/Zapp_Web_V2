import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const crmEnabled = vi.hoisted(() => vi.fn(() => true));
const callCRMIntegration = vi.hoisted(() => vi.fn());
const useAuth = vi.hoisted(() => vi.fn(() => ({ user: { id: 'user-1' } })));

vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({ useCRMIntegrationEnabled: crmEnabled }));
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth }));
vi.mock('@/lib/crmIntegration', () => ({ callCRMIntegration }));

import { useEmailContactContext } from '../useEmailContactContext';

const input = { accountId: 'account-1', threadId: 'thread-1', contactId: 'contact-1' };
const context = {
  status: 'available',
  company: {
    id: 'company-1', name: 'Empresa', legalName: null, website: null, logoUrl: null,
    industry: null, location: null, about: null, relationships: [], relationshipsKnown: true,
    socials: [], socialsKnown: true, aboutKnown: true, updatedAt: null,
  },
  source: {
    linked: false, consultedAt: '2026-10-03T12:00:00.000Z',
    resolution: 'email_exact' as const, participantEmail: 'contact@example.test',
  },
};

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useEmailContactContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    crmEnabled.mockReturnValue(true);
    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    callCRMIntegration.mockResolvedValue({ data: context });
  });

  it('consulta o contexto com a identidade da thread e a escolha explícita', async () => {
    const { result } = renderHook(
      () => useEmailContactContext({ ...input, selectedExternalContactId: 'external-1' }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.status).toBe('available'));
    expect(callCRMIntegration).toHaveBeenCalledWith('emailContactContext', {
      ...input, selectedExternalContactId: 'external-1',
    });
  });

  it('mapeia o kill switch e a negação de visibilidade sem expor fallback', async () => {
    crmEnabled.mockReturnValue(false);
    const disabled = renderHook(() => useEmailContactContext(input), { wrapper });
    expect(disabled.result.current.status).toBe('disabled');
    expect(callCRMIntegration).not.toHaveBeenCalled();
    disabled.unmount();

    crmEnabled.mockReturnValue(true);
    callCRMIntegration.mockRejectedValue(new Error('Email contact context is not visible'));
    const denied = renderHook(() => useEmailContactContext(input), { wrapper });
    await waitFor(() => expect(denied.result.current.status).toBe('permission_denied'), { timeout: 3000 });
  });

  it('persiste o vínculo com a conta e a thread e invalida o contexto', async () => {
    const { result } = renderHook(() => useEmailContactContext(input), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('available'));
    await act(async () => { await result.current.linkCompany.mutateAsync('external-1'); });
    expect(callCRMIntegration).toHaveBeenCalledWith('linkEmailContactCompany', {
      accountId: 'account-1', threadId: 'thread-1', externalContactId: 'external-1',
    });
  });
});
