import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock supabase
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: mockSelect.mockReturnValue({
        eq: mockEq.mockReturnValue({
          single: mockSingle,
        }),
      }),
    })),
  },
}));

// Mock useAuth
const mockUser = { id: 'user-123' };
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: vi.fn(() => ({ user: mockUser })),
}));

import { useDownloadPermission } from '@/hooks/system/useDownloadPermission';
import { useAuth } from '@/hooks/auth/useAuth';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useDownloadPermission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: mockUser });
  });

  it('retorna false por padrão quando perfil não encontrado', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'not found' } });

    const { result } = renderHook(() => useDownloadPermission(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canDownload).toBe(false);
  });

  it('retorna true quando can_download é true no perfil', async () => {
    mockSingle.mockResolvedValue({ data: { can_download: true }, error: null });

    const { result } = renderHook(() => useDownloadPermission(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.canDownload).toBe(true));
  });

  it('retorna false quando can_download é false no perfil', async () => {
    mockSingle.mockResolvedValue({ data: { can_download: false }, error: null });

    const { result } = renderHook(() => useDownloadPermission(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canDownload).toBe(false);
  });

  it('retorna false quando can_download é null (fallback seguro)', async () => {
    mockSingle.mockResolvedValue({ data: { can_download: null }, error: null });

    const { result } = renderHook(() => useDownloadPermission(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canDownload).toBe(false);
  });

  it('retorna false quando não há usuário autenticado', async () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: null });

    const { result } = renderHook(() => useDownloadPermission(), { wrapper: createWrapper() });

    // Query should not be enabled, so canDownload stays default false
    expect(result.current.canDownload).toBe(false);
  });

  it('retorna false em caso de erro na query do Supabase', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'network error' } });

    const { result } = renderHook(() => useDownloadPermission(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canDownload).toBe(false);
  });

  it('consulta a tabela profiles com user_id correto', async () => {
    mockSingle.mockResolvedValue({ data: { can_download: true }, error: null });

    renderHook(() => useDownloadPermission(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockSelect).toHaveBeenCalledWith('can_download');
      expect(mockEq).toHaveBeenCalledWith('user_id', 'user-123');
    });
  });
});
