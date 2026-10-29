import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * N-215 — Pagamentos: sem 'copiar link' enquanto a página /pay não existe
 * e nomes nos controles.
 *
 * VERMELHO antes: o botão copiar aparecia mesmo sem a rota /pay (e chamava
 * navigator.clipboard.writeText ao clicar), o botão excluir não tinha nome
 * acessível e o seletor de método (SelectTrigger) não tinha nome.
 * VERDE depois: o botão copiar foi removido (nenhuma chamada ao clipboard
 * em nenhuma ação), o botão excluir e o seletor têm nome acessível.
 *
 * Select e Label são os REAIS (sem mock): o teste do seletor busca o
 * controle por role + nome e o axe enxerga os componentes de verdade.
 */

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/layout/PageHeader', () => ({
  PageHeader: ({ title, subtitle, actions }: { title: string; subtitle: string; actions?: React.ReactNode }) => (
    <header>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      {actions}
    </header>
  ),
}));
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock('@/components/ui/input', () => ({
  Input: (props: { [key: string]: unknown }) => <input {...props} />,
}));
vi.mock('@/components/ui/textarea', () => ({
  Textarea: (props: { [key: string]: unknown }) => <textarea {...props} />,
}));
vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
    <div {...props}>{children}</div>
  ),
  CardContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children?: React.ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
    <div {...props}>{children}</div>
  ),
  DialogHeader: ({ children }: { children?: React.ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
  DialogFooter: ({ children }: { children?: React.ReactNode }) => <footer>{children}</footer>,
}));
vi.mock('@/components/ui/alert', () => ({
  Alert: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
    <div {...props}>{children}</div>
  ),
  AlertDescription: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  AlertTitle: ({ children }: { children?: React.ReactNode }) => <h3>{children}</h3>,
}));
vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/hooks/payments/usePaymentLinks', () => ({
  usePaymentLinks: vi.fn(() => ({
    links: [
      {
        id: 'link-1',
        title: 'Plano Mensal',
        description: 'Assinatura mensal',
        amount: 99.9,
        currency: 'BRL',
        status: 'active',
        payment_method: 'pix',
        payment_url: 'https://example.com/pay/abc123',
        contact_id: null,
        paid_at: null,
        expires_at: null,
        created_at: '2026-10-10T00:00:00Z',
      },
    ],
    isLoading: false,
    isError: false,
    createLink: vi.fn(),
    deleteLink: vi.fn(),
  })),
}));

import { PaymentLinksView } from '../PaymentLinksView';
import { usePaymentLinks } from '@/hooks/payments/usePaymentLinks';

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PaymentLinksView', () => {
  it('não renderiza o botão copiar link (rota /pay inexistente)', () => {
    render(<PaymentLinksView />);
    expect(screen.queryByRole('button', { name: /copiar|copy/i })).toBeNull();
  });

  it('nenhuma ação do componente chama navigator.clipboard', async () => {
    render(<PaymentLinksView />);
    // Clica em todos os botões visíveis (inclui o excluir do link) e prova
    // que o clique passou pelo handler real sem tocar no clipboard.
    const botoes = screen.getAllByRole('button');
    expect(botoes.length).toBeGreaterThan(0);
    for (const botao of botoes) {
      fireEvent.click(botao);
    }
    const excluidores = vi
      .mocked(usePaymentLinks)
      .mock.results.map((r: { type: string; value: unknown }) => (r.value as { deleteLink: ReturnType<typeof vi.fn> }).deleteLink);
    expect(excluidores.length).toBeGreaterThan(0);
    await waitFor(() => expect(excluidores.some((m: ReturnType<typeof vi.fn>) => m.mock.calls.length > 0)).toBe(true));
    expect(writeText).not.toHaveBeenCalled();
  });

  it('botão excluir tem nome acessível (aria-label)', () => {
    render(<PaymentLinksView />);
    expect(screen.getByRole('button', { name: /excluir link de pagamento/i })).toBeInTheDocument();
  });

  it('seletor de método tem nome acessível (Label associada ao Select real)', () => {
    render(<PaymentLinksView />);
    fireEvent.click(screen.getByRole('button', { name: /novo link/i }));
    expect(screen.getByRole('combobox', { name: 'Método' })).toBeInTheDocument();
  });

  it('axe zerado — sem violações graves de acessibilidade', async () => {
    const { container } = render(<PaymentLinksView />);
    const results = await axe(container);
    expect({
      ...results,
      violations: results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious'),
    }).toHaveNoViolations();
  });
});
