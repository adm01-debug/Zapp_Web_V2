import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ContactAnalyticsDashboard } from '../ContactAnalyticsDashboard';

/**
 * Página sintética com quantidade conhecida (o componente só recebe a página
 * carregada em `ContactsView`, nunca o total global).
 */
function syntheticPage(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `c-${i}`,
    name: `Contato ${i}`,
    contact_type: i % 2 === 0 ? 'cliente' : 'fornecedor',
    company: i % 3 === 0 ? 'Empresa A' : null,
    tags: i % 4 === 0 ? ['vip'] : [],
    created_at: new Date().toISOString(),
  }));
}

describe('ContactAnalyticsDashboard — escopo dos agregados', () => {
  it('rotula a contagem como da página atual (25 nesta página) e nunca como total', () => {
    render(<ContactAnalyticsDashboard contacts={syntheticPage(25)} />);

    const cabecalho = screen.getByTestId('contact-analytics-header');
    expect(within(cabecalho).getByText('25 nesta página')).toBeInTheDocument();
    // O rótulo enganoso que apresentava a página como total geral não existe mais.
    expect(screen.queryByText('25 total')).not.toBeInTheDocument();
    expect(within(cabecalho).queryByText(/total/i)).not.toBeInTheDocument();
  });

  it('avisa que contagem e agregados representam somente a página atual', () => {
    render(<ContactAnalyticsDashboard contacts={syntheticPage(25)} />);

    const aviso = screen.getByRole('note');
    expect(aviso).toHaveTextContent(/página atual/i);
  });

  it('acompanha o tamanho real da página quando ela é menor', () => {
    render(<ContactAnalyticsDashboard contacts={syntheticPage(3)} />);

    expect(screen.getByText('3 nesta página')).toBeInTheDocument();
    expect(screen.queryByText('3 total')).not.toBeInTheDocument();
  });
});
