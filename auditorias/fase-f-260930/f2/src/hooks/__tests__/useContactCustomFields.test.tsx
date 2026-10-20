// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const mockSelect = vi.fn();
const mockUpsert = vi.fn();
const mockDelete = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: any[]) => mockFrom(...args) },
}));
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { useContactCustomFields } from '@/hooks/crm/useContactCustomFields';

describe('useContactCustomFields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [
            { id: 'cf1', contact_id: 'c1', field_name: 'CPF', field_value: '123', field_type: 'text' },
          ], error: null }),
        }),
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
  });

  it('fetches custom fields for a contact', async () => {
    const { result } = renderHook(() => useContactCustomFields('c1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFrom).toHaveBeenCalledWith('contact_custom_fields');
  });

  it('does not fetch when contactId is undefined', () => {
    const { result } = renderHook(() => useContactCustomFields(undefined));
    expect(result.current.fields).toEqual([]);
  });

  it('exposes addField function', () => {
    const { result } = renderHook(() => useContactCustomFields('c1'));
    expect(typeof result.current.addField).toBe('function');
  });

  it('exposes removeField function', () => {
    const { result } = renderHook(() => useContactCustomFields('c1'));
    expect(typeof result.current.removeField).toBe('function');
  });

  it('isLoading starts as false for undefined contactId', () => {
    const { result } = renderHook(() => useContactCustomFields(undefined));
    expect(result.current.isLoading).toBe(false);
  });
});
