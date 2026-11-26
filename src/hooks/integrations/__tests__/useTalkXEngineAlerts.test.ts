import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * C-11/X158 — alertas abertos do motor (`public.talkx_alerts`).
 * O payload do `cron_degraded` fixado aqui é o que a função
 * `talkx_engine_alerts()` grava (migration
 * `20261009180000_pg_cron_detector_timeouts_e_falhas_seguidas.sql`).
 */
type Op = [string, unknown];

const mocks = vi.hoisted(() => {
  const calls: { table: string; ops: Op[] }[] = [];
  const state: { data: unknown; error: unknown } = { data: [], error: null };
  function builder(table: string) {
    const record = { table, ops: [] as Op[] };
    calls.push(record);
    const chain: Record<string, unknown> = {};
    chain.select = (cols: string) => { record.ops.push(['select', cols]); return chain; };
    chain.is = (col: string, value: unknown) => { record.ops.push(['is', `${col}=${String(value)}`]); return chain; };
    chain.order = (col: string, opts?: unknown) => { record.ops.push(['order', `${col}:${JSON.stringify(opts)}`]); return chain; };
    chain.limit = (n: number) => { record.ops.push(['limit', n]); return chain; };
    chain.or = (clause: string) => { record.ops.push(['or', clause]); return chain; };
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve({ data: state.data, error: state.error }).then(resolve, reject);
    return chain;
  }
  return { calls, state, builder };
});

vi.mock('@/lib/supabaseHelpers', () => ({ fromTable: (table: string) => mocks.builder(table) }));

import {
  describeEngineAlert,
  parseEngineAlerts,
  useTalkXEngineAlerts,
  ENGINE_ALERTS_LIMIT,
} from '@/hooks/integrations/useTalkXEngineAlerts';

function wrap({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

const CAMPANHA = '621521f3-e9c9-49c2-834e-cea07545d476';

beforeEach(() => {
  mocks.calls.length = 0;
  mocks.state.data = [];
  mocks.state.error = null;
});

describe('describeEngineAlert (X158)', () => {
  it('resume o payload de cron_degraded gravado pela função do motor', () => {
    expect(describeEngineAlert({
      detected_at: '2026-11-27T12:00:00Z',
      source: 'talkx_engine_health',
      reason: 'consecutive_failures',
      consecutive_failures: 3,
      timeouts: 0,
      last_return_message: 'canceling statement due to statement timeout',
    })).toBe('ciclo do motor falhando em sequência · 3 falhas seguidas · 0 timeouts · último retorno: canceling statement due to statement timeout');
  });

  it('usa o motivo de timeout por extenso', () => {
    expect(describeEngineAlert({ reason: 'timeout', timeouts: 1 }))
      .toBe('ciclo do motor sem resposta a tempo · 1 timeout');
  });

  it('não inventa detalhe para o payload mínimo {detected_at, source}', () => {
    expect(describeEngineAlert({ detected_at: '2026-11-27T12:00:00Z', source: 'talkx_engine_health' })).toBeNull();
  });

  it('ignora payload que não é objeto', () => {
    expect(describeEngineAlert(null)).toBeNull();
    expect(describeEngineAlert('timeout')).toBeNull();
    expect(describeEngineAlert(['timeout'])).toBeNull();
  });
});

describe('parseEngineAlerts (X158)', () => {
  it('traduz os kinds do CHECK com rótulo e gravidade', () => {
    const parsed = parseEngineAlerts([
      { id: 'a', kind: 'stalled_campaign', campaign_id: CAMPANHA, opened_at: '2026-11-27T12:00:00Z', payload: { detected_at: 'x', source: 'talkx_engine_health' } },
      { id: 'b', kind: 'high_failure_rate', campaign_id: null, opened_at: '2026-11-27T11:00:00Z', payload: null },
    ]);
    expect(parsed).toEqual([
      { id: 'a', kind: 'stalled_campaign', campaignId: CAMPANHA, openedAt: '2026-11-27T12:00:00Z', label: 'Campanha parada', detail: null, tone: 'warning' },
      { id: 'b', kind: 'high_failure_rate', campaignId: null, openedAt: '2026-11-27T11:00:00Z', label: 'Falhas seguidas no envio', detail: null, tone: 'danger' },
    ]);
  });

  it('mostra o kind cru quando o banco ganhar um alerta novo antes da tela', () => {
    const parsed = parseEngineAlerts([
      { id: 'c', kind: 'purge_failed', campaign_id: null, opened_at: '2026-11-27T12:00:00Z' },
      { id: 'd', kind: 'kind_novo', campaign_id: null, opened_at: '2026-11-27T12:00:00Z' },
    ]);
    expect(parsed[0].label).toBe('Expurgo de dados falhou');
    expect(parsed[0].tone).toBe('danger');
    expect(parsed[1].label).toBe('Alerta do motor (kind_novo)');
    expect(parsed[1].tone).toBe('info');
  });

  it('descarta linha sem id, kind ou opened_at', () => {
    expect(parseEngineAlerts([
      { kind: 'cron_degraded', opened_at: '2026-11-27T12:00:00Z' },
      { id: 'e', opened_at: '2026-11-27T12:00:00Z' },
      { id: 'f', kind: 'cron_degraded' },
      { id: 'g', kind: 'cron_degraded', opened_at: '2026-11-27T12:00:00Z' },
    ]).map((alert) => alert.id)).toEqual(['g']);
  });

  it('devolve lista vazia quando o banco manda outra coisa', () => {
    expect(parseEngineAlerts(undefined)).toEqual([]);
    expect(parseEngineAlerts({ id: 'x' })).toEqual([]);
  });
});

describe('useTalkXEngineAlerts (X158)', () => {
  it('lê só os alertas abertos, do mais novo para o mais antigo', async () => {
    mocks.state.data = [{ id: 'a', kind: 'stale_lease', campaign_id: null, opened_at: '2026-11-27T12:00:00Z' }];
    const { result } = renderHook(() => useTalkXEngineAlerts(), { wrapper: wrap });

    await waitFor(() => expect(result.current.alerts).toBeDefined());

    expect(mocks.calls).toHaveLength(1);
    expect(mocks.calls[0].table).toBe('talkx_alerts');
    expect(mocks.calls[0].ops).toEqual([
      ['select', 'id, kind, campaign_id, payload, opened_at'],
      ['is', 'resolved_at=null'],
      ['order', 'opened_at:{"ascending":false}'],
      ['limit', ENGINE_ALERTS_LIMIT],
    ]);
    expect(result.current.alerts).toHaveLength(1);
  });

  it('escopa para a campanha e mantém os alertas globais do motor', async () => {
    renderHook(() => useTalkXEngineAlerts(CAMPANHA), { wrapper: wrap });

    await waitFor(() => expect(mocks.calls).toHaveLength(1));
    expect(mocks.calls[0].ops).toContainEqual(['or', `campaign_id.is.null,campaign_id.eq.${CAMPANHA}`]);
  });

  it('sem campanha válida traz todos os alertas abertos (painel global)', async () => {
    renderHook(() => useTalkXEngineAlerts('sem-uuid'), { wrapper: wrap });

    await waitFor(() => expect(mocks.calls).toHaveLength(1));
    expect(mocks.calls[0].ops.map(([op]) => op)).not.toContain('or');
  });

  it('expõe o erro quando o banco recusa a consulta', async () => {
    mocks.state.error = { code: '42501' };
    const { result } = renderHook(() => useTalkXEngineAlerts(), { wrapper: wrap });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('talkx-engine-alerts: falha ao consultar talkx_alerts');
    expect(result.current.alerts).toBeUndefined();
  });
});