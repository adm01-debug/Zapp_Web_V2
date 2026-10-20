// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockFrom = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    auth: {
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

const mockUseAuth = vi.fn();
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: any) => children,
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { useOnboardingChecklist } from '@/hooks/ui/useOnboardingChecklist';

describe('useOnboardingChecklist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { name: 'Agent Name', avatar_url: null }, error: null }),
            }),
          }),
        };
      }
      if (table === 'whatsapp_connections') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === 'user_settings') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        };
      }
      if (table === 'message_templates') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });
  });

  it('initializes with all false status', async () => {
    const { result } = renderHook(() => useOnboardingChecklist());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.status).toBeDefined();
  });

  it('checks profile completion', async () => {
    const { result } = renderHook(() => useOnboardingChecklist());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.status.profile).toBe(true); // "Agent Name" length > 2
  });

  it('profile incomplete when name too short', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { name: 'Ab', avatar_url: null }, error: null }),
            }),
          }),
        };
      }
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }), limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) };
    });

    const { result } = renderHook(() => useOnboardingChecklist());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.status.profile).toBe(false);
  });

  it('does not check when no user', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useOnboardingChecklist());
    // Should not crash
    expect(result.current.status).toBeDefined();
  });

  it('isDismissed defaults to false', async () => {
    const { result } = renderHook(() => useOnboardingChecklist());
    expect(result.current.isDismissed).toBe(false);
  });

  it('exposes dismiss function', async () => {
    const { result } = renderHook(() => useOnboardingChecklist());
    expect(typeof result.current.dismiss).toBe('function');
  });

  it('exposes checkStatus function', async () => {
    const { result } = renderHook(() => useOnboardingChecklist());
    expect(typeof result.current.checkStatus).toBe('function');
  });

  it('exposes progress percentage', async () => {
    const { result } = renderHook(() => useOnboardingChecklist());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(typeof result.current.progress).toBe('number');
    expect(result.current.progress).toBeGreaterThanOrEqual(0);
    expect(result.current.progress).toBeLessThanOrEqual(100);
  });
});
