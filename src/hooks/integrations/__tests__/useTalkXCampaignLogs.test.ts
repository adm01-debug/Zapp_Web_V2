import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));
vi.mock('@/lib/supabaseHelpers', () => ({ fromTable: vi.fn() }));

import {
  TALKX_CAMPAIGN_LOG_PAGE_SIZE,
  describeLogError,
  fetchTalkXCampaignLogPage,
  formatLogDuration,
  logRowFromServer,
  nextLogCursor,
  outcomeLabel,
  outcomeTone,
  stageLabel,
  useTalkXCampaignLogs,
  type TalkXCampaignLogRow,
} from '@/hooks/integrations/useTalkXCampaignLogs';
import { supabase } from '@/integrations/supabase/client';
import { fromTable } from '@/lib/supabaseHelpers';

const rpcMock = supabase.rpc as unknown as ReturnType<typeof vi.fn>;
const fromTableMock = fromTable as unknown as ReturnType<typeof vi.fn>;

function linhaCrua(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    campaign_id: '22222222-2222-4222-8222-222222222222',
    recipient_id: '33333333-3333-4333-8333-333333333333',
    attempt: 2,
    stage: 'dispatch',
    outcome: 'failed',
    http_status: 400,
    error_code: '131026',
    worker_id: 'worker-1',
    duration_ms: 1520,
    created_at: '2026-11-26T10:00:00.000Z',
    ...overrides,
  };
}

function paginaCheia(deslocamento: number): TalkXCampaignLogRow[] {
  return Array.from({ length: TALKX_CAMPAIGN_LOG_PAGE_SIZE }).map((_, i) => ({
    id: `44444444-4444-4444-8444-${String(deslocamento + i).padStart(12, '0')}`,
    campaignId: '22222222-2222-4222-8222-222222222222',
    recipientId: '33333333-3333-4333-8333-333333333333',
    attempt: 1,
    stage: 'dispatch',
    outcome: 'sent',
    httpStatus: 200,
    errorCode: null,
    workerId: null,
    durationMs: 120,
    createdAt: `2026-11-26T10:00:${String(i % 60).padStart(2, '0')}.000Z`,
  }));
}

function wrap({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  rpcMock.mockReset();
  fromTableMock.mockReset();
  fromTableMock.mockReturnValue({ select: () => ({ in: async () => ({ data: [], error: null }) }) });
});

describe('logRowFromServer', () => {
  it('mapeia a linha da RPC para o contrato da tela', () => {
    expect(logRowFromServer(linhaCrua())).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      campaignId: '22222222-2222-4222-8222-222222222222',
      recipientId: '33333333-3333-4333-8333-333333333333',
      attempt: 2,
      stage: 'dispatch',
      outcome: 'failed',
      httpStatus: 400,
      errorCode: '131026',
      workerId: 'worker-1',
      durationMs: 1520,
      createdAt: '2026-11-26T10:00:00.000Z',
    });
  });

  it('descarta linha sem id ou sem created_at em vez de renderizar lixo', () => {
    expect(logRowFromServer(linhaCrua({ id: null }))).toBeNull();
    expect(logRowFromServer(linhaCrua({ created_at: undefined }))).toBeNull();
    expect(logRowFromServer(null)).toBeNull();
  });

  it('normaliza campos opcionais vazios e negativos', () => {
    const linha = logRowFromServer(linhaCrua({
      attempt: -3, error_code: '  ', worker_id: '', http_status: null, duration_ms: '250.5',
    }));
    expect(linha?.attempt).toBe(0);
    expect(linha?.errorCode).toBeNull();
    expect(linha?.workerId).toBeNull();
    expect(linha?.httpStatus).toBeNull();
    expect(linha?.durationMs).toBe(250.5);
  });
});

describe('nextLogCursor', () => {
  it('sem página cheia não existe próxima página', () => {
    expect(nextLogCursor([paginaCheia(1)[0]])).toBeNull();
  });

  it('página cheia aponta para created_at + id da última linha (cursor composto)', () => {
    const linhas = paginaCheia(1);
    const cursor = nextLogCursor(linhas);
    expect(cursor).toEqual({ after: linhas[linhas.length - 1].createdAt, afterId: linhas[linhas.length - 1].id });
  });
});

