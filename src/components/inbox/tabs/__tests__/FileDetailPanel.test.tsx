import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileDetailPanel } from '../FileDetailPanel';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';

/**
 * R2-INB-060 — "Detalhes de arquivo conservam o erro da imagem anterior ao selecionar outro item".
 * O painel de detalhes e o MESMO componente em `FilesTab` (inline com >= 1100 px e `Sheet` abaixo
 * disso): trocar de arquivo muda a prop `item` sem remontar. Estes testes usam o caminho real —
 * `FileDetailPanel` (a casca que a tela renderiza) -> `FileDetailContent` -> `useResolvedStorageUrl`
 * (importado de `@/hooks/storage/useResolvedStorageUrl`).
 */

const storage = vi.hoisted(() => ({
  /** URL devolvida pelo resolvedor; `null` = o proprio `source` (url do item). */
  url: null as string | null,
  refresh: vi.fn(),
}));

vi.mock('@/hooks/storage/useResolvedStorageUrl', () => ({
  useResolvedStorageUrl: (source: string) => ({
    url: storage.url ?? source,
    isLoading: false,
    error: null,
    refresh: storage.refresh,
  }),
}));

function makeItem(overrides: Partial<ContactMediaItem>): ContactMediaItem {
  return {
    id: 'a1',
    url: 'https://pub.test/a.png',
    type: 'image',
    filename: 'IMG-1.jpg',
    displayName: 'foto-a.png',
    extension: 'png',
    senderLabel: null,
    created_at: '2026-09-24T17:54:00.000Z',
    caption: null,
    mimetype: 'image/png',
    size: 1000,
    meta: null,
    sender: 'contact',
    ...overrides,
  };
}

const IMAGEM_A = makeItem({ id: 'a1', signedUrl: 'https://signed.test/a.png' });
const IMAGEM_B = makeItem({
  id: 'b2',
  signedUrl: 'https://signed.test/b.png',
  displayName: 'foto-b.png',
  filename: 'IMG-2.jpg',
});

function renderPanel(item: ContactMediaItem) {
  const props = { item, contactName: 'Ana Cliente', onClose: vi.fn(), onRequestDelete: vi.fn() };
  return { ...render(<FileDetailPanel {...props} />), props };
}

beforeEach(() => {
  storage.url = null;
  storage.refresh.mockClear();
});

describe('FileDetailContent — o erro de imagem pertence ao arquivo, não ao painel', () => {
  it('mostra a imagem de B depois de a imagem de A falhar no mesmo painel, sem desmontar', () => {
    const { container, rerender, props } = renderPanel(IMAGEM_A);
    const imgA = container.querySelector('img');
    expect(imgA).not.toBeNull();
    expect(imgA).toHaveAttribute('src', 'https://signed.test/a.png');

    // A falha (URL expirada/objeto ausente) e o placeholder de erro entra no lugar.
    fireEvent.error(imgA as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
    expect(props.onClose).not.toHaveBeenCalled();

    // O usuário seleciona o arquivo B na lista: mesma instância, nova prop `item`.
    rerender(<FileDetailPanel {...props} item={IMAGEM_B} />);

    const imgB = container.querySelector('img');
    expect(imgB).not.toBeNull();
    expect(imgB).toHaveAttribute('src', 'https://signed.test/b.png');
    expect(imgB).toHaveAttribute('alt', 'foto-b.png');
    // O resto dos detalhes também tem de acompanhar o novo arquivo.
    expect(screen.getByText('foto-b.png')).toBeInTheDocument();
    expect(screen.queryByText('foto-a.png')).not.toBeInTheDocument();
  });

  it('a renovação bem-sucedida da URL reapresenta a imagem do mesmo arquivo', () => {
    const semLote = makeItem({ id: 'c3', displayName: 'foto-c.png', signedUrl: undefined });
    const { container, rerender, props } = renderPanel(semLote);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', 'https://pub.test/a.png');

    fireEvent.error(img as HTMLImageElement);
    expect(storage.refresh).toHaveBeenCalledTimes(1);
    expect(container.querySelector('img')).toBeNull();

    // O resolvedor terminou o refresh e devolveu uma URL assinada nova.
    storage.url = 'https://signed.test/c.png?token=novo';
    rerender(<FileDetailPanel {...props} />);

    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'https://signed.test/c.png?token=novo',
    );
  });

  it('a mesma URL que falhou continua com o placeholder (o erro não é esquecido a cada render)', () => {
    const { container, rerender, props } = renderPanel(IMAGEM_A);
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();

    rerender(<FileDetailPanel {...props} />);

    expect(container.querySelector('img')).toBeNull();
  });
});
