import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

/**
 * X047d — matriz de estados, linha da tela Agendada.
 *
 * A tela Agendada recebe só o `campaignId` e deriva a campanha da consulta de
 * campanhas do `useTalkX`. Antes desta correção, quando a consulta FALHAVA o
 * componente fazia `campaigns.find(...)` sobre a lista vazia, não encontrava
 * nada e devolvia `null`: a tela ficava em branco, sem dizer que houve falha,
 * sem retry e sem distinção entre "falhou" e "não existe".
 *
 * Contrato fixado aqui (a decisão da X047): quem decide é o
 * `TalkXQueryBoundary`, na ordem carregando -> erro -> vazio -> conteúdo; o erro
 * VENCE o vazio, e o retry do erro chama o refetch da consulta mantendo a mesma
 * campanha aberta.
 */

type QueryState = {
  campaigns: Array<Record<string, unknown>>;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isFetching: boolean;
};

const h = vi.hoisted(() => ({
  state: {
    campaigns: [] as Array<Record<string, unknown>>,
    isLoading: false,
    isError: false,
    error: null as Error | null,
    isFetching: false,
  } as QueryState,
  refetchCampaigns: vi.fn(),
  onBack: vi.fn(),
  onEdit: vi.fn(),
  onStatusChange: vi.fn(),
}));

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: h.state.campaigns,
    isLoading: h.state.isLoading,
    isError: h.state.isError,
    error: h.state.error,
    isFetching: h.state.isFetching,
    refetchCampaigns: h.refetchCampaigns,
    updateCampaign: { mutateAsync: vi.fn() },
    startCampaign: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { TalkXCampaignScheduled } from '../TalkXCampaignScheduled';

const BASE_CAMPAIGN = {
  id: 'camp-agendada-1',
  name: 'Promoção de Outubro',
  message_template: 'Olá {{nome}}, chegou a promoção!',
  variables_config: [],
  typing_delay_min: 1500,
  typing_delay_max: 4000,
  send_interval_min: 8000,
  send_interval_max: 20000,
  status: 'scheduled',
  total_recipients: 1200,
  sent_count: 0,
  failed_count: 0,
  delivered_count: 0,
  whatsapp_connection_id: 'conn-1',
  created_by: 'user-1',
  started_at: null,
  completed_at: null,
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T10:00:00.000Z',
  media_url: null,
  media_type: null,
  scheduled_at: '2026-12-01T15:00:00.000Z',
  schedule_timezone: 'America/Sao_Paulo',
  send_window_start: null,
  send_window_end: null,
  business_hours_only: false,
  speed_profile: 'moderate',
  revision: 1,
};

function setQueryState(over: Partial<QueryState>) {
  h.state = {
    campaigns: [],
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    ...over,
  };
}

function view() {
  return (
    <TalkXCampaignScheduled
      campaignId="camp-agendada-1"
      onBack={h.onBack}
      onEdit={h.onEdit}
      onStatusChange={h.onStatusChange}
    />
  );
}

describe('matriz de estados — TalkXCampaignScheduled (X047d)', () => {
  beforeEach(() => {
    h.refetchCampaigns.mockClear();
    h.onBack.mockClear();
    h.onEdit.mockClear();
    h.onStatusChange.mockClear();
  });

  it('consulta com erro: mostra "Não foi possível carregar" e NÃO o vazio nem conteúdo parcial', () => {
    setQueryState({ isError: true, error: new Error('falha exclusiva X047d') });
    const { container } = render(view());

    expect(screen.getByText(/Não foi possível carregar/)).toBeTruthy();
    expect(container.querySelector('[data-talkx-query="empty"]')).toBeNull();
    expect(container.querySelector('[data-talkx-query="content"]')).toBeNull();
    // nada de editor pela metade (nome, resumo, "Agendada para")
    expect(screen.queryByText(/Agendada para/)).toBeNull();
    expect(screen.queryByText(/Promoção de Outubro/)).toBeNull();
  });

  it('consulta com erro: não anuncia carregamento', () => {
    setQueryState({ isError: true, error: new Error('falha exclusiva X047d') });
    const { container } = render(view());

    expect(container.querySelector('[data-talkx-query="loading"]')).toBeNull();
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('"Tentar novamente" chama o refetch e mantém a campanha aberta ao recuperar', () => {
    setQueryState({ isError: true, error: new Error('falha temporária X047d') });
    const rendered = render(view());

    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/i }));

    expect(h.refetchCampaigns).toHaveBeenCalledTimes(1);
    // o retry não joga o operador para fora da campanha
    expect(h.onBack).not.toHaveBeenCalled();

    // a consulta volta com a MESMA campanha: o editor reabre com ela
    setQueryState({ campaigns: [BASE_CAMPAIGN] });
    rendered.rerender(view());

    expect(screen.getByText(/Agendada para/)).toBeTruthy();
    expect(h.onStatusChange).not.toHaveBeenCalled();
  });

  it('carregando pela primeira vez: esqueleto com aria-busy e sem conteúdo', () => {
    setQueryState({ isLoading: true });
    const { container } = render(view());

    expect(container.querySelector('[data-talkx-query="loading"]')).toBeTruthy();
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(container.querySelector('[data-talkx-query="content"]')).toBeNull();
    expect(screen.queryByText(/Agendada para/)).toBeNull();
  });

  it('refetch em andamento: conteúdo continua aberto e marcado com aria-busy', () => {
    setQueryState({ campaigns: [BASE_CAMPAIGN], isFetching: true });
    const { container } = render(view());

    expect(screen.getByText(/Agendada para/)).toBeTruthy();
    const content = container.querySelector('[data-talkx-query="content"]') as HTMLElement;
    expect(content).toBeTruthy();
    expect(content.getAttribute('aria-busy')).toBe('true');
  });

  it('sem erro e sem a campanha: mostra o vazio (e não o erro)', () => {
    setQueryState({ campaigns: [] });
    const { container } = render(view());

    expect(container.querySelector('[data-talkx-query="empty"]')).toBeTruthy();
    expect(screen.queryByText(/Não foi possível carregar/)).toBeNull();
    expect(container.querySelector('[data-talkx-query="content"]')).toBeNull();
  });
});
