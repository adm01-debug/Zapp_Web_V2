import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmailFullViewDialog } from '../EmailFullViewDialog';

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: any) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2 data-testid="dialog-title">{children}</h2>,
  DialogDescription: ({ children }: any) => <p data-testid="dialog-desc">{children}</p>,
}));

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  sanitizedHtml: '<p>Corpo do email</p>',
};

describe('EmailFullViewDialog — segurança e renderização', () => {
  it('não renderiza quando open=false', () => {
    const { container } = render(<EmailFullViewDialog {...baseProps} open={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('exibe "(Sem assunto)" quando subject não é fornecido', () => {
    render(<EmailFullViewDialog {...baseProps} />);
    expect(screen.getByTestId('dialog-title')).toHaveTextContent('(Sem assunto)');
  });

  it('exibe o assunto quando fornecido', () => {
    render(<EmailFullViewDialog {...baseProps} subject="Proposta Comercial" />);
    expect(screen.getByTestId('dialog-title')).toHaveTextContent('Proposta Comercial');
  });

  it('exibe fromName e fromAddress na descrição', () => {
    render(<EmailFullViewDialog {...baseProps} fromName="João Silva" fromAddress="joao@empresa.com" />);
    const desc = screen.getByTestId('dialog-desc');
    expect(desc.textContent).toContain('João Silva');
    expect(desc.textContent).toContain('<joao@empresa.com>');
  });

  it('iframe sandbox NÃO contém allow-same-origin', () => {
    render(<EmailFullViewDialog {...baseProps} />);
    const iframe = document.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe!.getAttribute('sandbox')).not.toContain('allow-same-origin');
  });

  it('iframe sandbox NÃO contém allow-scripts', () => {
    render(<EmailFullViewDialog {...baseProps} />);
    const iframe = document.querySelector('iframe');
    expect(iframe!.getAttribute('sandbox')).not.toContain('allow-scripts');
  });

  it('iframe sandbox contém allow-popups', () => {
    render(<EmailFullViewDialog {...baseProps} />);
    const iframe = document.querySelector('iframe');
    expect(iframe!.getAttribute('sandbox')).toContain('allow-popups');
  });

  it('srcDoc do iframe contém o HTML sanitizado', () => {
    render(<EmailFullViewDialog {...baseProps} sanitizedHtml="<b>Texto importante</b>" />);
    const iframe = document.querySelector('iframe');
    expect(iframe!.getAttribute('srcdoc')).toContain('<b>Texto importante</b>');
  });

  it('link de download tem href data:text/html e atributo download="email.html"', () => {
    render(<EmailFullViewDialog {...baseProps} />);
    const link = document.querySelector('a[download]');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toMatch(/^data:text\/html/);
    expect(link!.getAttribute('download')).toBe('email.html');
  });
});
