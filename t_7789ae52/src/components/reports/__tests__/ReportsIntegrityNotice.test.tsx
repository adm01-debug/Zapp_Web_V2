import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReportsIntegrityNotice } from '../ReportsIntegrityNotice';

describe('ReportsIntegrityNotice — R2-MOD-018/019', () => {
  it('falha de leitura vira alerta: os números não são totais confirmados', () => {
    render(<ReportsIntegrityNotice error={{ message: 'permission denied' }} incomplete={false} />);

    const alerta = screen.getByRole('alert');
    expect(alerta).toBeInTheDocument();
    expect(alerta).toHaveTextContent(/não.*são totais confirmados/i);
    expect(alerta).toHaveTextContent('permission denied');
  });

  it('leitura parcial vira aviso de totais parciais', () => {
    render(<ReportsIntegrityNotice error={null} incomplete />);

    expect(screen.getByTestId('reports-incomplete')).toBeInTheDocument();
    expect(screen.getByTestId('reports-incomplete')).toHaveTextContent(/parciais/i);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('leitura completa e sem erro não mostra nada', () => {
    const { container } = render(<ReportsIntegrityNotice error={null} incomplete={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
