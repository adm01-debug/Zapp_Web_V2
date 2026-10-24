import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockInvokeEdge } = vi.hoisted(() => ({ mockInvokeEdge: vi.fn() }));
vi.mock('@/lib/invokeEdge', () => ({ invokeEdge: mockInvokeEdge }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = (_cols?: unknown, opts?: { head?: boolean }) => {
        if ((opts as { head?: boolean } | undefined)?.head) {
          return { like: () => Promise.resolve({ count: 0, error: null }) };
        }
        q.eq = () => q;
        q.order = () => q;
        q.limit = () => Promise.resolve({ data: [], error: null });
        q.in = () => Promise.resolve({ data: [], error: null });
        return q;
      };
      return q;
    },
    functions: { invoke: vi.fn() },
  },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/hooks/system/useRateLimitLogs', () => ({
  useRateLimitLogs: vi.fn(() => ({ logs: [], stats: null, loading: false, refetch: vi.fn() })),
}));
vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: vi.fn(() => ({ isAdmin: true, isSupervisor: false })),
}));

import AdminTelemetriaPage from '@/pages/AdminTelemetriaPage';
import RateLimitDashboard from '@/pages/admin/RateLimitDashboard';
import { MediaMigrationTool } from '@/components/admin/MediaMigrationTool';

function withQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('N-066: nomes acessíveis em combobox e progressbar', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('AdminTelemetriaPage — 2 combobox nomeados', () => {
    it('filtro de severidade tem nome acessível (combobox)', () => {
      withQueryClient(<AdminTelemetriaPage />);
      expect(screen.getByRole('combobox', { name: /filtro de severidade/i })).toBeInTheDocument();
    });

    it('filtro de período tem nome acessível (combobox)', () => {
      withQueryClient(<AdminTelemetriaPage />);
      expect(screen.getByRole('combobox', { name: /filtro de período/i })).toBeInTheDocument();
    });
  });

  describe('RateLimitDashboard — 1 progressbar nomeado', () => {
    it('barra de progresso de requisições bloqueadas tem nome acessível', () => {
      render(<RateLimitDashboard />);
      expect(screen.getByRole('progressbar', { name: /requisições bloqueadas/i })).toBeInTheDocument();
    });
  });

  describe('MediaMigrationTool — 2 progressbars nomeados', () => {
    it('progresso da migração de mídia tem nome acessível (estado em execução)', async () => {
      mockInvokeEdge.mockImplementationOnce(() => new Promise(() => {}));

      render(<MediaMigrationTool />);
      fireEvent.click(screen.getByRole('button', { name: /iniciar migração/i }));

      await waitFor(() => {
        expect(screen.getByRole('progressbar', { name: /migração de mídia/i })).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('progresso do resultado da migração tem nome acessível (estado com resultado)', async () => {
      mockInvokeEdge.mockResolvedValueOnce({
        data: { success: true, processed: 10, migrated: 8, failed: 2 },
        error: null,
      });

      render(<MediaMigrationTool />);
      fireEvent.click(screen.getByRole('button', { name: /iniciar migração/i }));

      await waitFor(() => {
        expect(screen.getByRole('progressbar', { name: /progresso da migração/i })).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe('axe — zero violações de nome acessível', () => {
    it('AdminTelemetriaPage não acusa controles sem nome', async () => {
      const { container } = withQueryClient(<AdminTelemetriaPage />);
      const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
      const semNome = results.violations.filter((v) =>
        ['button-name', 'aria-input-field-name', 'aria-toggle-field-name', 'aria-command-name', 'progressbar-name'].includes(v.id),
      );
      expect(semNome).toEqual([]);
    });

    it('RateLimitDashboard não acusa controles sem nome', async () => {
      const { container } = render(<RateLimitDashboard />);
      const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
      const semNome = results.violations.filter((v) =>
        ['button-name', 'aria-input-field-name', 'aria-toggle-field-name', 'aria-command-name', 'progressbar-name'].includes(v.id),
      );
      expect(semNome).toEqual([]);
    });

    it('MediaMigrationTool não acusa controles sem nome', async () => {
      mockInvokeEdge.mockResolvedValueOnce({
        data: { success: true, processed: 10, migrated: 8, failed: 2 },
        error: null,
      });

      const { container } = render(<MediaMigrationTool />);
      fireEvent.click(screen.getByRole('button', { name: /iniciar migração/i }));

      await waitFor(() => {
        expect(screen.getByRole('progressbar', { name: /progresso da migração/i })).toBeInTheDocument();
      }, { timeout: 3000 });

      const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
      const semNome = results.violations.filter((v) =>
        ['button-name', 'aria-input-field-name', 'aria-toggle-field-name', 'aria-command-name', 'progressbar-name'].includes(v.id),
      );
      expect(semNome).toEqual([]);
    });
  });
});
