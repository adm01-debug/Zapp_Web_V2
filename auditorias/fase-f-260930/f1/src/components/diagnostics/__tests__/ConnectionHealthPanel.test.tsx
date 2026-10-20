// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockInvoke = vi.hoisted(() => vi.fn());
const mockChannel = vi.hoisted(() => vi.fn());
const mockRemoveChannel = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mockFrom,
    functions: { invoke: mockInvoke },
    channel: mockChannel.mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
    removeChannel: mockRemoveChannel,
    auth: {
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('framer-motion', () => ({
  motion: { div: ({ children, ...props }: any) => <div {...props}>{children}</div> },
  AnimatePresence: ({ children }: any) => children,
}));

import { ConnectionHealthPanel } from '@/components/diagnostics/ConnectionHealthPanel';
import { toast } from 'sonner';

describe('ConnectionHealthPanel', () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => {
      const response = Promise.resolve({ data: [], error: null });
      const query = Object.assign(response, { limit: vi.fn(() => query), abortSignal: vi.fn(() => query) });
      return { select: vi.fn(() => ({ order: vi.fn(() => query) })) };
    });
  });

  it('renders summary cards', async () => {
    render(<ConnectionHealthPanel />);
    await waitFor(() => {
      expect(screen.getByText('Conexões Saudáveis')).toBeInTheDocument();
      expect(screen.getByText('Tempo Médio')).toBeInTheDocument();
    });
  });

  it('shows 0/0 when no connections', async () => {
    render(<ConnectionHealthPanel />);
    await waitFor(() => expect(screen.getByText('0/0')).toBeInTheDocument());
  });

  it('shows empty log message', async () => {
    render(<ConnectionHealthPanel />);
    await waitFor(() => expect(screen.getByText(/Nenhum health check registrado/)).toBeInTheDocument());
  });

  it('calls edge function on button click', async () => {
    mockInvoke.mockResolvedValue({ data: { connections: [] }, error: null });
    render(<ConnectionHealthPanel />);
    await waitFor(() => expect(screen.getByText('Executar Health Check')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Executar Health Check'));
    await waitFor(() => { expect(mockInvoke).toHaveBeenCalledWith('connection-health-check'); expect(toast.success).toHaveBeenCalled(); });
  });

  it('shows error on failed health check', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error('fail') });
    render(<ConnectionHealthPanel />);
    await waitFor(() => expect(screen.getByText('Executar Health Check')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Executar Health Check'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Erro ao executar health check'));
  });

  it('refreshes both queries without relying on unpublished health logs', async () => {
    vi.useFakeTimers();
    render(<ConnectionHealthPanel />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(mockFrom).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(mockFrom).toHaveBeenCalledTimes(4);
    expect(mockChannel).not.toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalled();
  });
  it('stops queries on unmount', async () => {
    vi.useFakeTimers();
    const { unmount } = render(<ConnectionHealthPanel />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    unmount();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });
});
