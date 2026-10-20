/**
 * R2-MOD-005 / item 387 — a campanha do módulo Campaigns Clássicas aparece
 * "pronta" mesmo sem audiência: iniciar só trocava o status para `sending` e a
 * linha passava a mostrar "Enviando" sem nenhum contato materializado.
 *
 * Prova (vermelho antes / verde depois): sem audiência (0 contatos) o iniciar
 * é apresentado como indisponível e NÃO troca o status; com audiência
 * materializada ele segue funcionando.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children?: ReactNode }) => children,
}));

vi.mock('@/components/ui/select', async () => {
  const React = await import('react');
  return {
    Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  };
});

const atualizarCampanha = { mutate: vi.fn() };

const campanhaExposta = {
  atual: [
    {
      id: 'c-sem-audiencia',
      name: 'Promo sem público',
      description: 'criada com etiqueta e sem audiência',
      status: 'draft',
      total_contacts: 0,
      sent_count: 0,
      delivered_count: 0,
      read_count: 0,
      failed_count: 0,
      message_content: 'Ofertas',
      created_at: '2026-10-06T12:00:00.000Z',
    },
  ],
};

vi.mock('@/hooks/communication/useCampaigns', () => ({
  useCampaigns: () => ({
    campaigns: campanhaExposta.atual,
    isLoading: false,
    createCampaign: { mutate: vi.fn(), isPending: false },
    updateCampaign: atualizarCampanha,
    deleteCampaign: { mutate: vi.fn() },
  }),
}));

import { CampaignsView } from '@/components/campaigns/CampaignsView';

describe('CampaignsView — iniciar exige audiência materializada (R2-MOD-005)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    campanhaExposta.atual = [{
      id: 'c-sem-audiencia',
      name: 'Promo sem público',
      description: 'criada com etiqueta e sem audiência',
      status: 'draft',
      total_contacts: 0,
      sent_count: 0,
      delivered_count: 0,
      read_count: 0,
      failed_count: 0,
      message_content: 'Ofertas',
      created_at: '2026-10-06T12:00:00.000Z',
    }];
  });

  it('sem audiência: iniciar aparece indisponível e não troca o status', () => {
    render(<CampaignsView />);

    expect(screen.getByText(/sem audiência materializada: não há para quem iniciar o envio/i)).toBeInTheDocument();

    const iniciar = screen.getByRole('button', { name: /iniciar campanha indisponível/i });
    expect(iniciar).toBeDisabled();
    fireEvent.click(iniciar);
    expect(atualizarCampanha.mutate).not.toHaveBeenCalled();
  });

  it('audiência nula: iniciar também fica indisponível e não troca o status', () => {
    campanhaExposta.atual = [{ ...campanhaExposta.atual[0], id: 'c-audiencia-nula', total_contacts: null as unknown as number }];
    render(<CampaignsView />);

    expect(screen.getByText(/sem audiência materializada: não há para quem iniciar o envio/i)).toBeInTheDocument();

    const iniciar = screen.getByRole('button', { name: /iniciar campanha indisponível/i });
    expect(iniciar).toBeDisabled();
    fireEvent.click(iniciar);
    expect(atualizarCampanha.mutate).not.toHaveBeenCalled();
  });

  it('com audiência materializada: iniciar continua disponível e envia o status', () => {
    campanhaExposta.atual = [{ ...campanhaExposta.atual[0], id: 'c-com-audiencia', total_contacts: 42 }];
    render(<CampaignsView />);

    const iniciar = screen.getByRole('button', { name: /^iniciar campanha$/i });
    expect(iniciar).toBeEnabled();
    expect(screen.queryByText(/sem audiência materializada/i)).not.toBeInTheDocument();

    fireEvent.click(iniciar);
    expect(atualizarCampanha.mutate).toHaveBeenCalledWith({ id: 'c-com-audiencia', status: 'sending' });
  });
});
