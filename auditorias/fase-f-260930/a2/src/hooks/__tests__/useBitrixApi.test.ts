// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mockFunctionsInvoke = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: any[]) => mockFunctionsInvoke(...args) },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { useBitrixApi } from '@/hooks/integrations/useBitrixApi';

describe('useBitrixApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFunctionsInvoke.mockResolvedValue({ data: { success: true }, error: null });
  });

  it('initializes with loading false', () => {
    const { result } = renderHook(() => useBitrixApi());
    expect(result.current.loading).toBe(false);
  });

  it('initializes with error null', () => {
    const { result } = renderHook(() => useBitrixApi());
    expect(result.current.error).toBeNull();
  });

  // Lead operations
  it('exposes listLeads function', () => {
    const { result } = renderHook(() => useBitrixApi());
    expect(typeof result.current.listLeads).toBe('function');
  });

  it('exposes getLead function', () => {
    const { result } = renderHook(() => useBitrixApi());
    expect(typeof result.current.getLead).toBe('function');
  });

  it('exposes createLead function', () => {
    const { result } = renderHook(() => useBitrixApi());
    expect(typeof result.current.createLead).toBe('function');
  });

  it('exposes updateLead function', () => {
    const { result } = renderHook(() => useBitrixApi());
    expect(typeof result.current.updateLead).toBe('function');
  });

  it('exposes deleteLead function', () => {
    const { result } = renderHook(() => useBitrixApi());
    expect(typeof result.current.deleteLead).toBe('function');
  });

  // Contact operations
  it('exposes listContacts function', () => {
    const { result } = renderHook(() => useBitrixApi());
    expect(typeof result.current.listContacts).toBe('function');
  });

  it('exposes getContact function', () => {
    const { result } = renderHook(() => useBitrixApi());
    expect(typeof result.current.getContact).toBe('function');
  });

  it('exposes createContact function', () => {
    const { result } = renderHook(() => useBitrixApi());
    expect(typeof result.current.createContact).toBe('function');
  });

  // Deal operations
  it('exposes listDeals function', () => {
    const { result } = renderHook(() => useBitrixApi());
    expect(typeof result.current.listDeals).toBe('function');
  });

  it('exposes getDeal function', () => {
    const { result } = renderHook(() => useBitrixApi());
    expect(typeof result.current.getDeal).toBe('function');
  });

  it('exposes createDeal function', () => {
    const { result } = renderHook(() => useBitrixApi());
    expect(typeof result.current.createDeal).toBe('function');
  });

  // Telephony
  it('exposes registerCall function', () => {
    const { result } = renderHook(() => useBitrixApi());
    expect(typeof result.current.registerCall).toBe('function');
  });

  it('exposes finishCall function', () => {
    const { result } = renderHook(() => useBitrixApi());
    expect(typeof result.current.finishCall).toBe('function');
  });

  it('exposes attachCallRecord function', () => {
    const { result } = renderHook(() => useBitrixApi());
    expect(typeof result.current.attachCallRecord).toBe('function');
  });

  // Sync
  it('exposes syncContactsFromBitrix function', () => {
    const { result } = renderHook(() => useBitrixApi());
    expect(typeof result.current.syncContactsFromBitrix).toBe('function');
  });

  it('exposes pushContactToBitrix function', () => {
    const { result } = renderHook(() => useBitrixApi());
    expect(typeof result.current.pushContactToBitrix).toBe('function');
  });

  it('exposes createLeadFromConversation function', () => {
    const { result } = renderHook(() => useBitrixApi());
    expect(typeof result.current.createLeadFromConversation).toBe('function');
  });

  it('listLeads calls edge function', async () => {
    const { result } = renderHook(() => useBitrixApi());
    await act(async () => {
      await result.current.listLeads();
    });
    expect(mockFunctionsInvoke).toHaveBeenCalledWith('bitrix-api', expect.objectContaining({
      body: expect.objectContaining({ action: 'list', entityType: 'lead' }),
    }));
  });

  it('handles invoke error', async () => {
    mockFunctionsInvoke.mockResolvedValue({ data: null, error: { message: 'Network error' } });
    const { result } = renderHook(() => useBitrixApi());
    await act(async () => {
      await result.current.listLeads();
    });
    expect(result.current.error).toBe('Network error');
  });

  it('handles response error', async () => {
    mockFunctionsInvoke.mockResolvedValue({ data: { error: 'Auth failed' }, error: null });
    const { result } = renderHook(() => useBitrixApi());
    await act(async () => {
      await result.current.listLeads();
    });
    expect(result.current.error).toBe('Auth failed');
  });

  it('sets loading during API call', async () => {
    let resolvePromise: (value: any) => void;
    mockFunctionsInvoke.mockReturnValue(new Promise(r => { resolvePromise = r; }));
    const { result } = renderHook(() => useBitrixApi());
    
    act(() => { result.current.listLeads(); });
    expect(result.current.loading).toBe(true);
    
    await act(async () => { resolvePromise!({ data: { success: true }, error: null }); });
    expect(result.current.loading).toBe(false);
  });
});
