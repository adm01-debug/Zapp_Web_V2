/**
 * ACTIVE_REGRESSION — a tela do n8n anunciava sucesso simulado: "Conectado ao n8n com sucesso!" a partir
 * de qualquer URL não vazia e "Webhook testado com sucesso!" depois de um `setTimeout`, sem servidor n8n,
 * webhook real, persistência ou validação de URL. Este teste prova que a tela não oferece conectar nem
 * testar e declara explicitamente que a integração não está disponível.
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

import { N8nIntegrationView } from '@/components/integrations/N8nIntegrationView';
import { IntegrationsHub } from '@/components/integrations/IntegrationsHub';
import { toast } from 'sonner';

describe('N8nIntegrationView — sem sucesso simulado', () => {
  beforeEach(() => vi.clearAllMocks());

  it('declara a integração indisponível e não assume o estado "Conectado"', () => {
    render(<N8nIntegrationView />);

    expect(screen.getByText('Integração não disponível nesta versão')).toBeInTheDocument();
    expect(screen.queryByText('Conectado')).not.toBeInTheDocument();
    expect(screen.queryByText(/conectado ao n8n com sucesso/i)).not.toBeInTheDocument();
  });

  it('não oferece conectar nem testar webhook', () => {
    render(<N8nIntegrationView />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByPlaceholderText(/n8n/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/workflows configurados/i)).not.toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('o hub abre a tela do n8n marcada como demonstração, sem sucesso falso', () => {
    render(<IntegrationsHub />);

    const cartaoN8n = screen.getByText('n8n').closest('.rounded-2xl');
    expect(cartaoN8n).not.toBeNull();
    expect(within(cartaoN8n as HTMLElement).getByText('Demonstração')).toBeInTheDocument();

    fireEvent.click(within(cartaoN8n as HTMLElement).getByRole('button', { name: /configurar/i }));

    expect(screen.getByText('Integração não disponível nesta versão')).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
