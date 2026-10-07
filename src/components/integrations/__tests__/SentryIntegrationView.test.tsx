/**
 * R2-API-047 (item 221) — ACTIVE_REGRESSION: a tela do Sentry anunciava monitoramento ativo
 * ("Sentry conectado com sucesso!") a partir de qualquer DSN não vazio, e apresentava estatísticas
 * fixas (crash-free 99.2%) e uma lista de issues de exemplo como se fossem do ambiente — sem SDK,
 * DSN validado, persistência ou API de métricas. Este teste prova que a ativação é recusada (nenhum
 * estado "Ativo") e que nenhuma métrica sintética é apresentada como dado operacional.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children }: { children?: import('react').ReactNode }) => <div>{children}</div>,
  },
}));

// O hub também renderiza o cartão do Gmail, que depende deste hook.
vi.mock('@/hooks/integrations/useGmail', () => ({
  useGmail: () => ({
    activeAccount: null,
    disconnectGmail: { mutate: vi.fn() },
    syncInbox: { mutate: vi.fn(), isPending: false },
    connectGmail: { mutate: vi.fn(), isPending: false },
  }),
}));

import { SentryIntegrationView } from '@/components/integrations/SentryIntegrationView';
import { IntegrationsHub } from '@/components/integrations/IntegrationsHub';
import { toast } from 'sonner';

const botaoAtivar = () => screen.getByRole('button', { name: /ativar monitoramento/i });

describe('SentryIntegrationView (R2-API-047)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('se apresenta como demonstração, sem declarar monitoramento ativo', () => {
    render(<SentryIntegrationView />);

    expect(screen.getByText(/funcionalidade em demonstração/i)).toBeInTheDocument();
    expect(screen.getByText('Demonstração')).toBeInTheDocument();
    expect(screen.queryByText('Ativo')).not.toBeInTheDocument();
    expect(botaoAtivar()).toBeDisabled();
  });

  it('recusa a ativação e não exibe métricas sintéticas como dados do ambiente', () => {
    render(<SentryIntegrationView />);

    fireEvent.change(screen.getByPlaceholderText(/sentry\.io/i), {
      target: { value: 'https://exemplo-dsn@sentry.io/42' },
    });
    fireEvent.click(botaoAtivar());

    expect(screen.queryByText('Ativo')).not.toBeInTheDocument();
    expect(screen.queryByText('99.2%')).not.toBeInTheDocument();
    expect(screen.queryByText('Crash-free')).not.toBeInTheDocument();
    expect(screen.queryByText('Não resolvidos')).not.toBeInTheDocument();
    expect(screen.queryByText(/Cannot read properties of undefined/)).not.toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('o hub de integrações deixa de anunciar o Sentry como disponível', () => {
    render(<IntegrationsHub />);

    const cartaoSentry = screen.getByText('Sentry').closest('.rounded-2xl');
    expect(cartaoSentry).not.toBeNull();
    expect(within(cartaoSentry as HTMLElement).getByText('Demonstração')).toBeInTheDocument();
  });
});
