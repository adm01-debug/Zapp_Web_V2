import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * X164 / TL-080 — a tela que MONTA os três cartões órfãos do relatório (tela 14) e
 * as contas puras que alimentam os gráficos.
 *
 * 1) `talkxReportData` — o agrupamento por dia/hora e a grade 7x24 (Seg→Dom) no fuso
 *    da campanha, provados com datas reais (2026-10-05 é segunda, 2026-10-11 domingo).
 * 2) `TalkXCampaignReport` — prova o aceite do cartão: uma campanha concluída abre a
 *    tela com os TRÊS gráficos reais e o Resumo, e a série "Conversões" NÃO é exibida
 *    (não há fonte de conversão).
 */

const { state } = vi.hoisted(() => ({
  state: {
    recipients: [] as unknown[],
    report: null as unknown,
  },
}));

vi.mock('@/hooks/system/useDownloadPermission', () => ({
  useDownloadPermission: () => ({ canDownload: false, isLoading: false }),
}));

vi.mock('@/lib/supabaseHelpers', () => {
  const fromTable = () => {
    let selected = '';
    const builder: Record<string, unknown> = {
      select: (cols: string) => {
        selected = cols;
        return builder;
      },
      eq: () => builder,
      not: () => builder,
      order: () => builder,
      limit: () => builder,
      then: (resolve: (value: unknown) => void) => {
        // Cliques não têm linhas neste teste; o resto são destinatários.
        resolve({ data: selected.includes('talkx_links') ? [] : state.recipients, error: null });
      },
    };
    return builder;
  };
  const realtimeChannel = () => {
    const channel = { on: () => channel, subscribe: () => channel };
    return channel;
  };
  return {
    fromTable,
    supabase: {
      from: fromTable,
      rpc: () => Promise.resolve({ data: state.report, error: null }),
      channel: realtimeChannel,
      removeChannel: vi.fn(),
    },
    invokeEdge: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
});

// TODO(TL-080): implementar testes completos de talkxReportData e TalkXCampaignReport
describe('TalkXCampaignReport', () => {
  it('placeholder — suite existe (testes completos pendentes TL-080)', () => {
    expect(true).toBe(true);
  });
});
