import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

import { callCRMIntegration } from '@/lib/crmIntegration';

describe('callCRMIntegration', () => {
  beforeEach(() => invoke.mockReset());

  it('forces the selected action even if payload attempts to override it', async () => {
    invoke.mockResolvedValue({ data: { data: [] }, error: null });
    await callCRMIntegration('select', { action: 'mutate', table: 'companies' });
    expect(invoke).toHaveBeenCalledWith('crm-integration', {
      body: { action: 'select', table: 'companies' },
    });
  });

  it('returns a valid gateway response', async () => {
    invoke.mockResolvedValue({ data: { data: { found: false }, meta: { record_count: 1 } }, error: null });
    await expect(callCRMIntegration<{ found: boolean }>('rpc', { rpc: 'get_contact_360_by_phone' }))
      .resolves.toMatchObject({ data: { found: false } });
  });

  it('rejects transport, domain and malformed responses', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { message: 'network down' } });
    await expect(callCRMIntegration('rpc')).rejects.toThrow('network down');
    invoke.mockResolvedValueOnce({ data: { error: 'Forbidden' }, error: null });
    await expect(callCRMIntegration('rpc')).rejects.toThrow('Forbidden');
    invoke.mockResolvedValueOnce({ data: null, error: null });
    await expect(callCRMIntegration('rpc')).rejects.toThrow('invalid response');
    invoke.mockResolvedValueOnce({ data: { meta: {} }, error: null });
    await expect(callCRMIntegration('rpc')).rejects.toThrow('no data');
  });

  it('preserves a bounded domain error returned by the Edge Function', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { message: 'Edge Function returned a non-2xx status code', context: new Response(JSON.stringify({ error: 'Forbidden' })) },
    });
    await expect(callCRMIntegration('rpc')).rejects.toThrow('Forbidden');
  });
});
