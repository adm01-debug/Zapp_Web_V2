/**
 * X048 (TL-106) — quando crm = 'unavailable', a tela de Segmentos exibe
 * TalkXCrmUnavailableState com o botão "Ver status dos serviços" que abre
 * o ServiceStatusSheet.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('@/hooks/integrations/useTalkXServiceStatus', () => ({
  useTalkXServiceStatus: () => ({ whatsapp: { connected: null }, crm: 'unavailable' }),
}));

vi.mock('@/hooks/integrations/useTalkXSegments', async (orig) => {
  const actual = await orig<typeof import('@/hooks/integrations/useTalkXSegments')>();
  return {
    ...actual,
    useTalkXSegments: () => ({
      segments: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      createSegment: { mutate: vi.fn() },
      updateSegment: { mutateAsync: vi.fn() },
      deleteSegment: { mutate: vi.fn() },
      refreshEstimates: { mutate: vi.fn() },
      userId: 'user-1',
      selectedIds: [],
      toggleSelect: vi.fn(),
      selectAll: vi.fn(),
      clearSelection: vi.fn(),
      runBulkAction: vi.fn().mockResolvedValue([]),
      isBulkRunning: false,
    }),
  };
});

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1', full_name: 'QA' }, user: { id: 'user-1' }, session: null, loading: false }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
  },
}));

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => true };
});

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { TalkXSegments } from '../TalkXSegments';

describe('TalkXSegments — crm unavailable (X048)', () => {
  it('exibe "CRM 360 indisponível" quando crm = unavailable', () => {
    render(<TalkXSegments onUseCampaign={vi.fn()} />);
    expect(screen.getByText('CRM 360 indisponível')).toBeInTheDocument();
  });

  it('"Ver status dos serviços" abre o ServiceStatusSheet', () => {
    render(<TalkXSegments onUseCampaign={vi.fn()} />);

    const btn = screen.getByRole('button', { name: /Ver status dos serviços/i });
    fireEvent.click(btn);

    expect(screen.getByTestId('service-status-sheet')).toBeInTheDocument();
  });

  it('ao fechar o sheet, ele desaparece', () => {
    render(<TalkXSegments onUseCampaign={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Ver status dos serviços/i }));
    expect(screen.getByTestId('service-status-sheet')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Fechar painel de status/i }));
    expect(screen.queryByTestId('service-status-sheet')).toBeNull();
  });
});
