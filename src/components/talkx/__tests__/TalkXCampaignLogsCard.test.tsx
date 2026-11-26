import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TalkXCampaignLogsCard } from '../analytics/TalkXCampaignLogsCard';
import type { TalkXCampaignLogRow } from '@/hooks/integrations/useTalkXCampaignLogs';

/**
 * C-11 — bloco "Log de entrega" do painel de campanha.
 *
 * O caso que o teste protege: a consulta do log exige admin/supervisor (a RPC
 * levanta 42501). Um usuário comum não pode ver "nenhuma execução" — isso
 * confundiria falta de permissão com falta de log.
 */

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const LINHA: TalkXCampaignLogRow = {
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
};

const PESSOAS = { '33333333-3333-4333-8333-333333333333': { name: 'Ana', phone: '5511999999999' } };

describe('TalkXCampaignLogsCard', () => {
  it('mostra etapa, resultado, nome do destinatário, erro traduzido e duração', () => {
    render(<TalkXCampaignLogsCard rows={[LINHA]} people={PESSOAS} />);
    expect(screen.getByText('Log de entrega')).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('5511999999999')).toBeInTheDocument();
    expect(screen.getByText('Envio')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('Falhou')).toBeInTheDocument();
    expect(screen.getByText('Número não recebe mensagem (sem WhatsApp)')).toBeInTheDocument();
    expect(screen.getByText('131026')).toBeInTheDocument();
    expect(screen.getByText('1,5 s')).toBeInTheDocument();
    expect(screen.getByText('400')).toBeInTheDocument();
  });

  it('sem nome resolvido mostra o id curto em vez de vazio', () => {
    render(<TalkXCampaignLogsCard rows={[LINHA]} />);
    expect(screen.getByText('Destinatário 33333333')).toBeInTheDocument();
  });

  it('lista vazia explica que o motor ainda não registrou nada', () => {
    render(<TalkXCampaignLogsCard rows={[]} />);
    expect(screen.getByText('Nenhuma execução registrada')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('erro da consulta vence a lista vazia', () => {
    render(<TalkXCampaignLogsCard rows={[]} isError error={new Error('talkx_admin_required')} />);
    expect(screen.getByText('Não foi possível carregar as execuções da campanha')).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma execução registrada')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('sem permissão explica o motivo e não mostra tabela nem vazio', () => {
    render(<TalkXCampaignLogsCard rows={[LINHA]} people={PESSOAS} canView={false} />);
    expect(screen.getByText('Somente administradores e supervisores podem ver por onde cada envio passou.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('Ana')).not.toBeInTheDocument();
  });

  it('permissão ainda em checagem não vira "sem permissão"', () => {
    render(<TalkXCampaignLogsCard rows={[LINHA]} people={PESSOAS} canView={undefined} />);
    expect(screen.queryByText(/Somente administradores e supervisores podem ver/)).not.toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
  });

  it('página com mais resultados oferece "Carregar mais" e avisa o pai', () => {
    const onLoadMore = vi.fn();
    render(<TalkXCampaignLogsCard rows={[LINHA]} people={PESSOAS} hasMore onLoadMore={onLoadMore} />);
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('carregando a próxima página o botão trava para não duplicar a chamada', () => {
    render(<TalkXCampaignLogsCard rows={[LINHA]} people={PESSOAS} hasMore isLoadingMore onLoadMore={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Carregar mais/ })).toBeDisabled();
  });

  it('última página avisa que o log terminou', () => {
    render(<TalkXCampaignLogsCard rows={[LINHA]} people={PESSOAS} />);
    expect(screen.getByText('Fim do log — nenhuma execução anterior.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument();
  });

  it('enquanto carrega mostra esqueleto, não o vazio', () => {
    render(<TalkXCampaignLogsCard rows={[]} isLoading />);
    expect(screen.queryByText('Nenhuma execução registrada')).not.toBeInTheDocument();
    expect(screen.getByText('Carregando execuções…')).toBeInTheDocument();
  });
});