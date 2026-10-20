/**
 * Acessibilidade: barra de andamento informa a qual campanha pertence (aria-label).
 *
 * Defeito medido no código atual de CampaignsView:
 *  - a barra de progresso (linha 162) não tem aria-label,
 *    ficando inacessível para leitores de tela que não conseguem
 *    associar o percentual à campanha correta.
 *
 * A prova renderiza o componente REAL (CampaignsView) com uma
 * campanha em status 'sending' e verifica que o Progress tem
 * aria-label com o nome da campanha.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children?: ReactNode; layout?: unknown } & Record<string, unknown>) =>
      <div {...(props as object)}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children?: ReactNode }) => children,
}));

vi.mock('@/components/ui/select', async () => {
  const React = await import('react');
  return {
    Select: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    SelectTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    SelectValue: () => null,
    SelectContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children?: ReactNode; value: string }) => (
      <button type="button" data-value={value} onClick={() => {}}>{children}</button>
    ),
  };
});

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children?: ReactNode }) => <footer>{children}</footer>,
}));

const mockUpdateCampaign = { mutate: vi.fn(), isPending: false };
const mockCreateCampaign = { mutate: vi.fn(), isPending: false };
const mockDeleteCampaign = { mutate: vi.fn(), isPending: false };

const campanhaComAndamento = {
  id: 'camp-enviando',
  name: 'Campanha de Teste A/B',
  description: 'Descrição da campanha',
  status: 'sending' as const,
  total_contacts: 100,
  sent_count: 50,
  delivered_count: 45,
  read_count: 30,
  failed_count: 0,
  message_content: 'Oferta especial',
  created_at: '2026-10-01T12:00:00.000Z',
};

vi.mock('@/hooks/communication/useCampaigns', () => ({
  useCampaigns: () => ({
    campaigns: [campanhaComAndamento],
    isLoading: false,
    createCampaign: mockCreateCampaign,
    updateCampaign: mockUpdateCampaign,
    deleteCampaign: mockDeleteCampaign,
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    })),
    functions: { invoke: vi.fn() },
    auth: {
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, session: {}, profile: null, loading: false }),
  AuthProvider: ({ children }: { children?: ReactNode }) => children,
}));

import { CampaignsView } from '@/components/campaigns/CampaignsView';

describe('CampaignsView — acessibilidade da barra de andamento (n-187)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('a barra de andamento tem aria-label com o nome da campanha', async () => {
    render(<CampaignsView />);

    await waitFor(() => {
      expect(screen.getByText('Campanha de Teste A/B')).toBeInTheDocument();
    });

    const barraProgresso = screen.getByRole('progressbar');
    expect(barraProgresso).toHaveAttribute('aria-label', 'Andamento de Campanha de Teste A/B');
  });

  it('axe: campanha em sending sem violacoes de acessibilidade', async () => {
    const { container } = render(<CampaignsView />);

    await waitFor(() => {
      expect(screen.getByText('Campanha de Teste A/B')).toBeInTheDocument();
    });

    // jsdom nao tem layout: `color-contrast` fica fora (mesma nota de SecurityView.a11y).
    // `heading-order` fica fora: o h3 do cartao e pre-existente e a hierarquia de
    // cabecalhos pertence ao shell do app, que nao e montado aqui (mesmo ruido de
    // pagina do `region` em MultiplixView.painel01.test.tsx). O alvo deste teste e a
    // barra de andamento corrigida; o resto das regras vale inteiro.
    expect(
      await axe(container, {
        rules: { 'color-contrast': { enabled: false }, 'heading-order': { enabled: false } },
      }),
    ).toHaveNoViolations();
  });
});
