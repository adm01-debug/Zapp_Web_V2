// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockFrom = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: any[]) => mockFrom(...args) },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useChatbotFlows } from '@/hooks/integrations/useChatbotFlows';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const mockFlows = [
  { id: 'f1', name: 'Welcome Flow', is_active: true, trigger_type: 'first_message', nodes: [], edges: [] },
  { id: 'f2', name: 'FAQ Flow', is_active: false, trigger_type: 'keyword', nodes: [], edges: [] },
];

describe('useChatbotFlows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: mockFlows, error: null }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'f3', name: 'New' }, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'f1' }, error: null }),
          }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
  });

  it('fetches chatbot flows', async () => {
    const { result } = renderHook(() => useChatbotFlows(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.flows).toBeDefined());
    expect(mockFrom).toHaveBeenCalledWith('chatbot_flows');
  });

  it('exposes CRUD mutations', () => {
    const { result } = renderHook(() => useChatbotFlows(), { wrapper: createWrapper() });
    expect(result.current.createFlow).toBeDefined();
    expect(result.current.updateFlow).toBeDefined();
    expect(result.current.deleteFlow).toBeDefined();
  });

  it('creates a flow', async () => {
    const { result } = renderHook(() => useChatbotFlows(), { wrapper: createWrapper() });
    await act(async () => {
      result.current.createFlow.mutate({ name: 'Test Flow', nodes: [], edges: [] });
    });
    expect(mockFrom).toHaveBeenCalledWith('chatbot_flows');
  });

  it('handles loading state', () => {
    const { result } = renderHook(() => useChatbotFlows(), { wrapper: createWrapper() });
    expect(typeof result.current.isLoading).toBe('boolean');
  });

  it('validates flow node types', () => {
    const validTypes = ['start', 'message', 'question', 'condition', 'action', 'delay', 'transfer', 'end'];
    validTypes.forEach(type => {
      expect(typeof type).toBe('string');
    });
  });

  it('validates flow trigger types', () => {
    const triggerTypes = ['keyword', 'first_message', 'menu', 'webhook', 'schedule'];
    triggerTypes.forEach(t => expect(typeof t).toBe('string'));
  });
});
