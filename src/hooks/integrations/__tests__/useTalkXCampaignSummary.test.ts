import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * X131 — o rail "Resumo da campanha" passa a ler o público do SERVIDOR.
 *
 * Antes: "Público total" = `selectedContacts.length` (contagem local),
 * "Bloqueados por supressão" = 0 para segmento e só existia depois de um save.
 * Agora os três números saem da RPC de audiência (`talkx_resolve_audience`,
 * X016/X017), a mesma que decide o público do disparo.
 */

const rpcMock = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: rpcMock, from: fromMock },
}));

import { useTalkXCampaignSummary } from '@/hooks/integrations/useTalkXCampaignSummary';
import type { SegmentRules } from '@/hooks/integrations/useTalkXSegments';

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }) },
    children,
  );
}

/** Recorte de exemplo (uma regra simples, formato do motor de segmentos). */
const rules: SegmentRules = {
  groups: [{ id: 'g', match: 'and', rules: [{ id: 'r', field: 'company', op: 'eq', value: 'Acme' }] }],
};

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
});

describe('useTalkXCampaignSummary — resumo da campanha calculado no servidor (X131)', () => {
  it('lê público total, elegíveis e bloqueados do servidor: elegíveis + bloqueados = total', async () => {
    // Números do mock da tela 08: 1.248 no total, 1.187 elegíveis, 61 bloqueados.
    // `matched` é maior de propósito: contato com telefone inválido / LID legado
    // não faz parte do público e não pode inflar o "Público total (estimado)".
    rpcMock.mockResolvedValue({
      data: { mode: 'count', matched: 1300, eligible: 1187, suppressed: 61, invalid_phone: 40, legacy_or_deleted: 12 },
      error: null,
    });

    const { result } = renderHook(() => useTalkXCampaignSummary({ rules }), { wrapper });

    await waitFor(() => expect(result.current.total).toBe(1248));
    expect(result.current.eligible).toBe(1187);
    expect(result.current.suppressed).toBe(61);
    expect(result.current.eligible + result.current.suppressed).toBe(result.current.total);
    expect(result.current.isError).toBe(false);
  });

  it('origem segmento com supressão devolve bloqueados > 0 (antes era sempre 0)', async () => {
    rpcMock.mockResolvedValue({
      data: { mode: 'count', matched: 200, eligible: 150, suppressed: 50 },
      error: null,
    });

    const { result } = renderHook(
      () => useTalkXCampaignSummary({ segmentIds: ['seg-1'] }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.suppressed).toBeGreaterThan(0));
    expect(result.current.suppressed).toBe(50);
    expect(result.current.total).toBe(200);
    // O recorte do segmento é resolvido pelo servidor a partir do id.
    expect(rpcMock).toHaveBeenCalledWith('talkx_resolve_audience', expect.objectContaining({
      p_segment_ids: ['seg-1'],
      p_mode: 'count',
    }));
  });

  it('não conta o público no navegador: a contagem sai só da RPC do motor', async () => {
    rpcMock.mockResolvedValue({ data: { matched: 10, eligible: 9, suppressed: 1 }, error: null });

    const { result } = renderHook(() => useTalkXCampaignSummary({ rules }), { wrapper });
    await waitFor(() => expect(result.current.total).toBe(10));

    expect(rpcMock).toHaveBeenCalledWith('talkx_resolve_audience', expect.objectContaining({
      p_rules: { groups: rules.groups },
      p_segment_ids: null,
      p_mode: 'count',
      p_limit: null,
      p_after: null,
    }));
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('erro do servidor vira estado de erro com a mensagem real', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'talkx_audience_role_required' } });

    const { result } = renderHook(() => useTalkXCampaignSummary({ rules }), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('talkx_audience_role_required');
    expect(result.current.total).toBe(0);
  });

  it('resposta ausente ou inválida do servidor nunca vira NaN na tela', async () => {
    // O servidor pode devolver jsonb sem as chaves (ou com texto): o rail tem
    // de mostrar 0, nunca "NaN" nem contagem negativa.
    rpcMock.mockResolvedValue({ data: { eligible: 'x', suppressed: -3 }, error: null });

    const invalido = renderHook(() => useTalkXCampaignSummary({ rules }), { wrapper });
    await waitFor(() => expect(invalido.result.current.isLoading).toBe(false));
    expect(invalido.result.current.total).toBe(0);
    expect(invalido.result.current.eligible).toBe(0);
    expect(invalido.result.current.suppressed).toBe(0);

    rpcMock.mockResolvedValue({ data: null, error: null });
    const vazio = renderHook(() => useTalkXCampaignSummary({ rules }), { wrapper });
    await waitFor(() => expect(vazio.result.current.isLoading).toBe(false));
    expect(vazio.result.current).toMatchObject({ total: 0, eligible: 0, suppressed: 0 });
  });

  it('isUnavailable é true quando enabled=false (crm360 ou origem sem filtro)', () => {
    const { result } = renderHook(
      () => useTalkXCampaignSummary({ rules, enabled: false }),
      { wrapper },
    );
    expect(result.current.isUnavailable).toBe(true);
    expect(result.current.total).toBe(0);
    expect(result.current.eligible).toBe(0);
    expect(result.current.suppressed).toBe(0);
    expect(result.current.isLoading).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('isUnavailable é false quando enabled=true (padrão)', () => {
    rpcMock.mockResolvedValue({ data: { eligible: 10, suppressed: 2 }, error: null });

    const { result } = renderHook(() => useTalkXCampaignSummary({ rules }), { wrapper });
    // O hook começa com isLoading=true e isUnavailable=false antes da resolução.
    expect(result.current.isUnavailable).toBe(false);
  });
});
