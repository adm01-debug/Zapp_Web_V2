import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessagePreview, useHasFormattableContent } from '../MessagePreview';

function HasFormattable({ content }: { content: string }) {
  const has = useHasFormattableContent(content);
  return <span data-testid="resultado">{has ? 'sim' : 'nao'}</span>;
}

describe('MessagePreview — formatação do preview', () => {
  it('não renderiza nada quando o conteúdo é vazio', () => {
    const { container } = render(<MessagePreview content="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('troca o atalho de emoji pelo emoji real', () => {
    render(<MessagePreview content="bom dia :fire: pessoal" />);
    expect(screen.getByText(/🔥/)).toBeInTheDocument();
    expect(screen.queryByText(/:fire:/)).not.toBeInTheDocument();
  });

  it('renderiza o trecho entre crases como <code>', () => {
    render(<MessagePreview content="use `npm test` agora" />);
    expect(screen.getByText('npm test').tagName).toBe('CODE');
  });

  it('renderiza o trecho entre underscores como <em>', () => {
    render(<MessagePreview content="isso é _importante_" />);
    expect(screen.getByText('importante').tagName).toBe('EM');
  });

  it('transforma a URL em link com target/rel seguros', () => {
    render(<MessagePreview content="veja https://exemplo.com/doc agora" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://exemplo.com/doc');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('useHasFormattableContent detecta formatação e ignora texto puro', () => {
    const { rerender } = render(<HasFormattable content="**negrito**" />);
    expect(screen.getByTestId('resultado')).toHaveTextContent('sim');
    rerender(<HasFormattable content="texto simples" />);
    expect(screen.getByTestId('resultado')).toHaveTextContent('nao');
  });
});
