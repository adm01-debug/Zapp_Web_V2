/**
 * X047 — matriz tela×estado: erro chega ao boundary, vazio não aparece.
 *
 * Uma linha por tela que usa TalkXQueryBoundary. Para cada tela:
 *   - hook/prop de erro ativado → "Não foi possível carregar …" aparece
 *   - texto de vazio NÃO aparece
 *   - conteúdo NÃO aparece
 *
 * Cobertura complementar (estados de loading, retry, aria-busy) fica nos
 * arquivos *.states.test.tsx por tela — este arquivo só trava a invariante
 * central da matriz.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/mocks/queryClient';

// ---------------------------------------------------------------------------
// Mocks globais — declarados antes dos imports dos componentes
// ---------------------------------------------------------------------------

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: [],
    isLoading: false,
    isError: true,
    error: new Error('X047-matrix'),
    isFetching: false,
    refetchCampaigns: vi.fn(),
    startCampaign: vi.fn(),
    pauseCampaign: vi.fn(),
    cancelCampaign: vi.fn(),
    updateCampaign: vi.fn(),
  }),
}));

vi.mock('@/hooks/integrations/useTalkXInsights', () => ({
  useTalkXInsights: () => ({ data: undefined }),
}));

vi.mock('@/hooks/integrations/useTalkXOverviewStats', () => ({
  useTalkXOverviewStats: () => ({ data: undefined }),
}));

vi.mock('@/hooks/integrations/useTalkXAnalytics', async (orig) => {
  const actual = await orig<typeof import('@/hooks/integrations/useTalkXAnalytics')>();
  return {
    ...actual,
    useTalkXAnalytics: () => ({ data: undefined, isPending: false }),
  };
});

vi.mock('@/hooks/crm/useCRMAdminAccess', () => ({
  useCRMAdminAccess: () => ({ isAdmin: false }),
}));

vi.mock('@/hooks/crm/useActiveDepartments', () => ({
  useActiveDepartments: () => ({ departments: [] }),
}));

vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({
  useTalkXTemplates: () => ({
    templates: [],
    isLoading: false,
    isError: true,
    error: new Error('X047-matrix-templates'),
    refetch: vi.fn(),
    createTemplate: { mutate: vi.fn() },
    updateTemplate: { mutate: vi.fn() },
    deleteTemplate: { mutate: vi.fn() },
    duplicateTemplate: { mutate: vi.fn() },
    testTemplate: vi.fn(),
    fetchVersionHistory: vi.fn(),
    fetchVariants: vi.fn(),
    saveVariant: vi.fn(),
    deleteVariant: vi.fn(),
    countVariantRecipients: vi.fn(),
  }),
}));

vi.mock('@/hooks/integrations/useTalkXSegments', async (orig) => {
  const actual = await orig<typeof import('@/hooks/integrations/useTalkXSegments')>();
  return {
    ...actual,
    useTalkXSegments: () => ({
      segments: [],
      isLoading: false,
      isError: true,
      error: new Error('X047-matrix-segments'),
      refetch: vi.fn(),
      createSegment: { mutate: vi.fn() },
      updateSegment: { mutate: vi.fn() },
      deleteSegment: { mutate: vi.fn() },
    }),
  };
});

vi.mock('@/hooks/integrations/useTalkXSettings', () => ({
  useTalkXSettings: () => ({
    data: undefined,
    isLoading: false,
    error: new Error('X047-matrix-settings'),
    refetch: vi.fn(),
  }),
  useTalkXSettingUpdate: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.is = () => chain;
  chain.order = () => Promise.resolve({ data: null, error: new Error('X047-matrix-suppression') });
  chain.limit = () => Promise.resolve({ data: [], error: null });
  return { supabase: { from: () => chain } };
});

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: () => {
    const chain: Record<string, unknown> = {};
    const ok = () => Promise.resolve({ data: [], error: null, count: 0 });
    chain.select = () => chain;
    chain.in = () => chain;
    chain.eq = () => chain;
    chain.order = () => chain;
    chain.limit = () => chain;
    chain.ilike = () => chain;
    chain.range = () => ok();
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      ok().then(resolve, reject);
    return chain;
  },
}));

vi.mock('@/components/talkx/useTalkXLifecycle', async (orig) => {
  const actual = await orig<typeof import('@/components/talkx/useTalkXLifecycle')>();
  return {
    ...actual,
    useTalkXLifecycle: () => ({
      intent: null,
      isPending: false,
      error: null,
      reason: '',
      setReason: vi.fn(),
      request: vi.fn(() => true),
      confirm: vi.fn(),
      close: vi.fn(() => true),
      clearError: vi.fn(),
    }),
    TalkXLifecycleDialog: () => null,
  };
});

vi.mock('@/components/talkx/useCampaignRowActions', () => ({
  useCampaignRowActions: () => ({
    actionsFor: () => [],
    run: vi.fn(),
    pendingId: null,
    dialogs: null,
  }),
}));

vi.mock('@/hooks/integrations/useTalkXConnectionStatus', () => ({
  useTalkXConnectionStatus: () => ({ isConnected: false, isLoading: false }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({
    profile: { id: 'user-x047', name: 'Test', role: 'admin' },
    user: { id: 'user-x047' },
    isLoading: false,
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports dos componentes (depois dos mocks)
// ---------------------------------------------------------------------------

import { TalkXOverview } from '../TalkXOverview';
import { TalkXAnalytics } from '../TalkXAnalytics';
import { TalkXCampaignPaused } from '../TalkXCampaignPaused';
import { TalkXCampaignScheduled } from '../TalkXCampaignScheduled';
import { TalkXTemplates } from '../TalkXTemplates';
import { TalkXSegments } from '../TalkXSegments';
import { TalkXSettings } from '../TalkXSettings';
import { TalkXSuppression } from '../TalkXSuppression';
import { TalkXTemplateEditor } from '../TalkXTemplateEditor';

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------

function wrap(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      {ui}
    </QueryClientProvider>
  );
}

function expectErrorBoundary() {
  expect(screen.getByText(/Não foi possível carregar/)).toBeTruthy();
}

function expectNoEmpty() {
  // Textos de vazio típicos dos boundaries do Talk X
  expect(screen.queryByText(/Nenhuma campanha/)).toBeNull();
  expect(screen.queryByText(/Nenhum template/)).toBeNull();
  expect(screen.queryByText(/Nenhum segmento/)).toBeNull();
  expect(screen.queryByText(/Nenhuma supressão/)).toBeNull();
  expect(screen.queryByText(/Nenhum número/)).toBeNull();
  expect(screen.queryByText(/Nenhuma configuração/)).toBeNull();
  expect(screen.queryByText(/nada encontrado/i)).toBeNull();
}

// ---------------------------------------------------------------------------
// Testes — uma linha por tela
// ---------------------------------------------------------------------------

describe('X047 — matriz tela×estado: boundary de erro prevalece sobre vazio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TalkXOverview — erro: mostra boundary, não vazio', () => {
    wrap(
      <TalkXOverview
        campaigns={[]}
        segments={[]}
        creators={{}}
        isLoading={false}
        isError={true}
        error={new Error('X047')}
        onNew={vi.fn()}
        onEdit={vi.fn()}
        onView={vi.fn()}
        onViewScheduled={vi.fn()}
        onViewRunning={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onGoTab={vi.fn()}
      />
    );
    expectErrorBoundary();
    expectNoEmpty();
  });

  it('TalkXAnalytics — erro: mostra boundary, não vazio', () => {
    wrap(
      <TalkXAnalytics
        campaigns={[]}
        isLoading={false}
        isError={true}
      />
    );
    expectErrorBoundary();
    expectNoEmpty();
  });

  it('TalkXCampaignPaused — erro (via useTalkX): mostra boundary, não vazio', () => {
    wrap(
      <TalkXCampaignPaused
        campaignId="camp-x047"
        onBack={vi.fn()}
        onStatusChange={vi.fn()}
      />
    );
    expectErrorBoundary();
    expectNoEmpty();
  });

  it('TalkXCampaignScheduled — erro (via useTalkX): mostra boundary, não vazio', () => {
    wrap(
      <TalkXCampaignScheduled
        campaignId="camp-x047"
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onStatusChange={vi.fn()}
      />
    );
    expectErrorBoundary();
    expectNoEmpty();
  });

  it('TalkXTemplates — erro (via useTalkXTemplates): mostra boundary, não vazio', () => {
    wrap(
      <TalkXTemplates
        onUseTemplate={vi.fn()}
      />
    );
    expectErrorBoundary();
    expectNoEmpty();
  });

  it('TalkXSegments — erro (via useTalkXSegments): mostra boundary, não vazio', () => {
    wrap(
      <TalkXSegments
        onUseCampaign={vi.fn()}
      />
    );
    expectErrorBoundary();
    expectNoEmpty();
  });

  it('TalkXSettings — erro (via useTalkXSettings): mostra boundary, não vazio', () => {
    wrap(<TalkXSettings />);
    expectErrorBoundary();
    expectNoEmpty();
  });

  it('TalkXSuppression — erro (via supabase): mostra boundary, não vazio', async () => {
    wrap(
      <TalkXSuppression
        onOpenContact={vi.fn()}
        onOpenCampaign={vi.fn()}
      />
    );
    await waitFor(() => expectErrorBoundary());
    expectNoEmpty();
  });

  it('TalkXTemplateEditor — erro (prop isError): mostra boundary, não vazio', () => {
    wrap(
      <TalkXTemplateEditor
        templates={[]}
        isLoading={false}
        isError={true}
        error={new Error('X047')}
        editing={null}
        onClose={vi.fn()}
      />
    );
    expectErrorBoundary();
    expectNoEmpty();
  });
});
