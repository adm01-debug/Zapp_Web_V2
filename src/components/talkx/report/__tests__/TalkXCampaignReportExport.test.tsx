import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * X168 — botão "Exportar CSV" do TalkXCampaignReport.
 *
 * Cobre:
 *   1. Botão ausente quando `canDownload = false`
 *   2. Botão presente quando `canDownload = true`
 */

vi.mock('@/hooks/system/useDownloadPermission', () => ({
  useDownloadPermission: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          not: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          })),
        })),
      })),
    })),
  },
}));

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        not: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        })),
        inner: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          })),
        })),
      })),
    })),
  })),
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

import { useDownloadPermission } from '@/hooks/system/useDownloadPermission';
import { TalkXCampaignReport } from '../TalkXCampaignReport';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';

const mockCampaign = {
  id: 'camp-test-1',
  name: 'Campanha Teste',
  status: 'completed',
  template_id: 'tpl-1',
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-01T10:00:00Z',
  started_at: '2026-10-01T10:00:00Z',
  completed_at: '2026-10-01T11:00:00Z',
  sent_count: 100,
  delivered_count: 90,
  replied_count: 10,
  total_recipients: 100,
  schedule_timezone: 'America/Sao_Paulo',
  owner: null,
  objective: undefined,
  segment_ids: [],
  description: null,
  scheduled_at: null,
};

function renderReport(canDownload: boolean) {
  (useDownloadPermission as ReturnType<typeof vi.fn>).mockReturnValue({ canDownload, isLoading: false });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TalkXCampaignReport campaign={mockCampaign as TalkXCampaign} onBack={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('X168 · TalkXCampaignReport — botão exportar', () => {
  it('botão "Exportar CSV" NÃO renderiza sem can_download', () => {
    renderReport(false);
    expect(screen.queryByRole('button', { name: /Exportar relat/i })).toBeNull();
  });

  it('botão "Exportar CSV" aparece com can_download', () => {
    renderReport(true);
    expect(screen.getByRole('button', { name: /Exportar relat/i })).toBeTruthy();
  });
});