describe('rótulos do log', () => {
  it('traduz etapas e resultados conhecidos e preserva desconhecidos', () => {
    expect(stageLabel('suppress_check')).toBe('Checagem de bloqueio');
    expect(stageLabel('etapa_nova')).toBe('etapa_nova');
    expect(stageLabel(null)).toBe('—');
    expect(outcomeLabel('outcome_unknown')).toBe('Sem confirmação');
    expect(outcomeLabel('desconhecido')).toBe('desconhecido');
  });

  it('só pinta de verde o que foi enviado e de vermelho o que falhou', () => {
    expect(outcomeTone('sent')).toBe('text-dash-green');
    expect(outcomeTone('failed')).toBe('text-dash-red');
    expect(outcomeTone('skipped')).toBe('text-foreground-secondary');
  });

  it('traduz códigos conhecidos e mantém o número cru quando não conhece', () => {
    expect(describeLogError('131026')).toBe('Número não recebe mensagem (sem WhatsApp)');
    expect(describeLogError('talkx_admin_required')).toBe('Somente administradores e supervisores');
    expect(describeLogError('999999')).toBe('999999');
    expect(describeLogError(null)).toBeNull();
  });

  it('formata duração em ms e em segundos', () => {
    expect(formatLogDuration(null)).toBe('—');
    expect(formatLogDuration(0)).toBe('0 ms');
    expect(formatLogDuration(850)).toBe('850 ms');
    expect(formatLogDuration(1520)).toBe('1,5 s');
  });
});

describe('fetchTalkXCampaignLogPage', () => {
  it('primeira página não manda cursor e pede o limite da tela', async () => {
    rpcMock.mockResolvedValue({ data: [linhaCrua()], error: null });
    const pagina = await fetchTalkXCampaignLogPage('campanha-1', null);
    expect(rpcMock).toHaveBeenCalledWith('talkx_campaign_logs', {
      p_campaign_id: 'campanha-1',
      p_limit: TALKX_CAMPAIGN_LOG_PAGE_SIZE,
    });
    expect(pagina.rows).toHaveLength(1);
    expect(pagina.nextCursor).toBeNull();
  });

  it('página seguinte reenvia o cursor composto inteiro', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    await fetchTalkXCampaignLogPage('campanha-1', { after: '2026-11-26T10:00:00.000Z', afterId: 'id-9' });
    const [, args] = rpcMock.mock.calls[0];
    expect(args).toMatchObject({
      p_campaign_id: 'campanha-1',
      p_after: '2026-11-26T10:00:00.000Z',
      p_after_id: 'id-9',
    });
  });

  it('propaga o erro da RPC (o 42501 precisa chegar na tela)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'talkx_admin_required', code: '42501' } });
    await expect(fetchTalkXCampaignLogPage('campanha-1', null)).rejects.toMatchObject({ code: '42501' });
  });

  it('resposta que não é lista vira página vazia', async () => {
    rpcMock.mockResolvedValue({ data: { rows: [] }, error: null });
    const pagina = await fetchTalkXCampaignLogPage('campanha-1', null);
    expect(pagina.rows).toEqual([]);
    expect(pagina.nextCursor).toBeNull();
  });
});

describe('useTalkXCampaignLogs', () => {
  it('carrega a primeira página e "carregar mais" anexa a seguinte pelo cursor', async () => {
    const primeira = paginaCheia(1);
    const segunda = paginaCheia(201).slice(0, 3);
    rpcMock
      .mockResolvedValueOnce({ data: primeira.map((r) => linhaCrua({ id: r.id, created_at: r.createdAt })), error: null })
      .mockResolvedValueOnce({ data: segunda.map((r) => linhaCrua({ id: r.id, created_at: r.createdAt })), error: null });

    const { result } = renderHook(() => useTalkXCampaignLogs('campanha-1'), { wrapper: wrap });

    await waitFor(() => expect(result.current.rows).toHaveLength(TALKX_CAMPAIGN_LOG_PAGE_SIZE));
    expect(result.current.hasMore).toBe(true);

    result.current.loadMore();
    await waitFor(() => expect(result.current.rows).toHaveLength(TALKX_CAMPAIGN_LOG_PAGE_SIZE + 3));
    // A segunda chamada usou o cursor da ÚLTIMA linha da primeira página.
    expect(rpcMock.mock.calls[1][1]).toMatchObject({
      p_after: primeira[primeira.length - 1].createdAt,
      p_after_id: primeira[primeira.length - 1].id,
    });
    expect(result.current.hasMore).toBe(false);
  });

  it('sem campanha selecionada não chama a RPC', async () => {
    const { result } = renderHook(() => useTalkXCampaignLogs(null), { wrapper: wrap });
    await waitFor(() => expect(result.current.rows).toEqual([]));
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('resolve o nome dos destinatários da página carregada', async () => {
    rpcMock.mockResolvedValue({ data: [linhaCrua()], error: null });
    fromTableMock.mockReturnValue({
      select: () => ({ in: async () => ({ data: [{ id: '33333333-3333-4333-8333-333333333333', contacts: { name: 'Ana', phone: '5511999999999' } }], error: null }) }),
    });
    const { result } = renderHook(() => useTalkXCampaignLogs('campanha-1'), { wrapper: wrap });
    await waitFor(() => expect(result.current.people['33333333-3333-4333-8333-333333333333']).toEqual({ name: 'Ana', phone: '5511999999999' }));
  });
});