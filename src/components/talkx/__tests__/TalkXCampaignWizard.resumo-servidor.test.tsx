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
 *
 * O recorte de exemplo é `company eq "Acme"`: a segmentação por tag saiu do
 * Talk X (75d0e335d4, `withoutTagRules` na hidratação), então um recorte com
 * `tags` hidrataria vazio e o rail mostraria "—" — os números do servidor nunca
 * seriam exercitados.
 */

const rpcMock = vi.hoisted(() => vi.fn());
const countAudienceMock = vi.hoisted(() => vi.fn(async () => 3));
const resolveAudienceMock = vi.hoisted(() => vi.fn(async () => [] as unknown[]));
const fromTableMock = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() => vi.fn());
const profileMock = vi.hoisted(() => ({ id: 'profile-1' }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: fromMock, rpc: rpcMock },
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
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';
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

/**
 * Corrente mínima do PostgREST para a audiência persistida do rascunho
 * (`talkx_recipients`): é de onde a seleção manual é hidratada ao reabrir um
 * rascunho. Só essa tabela responde; as demais continuam como antes (`from`
 * devolve `undefined`), igual aos testes que já existiam.
 */
type PostgrestChain = {
  select: () => PostgrestChain;
  eq: () => PostgrestChain;
  order: () => PostgrestChain;
  range: () => Promise<{ data: { contact_id: string }[]; error: null }>;
};

function mockDraftRecipients(contactIds: string[]): void {
  const chain: PostgrestChain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    range: () => Promise.resolve({ data: contactIds.map((contact_id) => ({ contact_id })), error: null }),
  };
  fromMock.mockImplementation((table: string) => (table === 'talkx_recipients' ? chain : undefined));
}

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
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

    render(
      <TalkXCampaignWizard
        campaign={{
          audience_source: 'contacts',
          audience_filters: { groups: [{ id: 'g1', match: 'and', rules: [{ field: 'company', op: 'eq', value: 'Acme' }] }] },
        } as unknown as TalkXCampaign}
        onClose={vi.fn()}
      />,
      { wrapper },
    );

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

    render(
      <TalkXCampaignWizard
        campaign={{
          audience_source: 'contacts',
          audience_filters: { groups: [{ id: 'g1', match: 'and', rules: [{ field: 'company', op: 'eq', value: 'Acme' }] }] },
        } as unknown as TalkXCampaign}
        onClose={vi.fn()}
      />,
      { wrapper },
    );

    expect(tileText('Público total (estimado)')).toContain('…');
    expect(tileText('Bloqueados por supressão')).toContain('…');
  });

  it('origem crm360: resumo indisponível, RPC de audiência nunca chamada', () => {
    rpcMock.mockResolvedValue({ data: { mode: 'count', matched: 100, eligible: 80, suppressed: 20 }, error: null });

    render(
      <TalkXCampaignWizard campaign={{ audience_source: 'crm360' } as TalkXCampaign} onClose={vi.fn()} />,
      { wrapper },
    );

    // Os tiles mostram '—' em vez de 0 (que seria um número real enganoso).
    expect(tileText('Público total (estimado)')).toContain('—');
    expect(tileText('Elegíveis para envio')).toContain('—');
    expect(tileText('Bloqueados por supressão')).toContain('—');
    // A RPC de audiência não é chamada porque a origem não tem filtro.
    expect(rpcMock).not.toHaveBeenCalledWith('talkx_resolve_audience', expect.anything());
  });

  it('segmento sem segmentId escolhido: resumo indisponível, RPC nunca chamada', () => {
    rpcMock.mockResolvedValue({ data: { mode: 'count', matched: 100, eligible: 80, suppressed: 20 }, error: null });

    render(
      <TalkXCampaignWizard campaign={{ audience_source: 'segment' } as TalkXCampaign} onClose={vi.fn()} />,
      { wrapper },
    );

    expect(tileText('Público total (estimado)')).toContain('—');
    expect(tileText('Elegíveis para envio')).toContain('—');
    expect(tileText('Bloqueados por supressão')).toContain('—');
    expect(rpcMock).not.toHaveBeenCalledWith('talkx_resolve_audience', expect.anything());
  });

  it('segmentos escolhidos: o resumo une os segmentos (p_segment_ids) e mostra os números do servidor', async () => {
    rpcMock.mockResolvedValue({
      data: { mode: 'count', matched: 1300, eligible: 1187, suppressed: 61, invalid_phone: 40, legacy_or_deleted: 12 },
      error: null,
    });

    render(
      <TalkXCampaignWizard
        campaign={{ audience_source: 'segment' } as TalkXCampaign}
        initial={{ segmentIds: ['seg-1', 'seg-2'] }}
        onClose={vi.fn()}
      />,
      { wrapper },
    );

    // O Talk X aceita mais de um segmento (5680df621f trocou `segmentId` por
    // `segmentIds`): o resumo tem de mandar a lista inteira — a RPC une os
    // segmentos —, senão a tela mostraria o público de um segmento só.
    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith(
      'talkx_resolve_audience',
      expect.objectContaining({ p_segment_ids: ['seg-1', 'seg-2'] }),
    ));
    await waitFor(() => expect(tileText('Público total (estimado)')).toContain('1.248'));
    expect(tileText('Elegíveis para envio')).toContain('1.187');
    expect(tileText('Bloqueados por supressão')).toContain('61');
  });

  it('contacts sem regras completas: resumo indisponível, RPC nunca chamada', () => {
    rpcMock.mockResolvedValue({ data: { mode: 'count', matched: 100, eligible: 80, suppressed: 20 }, error: null });

    render(
      <TalkXCampaignWizard campaign={{ audience_source: 'contacts', audience_filters: {} } as TalkXCampaign} onClose={vi.fn()} />,
      { wrapper },
    );

    expect(tileText('Público total (estimado)')).toContain('—');
    expect(tileText('Elegíveis para envio')).toContain('—');
    expect(tileText('Bloqueados por supressão')).toContain('—');
    expect(rpcMock).not.toHaveBeenCalledWith('talkx_resolve_audience', expect.anything());
  });

  it('RPC de audiência falhou: os três tiles mostram "—" e nunca "0" como contagem real', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'talkx_audience_role_required' } });

    render(
      <TalkXCampaignWizard
        campaign={{
          audience_source: 'contacts',
          audience_filters: { groups: [{ id: 'g1', match: 'and', rules: [{ field: 'company', op: 'eq', value: 'Acme' }] }] },
        } as unknown as TalkXCampaign}
        onClose={vi.fn()}
      />,
      { wrapper },
    );

    // Antes: com `summary.isError` os tiles caíam no ramo de carregamento e
    // exibiam `fmtInt(0)` — "0" passava por contagem real de público.
    await waitFor(() => expect(tileText('Público total (estimado)')).toContain('—'));
    expect(tileText('Público total (estimado)')).not.toContain('0');
    expect(tileText('Elegíveis para envio')).toContain('—');
    expect(tileText('Elegíveis para envio')).not.toContain('0');
    expect(tileText('Bloqueados por supressão')).toContain('—');
    expect(rpcMock).toHaveBeenCalledWith('talkx_resolve_audience', expect.objectContaining({ p_mode: 'count' }));
  });

  it('seleção manual com regras completas: o total do servidor (só as regras) não é exibido', async () => {
    rpcMock.mockResolvedValue({
      data: { mode: 'count', matched: 1300, eligible: 1187, suppressed: 61, invalid_phone: 40, legacy_or_deleted: 12 },
      error: null,
    });
    mockDraftRecipients(['c1', 'c2']);

    render(
      <TalkXCampaignWizard
        campaign={{
          id: 'camp-manual',
          status: 'draft',
          audience_source: 'contacts',
          audience_filters: { groups: [{ id: 'g1', match: 'and', rules: [{ field: 'company', op: 'eq', value: 'Acme' }] }] },
        } as unknown as TalkXCampaign}
        onClose={vi.fn()}
      />,
      { wrapper },
    );

    // A seleção hidratada (2 contatos) estreita o recorte do disparo
    // (`contact_ids` no snapshot X017), mas a RPC do resumo conta só as regras
    // (1.248): esse número não pode aparecer como público desta campanha.
    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith('talkx_resolve_audience', expect.objectContaining({ p_mode: 'count' })));
    await waitFor(() => expect(tileText('Público total (estimado)')).toContain('—'));
    expect(tileText('Público total (estimado)')).not.toContain('1.248');
    expect(tileText('Elegíveis para envio')).toContain('—');
    // Sem número do servidor não pode sobrar o percentual dele no sub.
    expect(tileText('Elegíveis para envio')).not.toMatch(/%/);
    expect(tileText('Bloqueados por supressão')).toContain('—');
  });

  it('só seleção manual, sem regras: o público é a própria seleção (contagem local), não "—"', async () => {
    rpcMock.mockResolvedValue({ data: { mode: 'count', matched: 100, eligible: 80, suppressed: 20 }, error: null });
    mockDraftRecipients(['c1', 'c2']);

    render(
      <TalkXCampaignWizard
        campaign={{ id: 'camp-manual', status: 'draft', audience_source: 'contacts', audience_filters: {} } as unknown as TalkXCampaign}
        onClose={vi.fn()}
      />,
      { wrapper },
    );

    // Sem regras a RPC não é chamada, mas o disparo manda `contact_ids` com
    // grupos vazios: o público é a seleção manual (2), não "—".
    await waitFor(() => expect(tileText('Público total (estimado)')).toContain('2'));
    expect(tileText('Público total (estimado)')).not.toContain('—');
    expect(tileText('Elegíveis para envio')).toContain('—');
    expect(tileText('Bloqueados por supressão')).toContain('—');
    expect(rpcMock).not.toHaveBeenCalledWith('talkx_resolve_audience', expect.anything());
  });
});
