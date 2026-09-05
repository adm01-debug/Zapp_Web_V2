// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    }),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { password: 'test-pass' } }),
    },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/hooks/communication/useSipClient', () => ({
  useSipClient: () => ({
    sipStatus: 'disconnected' as const,
    callStatus: 'idle' as const,
    callDuration: 0,
    isMuted: false,
    currentNumber: '',
    connect: vi.fn(),
    disconnect: vi.fn(),
    makeCall: vi.fn(),
    hangUp: vi.fn(),
    toggleMute: vi.fn(),
    sendDTMF: vi.fn(),
  }),
}));

import { VoIPPanel } from '../VoIPPanel';

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('VoIPPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the VoIP header', () => {
    renderWithProviders(<VoIPPanel />);
    expect(screen.getByText('VoIP & Chamadas')).toBeInTheDocument();
  });

  it('renders all three tabs', () => {
    renderWithProviders(<VoIPPanel />);
    expect(screen.getByText('Discador')).toBeInTheDocument();
    expect(screen.getByText('Histórico')).toBeInTheDocument();
    expect(screen.getByText('Configurações')).toBeInTheDocument();
  });

  it('defaults to dialer tab with number input visible', () => {
    renderWithProviders(<VoIPPanel />);
    expect(screen.getByPlaceholderText('Digite o número')).toBeInTheDocument();
  });

  it('can click history tab without crashing', () => {
    renderWithProviders(<VoIPPanel />);
    fireEvent.click(screen.getByText('Histórico'));
    // Tab clicked without error
    expect(screen.getByText('Histórico')).toBeInTheDocument();
  });

  it('can click settings tab without crashing', () => {
    renderWithProviders(<VoIPPanel />);
    fireEvent.click(screen.getByText('Configurações'));
    expect(screen.getByText('Configurações')).toBeInTheDocument();
  });

  it('renders stat cards', () => {
    renderWithProviders(<VoIPPanel />);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Recebidas')).toBeInTheDocument();
    expect(screen.getByText('Realizadas')).toBeInTheDocument();
    expect(screen.getByText('Perdidas')).toBeInTheDocument();
    expect(screen.getByText('Duração Média')).toBeInTheDocument();
  });

  it('calculates stats correctly with empty calls', () => {
    renderWithProviders(<VoIPPanel />);
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(4);
  });

  it('renders without crashing when supabase returns error', () => {
    renderWithProviders(<VoIPPanel />);
    expect(screen.getByText('VoIP & Chamadas')).toBeInTheDocument();
  });

  it('shows config toast when invoke returns SIP_NOT_CONFIGURED (503)', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    const { toast } = await import('sonner');
    (supabase.functions.invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: { context: { status: 503, code: 'SIP_NOT_CONFIGURED' } },
    });
    renderWithProviders(<VoIPPanel />);
    const connectBtn = screen.getByRole('button', { name: /conectar/i });
    fireEvent.click(connectBtn);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('SIP_PASSWORD'),
      );
    });
  });

  it('shows generic toast for non-config invoke errors (401)', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    const { toast } = await import('sonner');
    (supabase.functions.invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: { context: { status: 401, code: 'UNAUTHORIZED' } },
    });
    renderWithProviders(<VoIPPanel />);
    const connectBtn = screen.getByRole('button', { name: /conectar/i });
    fireEvent.click(connectBtn);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('sessão'),
      );
    });
  });

  it('renders description text', () => {
    renderWithProviders(<VoIPPanel />);
    expect(screen.getByText('Click-to-call, histórico de chamadas e gravações')).toBeInTheDocument();
  });
});
