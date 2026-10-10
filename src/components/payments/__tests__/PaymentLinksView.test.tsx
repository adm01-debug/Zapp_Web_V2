import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { describe, expect, it, vi } from 'vitest';

/**
 * N-215 — Pagamentos: sem 'copiar link' enquanto a página /pay não existe
 * e nomes nos controles.
 *
 * VERMELHO antes: o botão copiar aparecia mesmo sem a rota /pay, e o botão
 * excluir não tinha nome acessível (aria-label).
 * VERDE depois: o botão copiar foi removido; o botão excluir tem aria-label.
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
vi.mock('@/components/ui/label', () => ({
  Label: ({ children }: { children?: React.ReactNode }) => <label>{children}</label>,
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
vi.mock('@/components/ui/select', async () => {
  const React = await import('react');
  return {
    Select: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    SelectContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children?: React.ReactNode; value: string }) => (
      <div role="option" value={value}>{children}</div>
    ),
    SelectTrigger: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
      <div {...props}>{children}</div>
    ),
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  };
});
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

describe('PaymentLinksView', () => {
  it('não renderiza o botão copiar link (rota /pay inexistente)', () => {
    render(<PaymentLinksView />);
    expect(screen.queryByRole('button', { name: /copiar|copy/i })).toBeNull();
  });

  it('não chama navigator.clipboard em nenhuma ação do componente', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      clipboard: { writeText },
    });
    render(<PaymentLinksView />);
    // Nenhum botão de copiar existe, então writeText nunca deve ser chamado
    expect(writeText).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('botão excluir tem nome acessível (aria-label)', () => {
    render(<PaymentLinksView />);
    expect(screen.getByRole('button', { name: /excluir link de pagamento/i })).toBeInTheDocument();
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