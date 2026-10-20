/**
 * N-152 — FollowUpSequences: botões e switch sem nome acessível.
 *
 * Três controles sem `aria-label` (linhas 160, 216, 231 do arquivo original):
 *  - Botão "remover passo" (ícone lixeira) — sem nome para leitor de tela
 *  - Switch "ativar" sequência — sem nome para leitor de tela
 *  - Botão "excluir sequência" (ícone lixeira) — sem nome para leitor de tela
 *
 * A correção adiciona `aria-label` nos três controles com o número do passo
 * e o nome da sequência para unicidade.
 * O teste renderiza o componente REAL com dados sintéticos e prova:
 *  1) cada controle tem o aria-label correto (específico)
 *  2) nenhuma violação de acessibilidade (axe) nos elementos interativos
 *
 * Dados 100% sintéticos — nenhum nome real de contato ou sequência.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FollowUpSequences } from '../FollowUpSequences';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: async () => ({
          data: [
            {
              id: 'seq-sintetico-001',
              name: 'Sequência de boas-vindas',
              is_active: true,
              trigger_event: 'lead_entered',
              followup_steps: [
                { id: 'step-1', step_order: 1, delay_hours: 24, message_template: 'Olá {name}!' },
                { id: 'step-2', step_order: 2, delay_hours: 168, message_template: 'Como está?' },
              ],
            },
          ],
          error: null,
        }),
      }),
    }),
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'u-sintetico-001' } }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/ui/use-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/settings/FollowUpExecutionsHistory', () => ({
  FollowUpExecutionsHistory: () => null,
}));

vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('FollowUpSequences — acessibilidade dos controles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('botão remover passo tem aria-label com número do passo', async () => {
    render(<FollowUpSequences />, { wrapper });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Nova Sequência' })).toBeInTheDocument();
    });
    screen.getByRole('button', { name: 'Nova Sequência' }).click();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Remover passo 1' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Remover passo 2' })).toBeInTheDocument();
    });
  });

  it('switch ativar sequência tem aria-label com nome da sequência', async () => {
    render(<FollowUpSequences />, { wrapper });
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Ativar Sequência de boas-vindas' })).toBeInTheDocument();
    });
  });

  it('botão excluir sequência tem aria-label com nome da sequência', async () => {
    render(<FollowUpSequences />, { wrapper });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Excluir sequência Sequência de boas-vindas' })).toBeInTheDocument();
    });
  });

  it('nenhuma violação de acessibilidade nos controles interativos', async () => {
    const { container } = render(<FollowUpSequences />, { wrapper });
    await waitFor(() => {
      expect(screen.getByRole('switch')).toBeInTheDocument();
    });
    const result = await axe(container);
    expect(result.violations).toHaveLength(0);
  });
});