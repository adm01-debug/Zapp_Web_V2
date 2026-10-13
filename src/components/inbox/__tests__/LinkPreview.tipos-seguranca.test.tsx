import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LinkPreview } from '../LinkPreview';

describe('LinkPreview — tipos e segurança de URL', () => {
  it('esquema não-http (ftp:) vira link simples, mesmo apontando para um .png', () => {
    // A checagem de esquema vem ANTES da de extensão: um ftp://...png não pode
    // virar <img src>, senão o preview carregaria de qualquer origem.
    render(<LinkPreview url="ftp://servidor/arquivo.png" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'ftp://servidor/arquivo.png');
    expect(link).toHaveTextContent('ftp://servidor/arquivo.png');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('javascript: não vira preview de imagem', () => {
    render(<LinkPreview url="javascript:alert(1)" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveTextContent('javascript:alert(1)');
  });

  it('imagem vira <img> apontando para a própria URL, com o nome do arquivo no alt', () => {
    render(<LinkPreview url="https://cdn.exemplo.com/foto.png" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://cdn.exemplo.com/foto.png');
    expect(img).toHaveAttribute('alt', 'foto.png');
  });

  it('YouTube vira card de vídeo com a miniatura do id', () => {
    render(<LinkPreview url="https://www.youtube.com/watch?v=abc123" />);
    expect(screen.getByAltText('YouTube Video')).toHaveAttribute(
      'src',
      'https://img.youtube.com/vi/abc123/mqdefault.jpg',
    );
  });

  it('modo compacto mostra o domínio sem o prefixo www', () => {
    render(<LinkPreview url="https://www.exemplo.com/pagina" compact />);
    expect(screen.getByText('exemplo.com')).toBeInTheDocument();
  });

  it('showRemove dispara onRemove ao clicar no botão de remover', () => {
    const onRemove = vi.fn();
    render(<LinkPreview url="https://cdn.exemplo.com/foto.png" showRemove onRemove={onRemove} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
