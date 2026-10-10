/**
 * Acessibilidade: botão de exclusão de variante tem nome acessível (aria-label).
 *
 * Defeito medido no código atual de CampaignABTesting:
 *  - o botão de excluir variante (linha 122) não tem aria-label,
 *    ficando inacessível para leitores de tela.
 *
 * A prova renderiza o componente REAL (CampaignABTesting) e verifica
 * que o botão de exclusão tem um nome acessível que identifica a variante.
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

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
  DialogFooter: ({ children }: { children?: ReactNode }) => <footer>{children}</footer>,
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, session: {}, profile: null, loading: false }),
  AuthProvider: ({ children }: { children?: ReactNode }) => children,
}));

const variantesMock = [
  {
    id: 'v-1',
    campaign_id: 'camp-1',
    variant_name: 'A',
    message_content: 'Mensagem da variante A',
    media_url: null,
    send_count: 10,
    delivered_count: 8,
    read_count: 5,
    response_count: 2,
    is_winner: false,
  },
  {
    id: 'v-2',
    campaign_id: 'camp-1',
    variant_name: 'B',
    message_content: 'Mensagem da variante B',
    media_url: null,
    send_count: 10,
    delivered_count: 9,
    read_count: 7,
    response_count: 3,
    is_winner: true,
  },
];

const mockDelete = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'campaign_ab_variants') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: variantesMock, error: null }),
            }),
          }),
          delete: mockDelete,
          update: mockUpdate,
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
        delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    }),
    functions: { invoke: vi.fn() },
    auth: {
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

import { CampaignABTesting } from '@/components/campaigns/CampaignABTesting';

describe('CampaignABTesting — acessibilidade (n-187)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('botão de excluir variante tem aria-label com o nome da variante', async () => {
    render(<CampaignABTesting campaignId="camp-1" />);

    await waitFor(() => {
      expect(screen.getByText('Variante A')).toBeInTheDocument();
    });

    const botaoExcluir = screen.getByRole('button', { name: /Excluir variante A/i });
    expect(botaoExcluir).toBeInTheDocument();
  });

  it('cada botão de excluir variante tem aria-label único com o nome da variante', async () => {
    render(<CampaignABTesting campaignId="camp-1" />);

    await waitFor(() => {
      expect(screen.getByText('Variante A')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Excluir variante A/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Excluir variante B/i })).toBeInTheDocument();
  });

  it('axe: lista de variantes sem violacoes de acessibilidade', async () => {
    const { container } = render(<CampaignABTesting campaignId="camp-1" />);

    await waitFor(() => {
      expect(screen.getByText('Variante A')).toBeInTheDocument();
    });

    // jsdom nao tem layout: `color-contrast` fica fora (mesma nota de SecurityView.a11y); o resto vale inteiro.
    expect(await axe(container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations();
  });
});
