import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

/**
 * X041 — aceite "Relatório mostra quanto a campanha vendeu".
 *
 * O card lê `talkx_campaign_revenue` (conversões/receita/ROI) e deixa o
 * investimento editável para admin/supervisor. Produção hoje devolve
 * `investment: null` e `conversions: 0`, então a tela precisa explicar isso em
 * vez de exibir "R$ 0" como se fosse venda medida.
 */
import { TalkXCampaignRevenueCard } from '../analytics/TalkXCampaignRevenueCard';

const semInvestimento = { conversions: 0, revenue: 0, investment: null, roiPercent: null };

describe('Retorno da campanha — TalkXCampaignRevenueCard (X041)', () => {
  it('mostra conversões, receita em reais e ROI do servidor', () => {
    render(
      <TalkXCampaignRevenueCard
        data={{ conversions: 12, revenue: 4800.5, investment: 1000, roiPercent: 380.05 }}
      />,
    );

    expect(screen.getByTestId('talkx-campaign-revenue')).toBeTruthy();
    expect(screen.getByText('Conversões')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText(/4\.800,50/)).toBeTruthy();
    expect(screen.getByText('+380,1%')).toBeTruthy();
  });

  it('sem investimento, o ROI é "—" e a tela pede o investimento', () => {
    render(<TalkXCampaignRevenueCard data={semInvestimento} canEditInvestment />);

    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByText('Informe o investimento para calcular o ROI.')).toBeTruthy();
    expect(screen.getByText(/Nenhuma conversão atribuída ainda/)).toBeTruthy();
  });

  it('ROI negativo aparece com sinal', () => {
    render(
      <TalkXCampaignRevenueCard
        data={{ conversions: 1, revenue: 400, investment: 1000, roiPercent: -60 }}
      />,
    );
    expect(screen.getByText('-60%')).toBeTruthy();
  });

  it('quem não é admin vê o investimento, mas não consegue editar', () => {
    render(
      <TalkXCampaignRevenueCard
        data={{ conversions: 5, revenue: 2500, investment: 800, roiPercent: 212.5 }}
      />,
    );

    const input = screen.getByLabelText('Investimento (R$)') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(input.value).toBe('800');
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull();
    expect(screen.getByText('Somente administradores e supervisores editam o investimento.')).toBeTruthy();
  });

  it('admin digita "1.500,50" e salva 1500.5 na RPC', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(
      <TalkXCampaignRevenueCard
        data={{ conversions: 2, revenue: 3000, investment: null, roiPercent: null }}
        canEditInvestment
        onSaveInvestment={onSave}
      />,
    );

    const input = screen.getByLabelText('Investimento (R$)') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '1.500,50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(1500.5));
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Investimento salvo.');
  });

  it('valor inválido bloqueia o salvar e explica o formato', () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(
      <TalkXCampaignRevenueCard
        data={semInvestimento}
        canEditInvestment
        onSaveInvestment={onSave}
      />,
    );

    const input = screen.getByLabelText('Investimento (R$)') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '12,345' } });

    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText(/Valor inválido/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(true);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('erro de gravação aparece em aria-live (role=alert)', () => {
    render(
      <TalkXCampaignRevenueCard
        data={{ conversions: 1, revenue: 100, investment: 50, roiPercent: 100 }}
        canEditInvestment
        investmentError="Apenas administradores e supervisores podem alterar o investimento."
      />,
    );

    expect(screen.getByRole('alert').textContent)
      .toBe('Apenas administradores e supervisores podem alterar o investimento.');
  });

  it('falha ao carregar mostra erro com ação de tentar novamente', () => {
    const onRetry = vi.fn();
    render(<TalkXCampaignRevenueCard data={semInvestimento} isError onRetry={onRetry} />);

    expect(screen.getByText(/conversões da campanha/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/i }));
    expect(onRetry).toHaveBeenCalled();
  });
});
