// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    })),
    functions: { invoke: vi.fn() },
    auth: {
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, session: {}, profile: null, loading: false }),
  AuthProvider: ({ children }: any) => children,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => children,
}));

// Mock the useCampaigns hook
const mockCreateCampaign = { mutate: vi.fn(), isPending: false };
const mockUpdateCampaign = { mutate: vi.fn() };
const mockDeleteCampaign = { mutate: vi.fn() };

vi.mock('@/hooks/communication/useCampaigns', () => ({
  useCampaigns: () => ({
    campaigns: [],
    isLoading: false,
    createCampaign: mockCreateCampaign,
    updateCampaign: mockUpdateCampaign,
    deleteCampaign: mockDeleteCampaign,
  }),
}));

import { CampaignsView } from '@/components/campaigns/CampaignsView';

describe('CampaignsView', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('Target Type Options', () => {
    it('renders the campaigns view', async () => {
      render(<CampaignsView />);
      await waitFor(() => {
        expect(screen.getByText('Campanhas')).toBeInTheDocument();
      });
    });
  });
});
