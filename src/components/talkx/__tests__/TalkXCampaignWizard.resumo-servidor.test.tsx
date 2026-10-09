import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * X131 — o rail "Resumo da campanha" (passo 1 do wizard) mostra o público lido
 * do SERVIDOR.
 *
 * A prova renderiza o wizard REAL com o hook REAL (o mock é só o cliente
 * Supabase, que devolve o jsonb da RPC). Os valores locais do editor são
 * deliberadamente diferentes — `countAudience` responde 3 e a seleção manual
 * está vazia — para que o rail só possa exibir 1.248 / 1.187 / 61 (95,1% /
 * 4,9%) se os números vierem da RPC de audiência.
 */

const rpcMock = vi.hoisted(() => vi.fn());
const countAudienceMock = vi.hoisted(() => vi.fn(async () => 3));
const resolveAudienceMock = vi.hoisted(() => vi.fn(async () => [] as unknown[]));
const fromTableMock = vi.hoisted(() => vi.fn());
const profileMock = vi.hoisted(() => ({ id: 'profile-1' }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), rpc: rpcMock },
}));
vi.mock('@/lib/supabaseHelpers', () => ({ fromTable: fromTableMock }));
vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: [],
    createCampaign: { mutateAsync: vi.fn() },
    updateCampaign: { mutateAsync: vi.fn() },
    saveDraftCampaign: { mutateAsync: vi.fn() },
    snapshotDraftAudience: { mutateAsync: vi.fn() },
    startCampaign: vi.fn(),
  }),
}));
// O motor de segmentos entra REAL (catálogo de regras e validação); só as
// consultas ao banco viram spies.
vi.mock('@/hooks/integrations/useTalkXSegments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/integrations/useTalkXSegments')>();
  return {
    ...actual,
    useTalkXSegments: () => ({ segments: [] }),
    countAudience: countAudienceMock,
    resolveAudience: resolveAudienceMock,
  };
});
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: null, session: null, profile: profileMock, loading: false, signIn: vi.fn(), signUp: vi.fn(), signOut: vi.fn(), refreshProfile: vi.fn() }),
}));
vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({
  useTalkXTemplates: () => ({
    templates: [],
    registerUse: vi.fn(),
    fetchVersionHistory: vi.fn(async () => []),
    createTemplate: { mutateAsync: vi.fn(), mutate: vi.fn() },
    updateTemplate: { mutateAsync: vi.fn(), mutate: vi.fn() },
    duplicateTemplate: { mutateAsync: vi.fn(), mutate: vi.fn() },
    testTemplate: vi.fn(),
    fetchVariants: vi.fn(async () => []),
    saveVariant: vi.fn(),
    deleteVariant: vi.fn(),
    countVariantRecipients: vi.fn(async () => 0),
  }),
}));
vi.mock('@/hooks/integrations/useTalkXEvents', () => ({ useTalkXEventLogger: () => vi.fn() }));
vi.mock('@/hooks/crm/useContactCustomFields', () => ({ useContactCustomFields: () => ({ fields: [] }) }));
vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({ useCRMIntegrationEnabled: () => false }));
vi.mock('@/hooks/crm/useExternalContact360Batch', () => ({
  useExternalContact360Batch: () => ({ batchData: new Map(), lookup: () => undefined, isLoading: false, isConfigured: false }),
}));

import { TalkXCampaignWizard } from '@/components/talkx/TalkXCampaignWizard';
import { TooltipProvider } from '@/components/ui/tooltip';

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }) },
    React.createElement(TooltipProvider, null, children),
  );
}

/** Texto completo do tile cujo rótulo é `label` (rótulo + valor + legenda). */
function tileText(label: string): string {
  const labelNode = screen.getByText(label);
  return labelNode.parentElement?.textContent ?? '';
}

beforeEach(() => {
  rpcMock.mockReset();
  countAudienceMock.mockReset();
  countAudienceMock.mockResolvedValue(3);
  fromTableMock.mockReset();
});

describe('WizardRail — resumo da campanha calculado no servidor (X131)', () => {
  it('mostra o público da RPC (total, elegíveis e bloqueados) em vez da contagem local', async () => {
    rpcMock.mockResolvedValue({
      data: { mode: 'count', matched: 1300, eligible: 1187, suppressed: 61, invalid_phone: 40, legacy_or_deleted: 12 },
      error: null,
    });

    render(<TalkXCampaignWizard campaign={null} onClose={vi.fn()} />, { wrapper });

    await waitFor(() => expect(tileText('Público total (estimado)')).toContain('1.248'));
    // Elegíveis + bloqueados = total, com os percentuais do mock da tela 08.
    expect(tileText('Elegíveis para envio')).toContain('1.187');
    expect(tileText('Elegíveis para envio')).toContain('95,1%');
    expect(tileText('Bloqueados por supressão')).toContain('61');
    expect(tileText('Bloqueados por supressão')).toContain('4,9%');
    // A seleção manual está vazia e `countAudience` responderia 3: nenhum
    // número local pode ter alimentado o painel.
    expect(rpcMock).toHaveBeenCalledWith('talkx_resolve_audience', expect.objectContaining({ p_mode: 'count' }));
  });

  it('deixa claro que o público está sendo consultado antes de o servidor responder', () => {
    rpcMock.mockReturnValue(new Promise(() => { /* consulta pendente */ }));

    render(<TalkXCampaignWizard campaign={null} onClose={vi.fn()} />, { wrapper });

    expect(tileText('Público total (estimado)')).toContain('…');
    expect(tileText('Bloqueados por supressão')).toContain('…');
  });
});
