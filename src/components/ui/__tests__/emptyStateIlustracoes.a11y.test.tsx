import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { illustrations } from '@/components/ui/empty-state-illustrations';

// As artes de estado vazio são decorativas: quem diz o conteúdo é o título e a
// descrição do estado vazio. Cada raiz <svg> precisa estar fora da árvore de
// acessibilidade, para o leitor de tela não anunciar um "gráfico" sem nome.
describe('ilustrações de estado vazio — decorativas para tecnologia assistiva', () => {
  it('toda arte exportada renderiza um <svg> com aria-hidden="true" e sem role', () => {
    const chaves = Object.keys(illustrations);
    expect(chaves.length).toBeGreaterThan(0);

    for (const chave of chaves) {
      const { container, unmount } = render(<div>{illustrations[chave]}</div>);
      const raiz = container.querySelector('svg');
      expect(raiz, `arte "${chave}" sem <svg>`).not.toBeNull();
      expect(raiz, `arte "${chave}" sem aria-hidden`).toHaveAttribute('aria-hidden', 'true');
      expect(raiz).not.toHaveAttribute('role');
      unmount();
    }
  });
});
