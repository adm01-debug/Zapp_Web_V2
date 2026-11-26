import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TalkXCampaignPaceCard } from '../analytics/TalkXCampaignPaceCard';
import { paceFromServer } from '@/hooks/integrations/useTalkXCampaignPace';

/**
 * X018 — bloco "Orçamento de envio" do painel de campanha.
 *
 * O caso que o teste protege: falta de permissão (42501) não pode aparecer como
 * "nenhum envio" nem como erro genérico — o usuário comum só vê o aviso de
 * restrito, e o admin vê os dois tetos com o quanto resta.
 */

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const HOJE = paceFromServer({
  day_sent: 120,
  day_limit: 500,
  minute_sent: 6,
  minute_limit: 6,
  next_day_at: '2026-11-27T03:00:00+00:00',
  day_remaining: 380,
  minute_remaining: 0,
});

describe('TalkXCampaignPaceCard', () => {
  it('mostra os dois tetos, o enviado e o que resta', () => {
    render(<TalkXCampaignPaceCard data={HOJE} />);
    expect(screen.getByText('Orçamento de envio')).toBeInTheDocument();
    expect(screen.getByText('No último minuto')).toBeInTheDocument();
    expect(screen.getByText('Hoje')).toBeInTheDocument();
    expect(screen.getByText('Restam 0')).toBeInTheDocument();
    expect(screen.getByText('Restam 380')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText(/\/ 500/)).toBeInTheDocument();
  });

  it('a barra do minuto cheio fica em 100% e a do dia em 24%', () => {
    render(<TalkXCampaignPaceCard data={HOJE} />);
    const [minuto, dia] = screen.getAllByRole('progressbar');
    expect(minuto).toHaveAttribute('aria-valuenow', '100');
    expect(dia).toHaveAttribute('aria-valuenow', '24');
  });

  it('mostra o tempo até a cota do dia virar', () => {
    render(
      <TalkXCampaignPaceCard data={HOJE} now={new Date('2026-11-26T23:00:00.000Z')} />,
    );
    expect(screen.getByText('Renova em 4 h')).toBeInTheDocument();
  });

  it('sem permissão mostra aviso próprio em vez de "nenhum envio"', () => {
    render(<TalkXCampaignPaceCard data={HOJE} isError isForbidden />);
    expect(screen.getByTestId('talkx-campaign-pace-restrito')).toBeInTheDocument();
    expect(screen.queryAllByRole('progressbar')).toHaveLength(0);
    expect(screen.queryByText('Restam 0')).not.toBeInTheDocument();
  });

  it('erro real mostra o estado de erro com a mensagem traduzida', () => {
    render(
      <TalkXCampaignPaceCard
        data={HOJE}
        isError
        errorMessage="Não foi possível carregar o orçamento de envio."
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText('Não foi possível carregar as cotas de envio')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
  });

  it('campanha sem conexão explica, em vez de mostrar 0 de 0', () => {
    render(<TalkXCampaignPaceCard data={paceFromServer({ minute_limit: 0, day_limit: 0, next_day_at: null })} />);
    expect(screen.getByText(/Campanha sem conexão de WhatsApp vinculada/)).toBeInTheDocument();
  });

  it('carregando mostra esqueleto, sem números falsos', () => {
    render(<TalkXCampaignPaceCard data={HOJE} isLoading />);
    expect(screen.getAllByText('Calculando o que resta…')).toHaveLength(2);
    expect(screen.queryByText('Restam 380')).not.toBeInTheDocument();
  });
});