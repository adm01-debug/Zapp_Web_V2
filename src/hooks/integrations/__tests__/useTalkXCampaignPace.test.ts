import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));

import { supabase } from '@/integrations/supabase/client';
import {
  describeNextReset,
  describePaceError,
  isEmptyPace,
  isPaceForbidden,
  paceFromServer,
  paceUsagePercent,
  useTalkXCampaignPace,
} from '@/hooks/integrations/useTalkXCampaignPace';

/**
 * X018 — orçamento de envio da campanha. Estes testes fixam a tradução do jsonb
 * real de `talkx_campaign_pace` (conferido em produção em 2026-11-26:
 * `{minute_limit, minute_sent, minute_remaining, day_limit, day_sent,
 * day_remaining, next_day_at}`) e o caminho de permissão (42501
 * `talkx_campaign_role_required`), que antes do fix virava
 * `service_role_required` para todo admin.
 */

const rpcMock = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

function wrap({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('paceFromServer (X018)', () => {
  it('lê o payload real da RPC', () => {
    expect(paceFromServer({
      day_sent: 0,
      day_limit: 500,
      minute_sent: 0,
      next_day_at: '2026-11-27T03:00:00+00:00',
      minute_limit: 6,
      day_remaining: 500,
      minute_remaining: 6,
    })).toEqual({
      minuteLimit: 6,
      minuteSent: 0,
      minuteRemaining: 6,
      dayLimit: 500,
      daySent: 0,
      dayRemaining: 500,
      nextDayAt: '2026-11-27T03:00:00.000Z',
    });
  });

  it('contas como string e decimais não viram NaN', () => {
    const out = paceFromServer({
      minute_limit: '6', minute_sent: '6', day_limit: '500', day_sent: '12.9',
      next_day_at: null,
    });
    expect(out.minuteSent).toBe(6);
    expect(out.daySent).toBe(12);
    expect(out.nextDayAt).toBeNull();
  });

  it('sem *_remaining o saldo é calculado do teto menos o enviado', () => {
    const out = paceFromServer({ minute_limit: 6, minute_sent: 2, day_limit: 500, day_sent: 500 });
    expect(out.minuteRemaining).toBe(4);
    expect(out.dayRemaining).toBe(0);
  });

  it('nada sai negativo nem acima do teto', () => {
    const out = paceFromServer({
      minute_limit: 6, minute_sent: 9, minute_remaining: -3,
      day_limit: 500, day_sent: 700, day_remaining: -200,
    });
    expect(out.minuteRemaining).toBe(0);
    expect(out.dayRemaining).toBe(0);
  });

  it('payload vazio, nulo ou inválido devolve orçamento zerado', () => {
    const zero = {
      minuteLimit: 0, minuteSent: 0, minuteRemaining: 0,
      dayLimit: 0, daySent: 0, dayRemaining: 0, nextDayAt: null,
    };
    expect(paceFromServer(null)).toEqual(zero);
    expect(paceFromServer({ minute_limit: 'abc', next_day_at: 'não é data' })).toEqual(zero);
  });
});

describe('isEmptyPace (X018)', () => {
  it('campanha sem conexão devolve tudo zerado', () => {
    expect(isEmptyPace(paceFromServer({ minute_limit: 0, day_limit: 0, next_day_at: null }))).toBe(true);
  });

  it('campanha com teto não é vazia mesmo sem envios', () => {
    expect(isEmptyPace(paceFromServer({ minute_limit: 6, day_limit: 500 }))).toBe(false);
  });
});

describe('permissão e erros (X018)', () => {
  it('reconhece o 42501 da RPC', () => {
    expect(isPaceForbidden('talkx_campaign_role_required')).toBe(true);
    expect(isPaceForbidden('service_role_required')).toBe(false);
    expect(isPaceForbidden(null)).toBe(false);
  });

  it('traduz os erros do servidor para a tela', () => {
    expect(describePaceError('talkx_campaign_role_required'))
      .toBe('Apenas administradores e supervisores veem o orçamento de envio.');
    expect(describePaceError('service_role_required'))
      .toBe('O servidor ainda exige service_role para ler o orçamento desta campanha.');
    expect(describePaceError('talkx_campaign_not_found'))
      .toBe('Campanha não encontrada — atualize a tela e tente de novo.');
    expect(describePaceError(null)).toBe('Não foi possível carregar o orçamento de envio.');
    expect(describePaceError('boom')).toBe('Não foi possível carregar o orçamento de envio.');
  });
});

describe('paceUsagePercent (X018)', () => {
  it('mede o quanto do teto já foi usado', () => {
    expect(paceUsagePercent(0, 6)).toBe(0);
    expect(paceUsagePercent(3, 6)).toBe(50);
    expect(paceUsagePercent(6, 6)).toBe(100);
    expect(paceUsagePercent(9, 6)).toBe(100);
    expect(paceUsagePercent(5, 500)).toBe(1);
  });

  it('teto zero não divide por zero', () => {
    expect(paceUsagePercent(3, 0)).toBe(0);
  });
});

describe('describeNextReset (X018)', () => {
  const now = new Date('2026-11-26T23:00:00.000Z');

  it('mostra quanto falta para a cota do dia virar', () => {
    expect(describeNextReset('2026-11-27T03:00:00.000Z', now)).toBe('Renova em 4 h');
    expect(describeNextReset('2026-11-26T23:30:00.000Z', now)).toBe('Renova em 30 min');
    expect(describeNextReset('2026-11-27T00:15:00.000Z', now)).toBe('Renova em 1 h 15 min');
  });

  it('sem conexão ou já vencido não inventa contagem', () => {
    expect(describeNextReset(null, now)).toBe('Sem conexão vinculada');
    expect(describeNextReset('2026-11-26T22:00:00.000Z', now)).toBe('Renova a qualquer momento');
    expect(describeNextReset('lixo', now)).toBe('Sem conexão vinculada');
  });
});

describe('useTalkXCampaignPace (X018)', () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it('chama a RPC com o id da campanha e devolve o orçamento', async () => {
    rpcMock.mockResolvedValue({
      data: { minute_limit: 6, minute_sent: 1, day_limit: 500, day_sent: 10, next_day_at: '2026-11-27T03:00:00+00:00' },
      error: null,
    });
    const { result } = renderHook(() => useTalkXCampaignPace('campanha-1'), { wrapper: wrap });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(rpcMock).toHaveBeenCalledWith('talkx_campaign_pace', { p_campaign_id: 'campanha-1' });
    expect(result.current.minuteSent).toBe(1);
    expect(result.current.dayRemaining).toBe(490);
    expect(result.current.isForbidden).toBe(false);
  });

  it('42501 vira "restrito" com mensagem própria, não erro genérico', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'talkx_campaign_role_required', code: '42501' },
    });
    const { result } = renderHook(() => useTalkXCampaignPace('campanha-1'), { wrapper: wrap });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isForbidden).toBe(true);
    expect(result.current.errorMessage).toBe('Apenas administradores e supervisores veem o orçamento de envio.');
  });

  it('sem campanha selecionada não consulta o servidor', () => {
    const { result } = renderHook(() => useTalkXCampaignPace(null), { wrapper: wrap });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.dayLimit).toBe(0);
  });
});