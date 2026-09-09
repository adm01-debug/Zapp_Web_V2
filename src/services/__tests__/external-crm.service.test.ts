import { beforeEach, describe, expect, it, vi } from 'vitest';

const callCRMIntegration = vi.hoisted(() => vi.fn());

vi.mock('@/lib/crmIntegration', () => ({ callCRMIntegration }));
vi.mock('@/lib/externalProxy', () => ({ queryExternalProxy: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { ExternalCRMService } from '@/services/crm/external-crm.service';

describe('ExternalCRMService.getContact360Batch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('chunks more than 100 contacts without dropping enrichment', async () => {
    callCRMIntegration.mockImplementation(async (_action, payload) => {
      const ids = payload.contactIds as string[];
      return { data: Object.fromEntries(ids.map((id) => [`55${id.slice(1)}`, { id }])) };
    });
    const contacts = Array.from({ length: 205 }, (_, index) => ({
      id: `c${String(index).padStart(4, '0')}`,
      phone: `55${String(index).padStart(9, '0')}`,
    }));

    const result = await ExternalCRMService.getContact360Batch(contacts);

    expect(callCRMIntegration).toHaveBeenCalledTimes(3);
    expect(callCRMIntegration.mock.calls.map(([, payload]) => payload.contactIds.length).sort((a, b) => b - a))
      .toEqual([100, 100, 5]);
    expect(result.size).toBeGreaterThanOrEqual(205);
  });

  it('keeps successful chunks when one chunk fails', async () => {
    let call = 0;
    callCRMIntegration.mockImplementation(async () => {
      call += 1;
      if (call === 1) throw new Error('temporary failure');
      return { data: { '5511999999999': { company_name: 'OK' } } };
    });
    const contacts = Array.from({ length: 101 }, (_, index) => ({ id: `c${index}`, phone: `5511${index}` }));

    const result = await ExternalCRMService.getContact360Batch(contacts);
    expect(result.get('5511999999999')).toEqual({ company_name: 'OK' });
  });

  it('fails observably when every chunk fails', async () => {
    callCRMIntegration.mockRejectedValue(new Error('offline'));
    await expect(ExternalCRMService.getContact360Batch([{ id: 'c1', phone: '5511999999999' }]))
      .rejects.toThrow('Todos os lotes');
  });
});
