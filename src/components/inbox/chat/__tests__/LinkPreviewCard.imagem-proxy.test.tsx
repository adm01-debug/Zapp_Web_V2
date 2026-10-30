import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { LinkPreviewCard } from '../LinkPreviewCard';

/**
 * PL-09: a imagem da prévia é buscada pelo servidor (proxy de egresso) e chega
 * embutida como `data:` URL. O navegador do atendente NÃO pode falar direto com
 * o host que o cliente escolheu — nem para uma prévia antiga guardada com URL
 * remota (vazaria o IP do atendente).
 */
describe('LinkPreviewCard — imagem só pela via do servidor', () => {
  it('não renderiza <img> para imagem de host remoto e mantém o resto da prévia', () => {
    const { container } = render(
      <LinkPreviewCard
        isSent={false}
        preview={{
          url: 'https://noticia.test/materia',
          title: 'Uma matéria',
          image: 'https://img.remoto.test/foto.png',
        }}
      />,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Uma matéria')).toBeInTheDocument();
    expect(screen.getByText('noticia.test')).toBeInTheDocument();
  });

  it('também não busca uma imagem por http: que veio na prévia', () => {
    const { container } = render(
      <LinkPreviewCard isSent={false} preview={{ image: 'http://img.remoto.test/x.png' }} />,
    );

    expect(container.querySelector('img')).toBeNull();
  });

  it('renderiza a imagem quando ela já vem do servidor como data: URL', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const { container } = render(
      <LinkPreviewCard isSent preview={{ url: 'https://noticia.test/materia', image: dataUrl }} />,
    );

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', dataUrl);
  });
});
