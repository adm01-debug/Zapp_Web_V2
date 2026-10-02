import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { HighlightedText } from '../HighlightedText';

/**
 * Regressao de acessibilidade (fase 7 do plano MAPA):
 * o texto concatenado exposto ao leitor de tela (textContent) precisa
 * manter os espacos do texto original mesmo quando ha destaque no meio
 * da frase. Sem isso, o leitor de tela le "XBZBrindes" em vez de
 * "XBZ Brindes".
 */
describe('HighlightedText - acessibilidade (texto concatenado)', () => {
  it('preserva o espaco entre o termo destacado e o restante (XBZ Brindes)', () => {
    const { container } = render(<HighlightedText text="XBZ Brindes" query="XBZ" />);
    expect(container.textContent).toContain('XBZ Brindes');
    expect(container.textContent).toBe('XBZ Brindes');
  });

  it('preserva os espacos quando o destaque esta no meio da frase', () => {
    const { container } = render(
      <HighlightedText text="Temos XBZ Brindes e mais itens" query="XBZ" />,
    );
    expect(container.textContent).toContain('XBZ Brindes');
    expect(container.textContent).toBe('Temos XBZ Brindes e mais itens');
  });

  it('preserva os espacos com multiplas ocorrencias do termo', () => {
    const { container } = render(
      <HighlightedText text="XBZ Brindes e XBZ Servicos" query="XBZ" />,
    );
    expect(container.textContent).toBe('XBZ Brindes e XBZ Servicos');
  });

  it('preserva acentos e espacos no meio do destaque', () => {
    const { container } = render(<HighlightedText text="Joao da Silva" query="joao" />);
    expect(container.textContent).toBe('Joao da Silva');
  });

  it('query com espaco em volta ainda destaca (bug medido: trim na checagem, sem trim na busca)', () => {
    const { container } = render(<HighlightedText text="XBZ Brindes" query=" XBZ " />);
    expect(container.querySelector('mark')).not.toBeNull();
    expect(container.textContent).toBe('XBZ Brindes');
  });
});
