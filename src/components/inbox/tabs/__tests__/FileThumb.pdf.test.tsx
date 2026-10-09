import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { FileThumb, type FileThumbSize } from '../FileThumb';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';
import type { PdfThumbnailEstado } from '@/hooks/chat/usePdfThumbnail';

/**
 * M04 — miniatura da 1ª página do PDF no tile de documento.
 *
 * O que é mockado: só o hook `usePdfThumbnail` (a conta pesada do M01 tem teste próprio, em
 * `src/hooks/chat/__tests__/usePdfThumbnail.test.tsx`) e o resolver da URL assinada. O
 * componente REAL roda com o `useInView` real, então a zona de pré-carregamento é exercitada
 * de verdade — o stub abaixo entrega o `habilitado` com que o tile chamou o hook.
 *
 * O mock do hook respeita o contrato do M01: com `habilitado` falso o estado é `sem-previa`
 * (nada assinado, nada renderizado, `url` nulo).
 */

const pdf = vi.hoisted(() => ({
  estado: 'sem-previa' as PdfThumbnailEstado,
  url: null as string | null,
  chamadas: [] as Array<{ id: string; habilitado: boolean }>,
}));

vi.mock('@/hooks/chat/usePdfThumbnail', () => ({
  usePdfThumbnail: (item: { id: string; url?: string }, habilitado: boolean) => {
    pdf.chamadas.push({ id: item.id, habilitado });
    // Contrato do M01: sem `habilitado` ou sem URL não há prévia possível — nada é assinado.
    if (!habilitado || !item.url) return { url: null, estado: 'sem-previa' };
    return { url: pdf.url, estado: pdf.estado };
  },
}));

vi.mock('@/hooks/storage/useResolvedStorageUrl', () => ({
  useResolvedStorageUrl: () => ({
    url: '', isLoading: false, error: null, refresh: vi.fn().mockResolvedValue(null),
  }),
}));

beforeEach(() => {
  pdf.estado = 'sem-previa';
  pdf.url = null;
  pdf.chamadas = [];
});

/** Última chamada registrada do hook (o array cresce a cada render, então "a última" é a atual). */
function ultimaChamada() {
  return pdf.chamadas[pdf.chamadas.length - 1];
}

const SIZES: FileThumbSize[] = ['card', 'row', 'cell'];

function documento(overrides: Partial<ContactMediaItem> = {}): ContactMediaItem {
  return {
    id: 'd1', url: 'https://storage.test/arquivos/contrato.pdf', type: 'document',
    filename: 'contrato.pdf', displayName: 'contrato.pdf', extension: 'pdf',
    senderLabel: null, created_at: '2026-10-07T12:00:00.000Z', caption: null,
    mimetype: 'application/pdf', size: 4096, meta: null, sender: 'contact',
    signedUrl: 'https://signed.test/contrato.pdf', ...overrides,
  };
}

/** Stub que dispara o callback sob demanda — o mock global do setup não dispara. */
class FiringIntersectionObserver {
  static lastCallback: IntersectionObserverCallback | undefined;
  static lastOptions: IntersectionObserverInit | undefined;
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    FiringIntersectionObserver.lastCallback = callback;
    FiringIntersectionObserver.lastOptions = options;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

function withFiringObserver<T>(run: () => T): T {
  const original = window.IntersectionObserver;
  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true, configurable: true, value: FiringIntersectionObserver,
  });
  FiringIntersectionObserver.lastCallback = undefined;
  FiringIntersectionObserver.lastOptions = undefined;
  try {
    return run();
  } finally {
    Object.defineProperty(window, 'IntersectionObserver', {
      writable: true, configurable: true, value: original,
    });
  }
}

function enterPreloadZone() {
  act(() => {
    FiringIntersectionObserver.lastCallback?.(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
  });
}

function renderInsideZone(size: FileThumbSize, item = documento()) {
  return withFiringObserver(() => {
    const result = render(<FileThumb item={item} size={size} />);
    enterPreloadZone();
    return result;
  });
}

describe('M04 — miniatura da 1ª página do PDF no tile de documento', () => {
  it.each(SIZES)('%s: mostra a 1ª página do PDF no lugar do ícone, em object-contain', (size) => {
    pdf.estado = 'ready';
    pdf.url = 'blob:miniatura-1';
    const { container } = renderInsideZone(size);

    const img = screen.getByTestId('files-thumb-pdf');
    expect(img).toHaveAttribute('src', 'blob:miniatura-1');
    expect(img.className).toContain('object-contain');
    expect(img.className).toContain('h-full');
    expect(img.className).toContain('w-full');
    // O ícone da família sai de cena quando a miniatura entra.
    expect(container.querySelector('.lucide-file-text')).toBeNull();
    // Fundo neutro: o quadro do tile é quem pinta o vazio em volta da página.
    expect(container.querySelector('[data-testid="files-thumb-d1"]')?.className).toContain('bg-muted');
  });

  it('card: o selo da extensão continua na miniatura e o alt é o nome do arquivo', () => {
    pdf.estado = 'ready';
    pdf.url = 'blob:miniatura-1';
    renderInsideZone('card');

    expect(screen.getByText('PDF')).toBeInTheDocument();
    expect(screen.getByTestId('files-thumb-pdf')).toHaveAttribute('alt', 'contrato.pdf');
  });

  it.each(['row', 'cell'] as const)('%s: sem selo de extensão (como hoje) e alt decorativo', (size) => {
    pdf.estado = 'ready';
    pdf.url = 'blob:miniatura-1';
    renderInsideZone(size);

    expect(screen.queryByText('PDF')).not.toBeInTheDocument();
    expect(screen.getByTestId('files-thumb-pdf')).toHaveAttribute('alt', '');
  });

  it('enquanto carrega mostra o esqueleto — sem ícone e sem imagem', () => {
    pdf.estado = 'loading';
    const { container } = renderInsideZone('card');

    expect(screen.getByTestId('files-thumb-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('files-thumb-pdf')).toBeNull();
    expect(container.querySelector('.lucide-file-text')).toBeNull();
  });

  it.each(['sem-previa', 'erro'] as const)(
    '%s: volta ao ícone da família com o selo, sem erro nenhum na tela',
    (estado) => {
      pdf.estado = estado;
      const { container } = renderInsideZone('card');

      expect(container.querySelector('.lucide-file-text')).not.toBeNull();
      expect(screen.getByText('PDF')).toBeInTheDocument();
      expect(screen.queryByTestId('files-thumb-pdf')).toBeNull();
      expect(screen.queryByTestId('files-thumb-skeleton')).toBeNull();
      expect(screen.queryByTitle('Prévia indisponível')).not.toBeInTheDocument();
    },
  );

  it('fora da zona de pré-carregamento a miniatura nem é pedida (habilitado falso)', () => {
    pdf.estado = 'ready';
    pdf.url = 'blob:miniatura-1';

    withFiringObserver(() => {
      const { container } = render(<FileThumb item={documento()} size="card" />);

      expect(ultimaChamada()).toEqual({ id: 'd1', habilitado: false });
      expect(container.querySelector('[data-testid="files-thumb-pdf"]')).toBeNull();
      expect(container.querySelector('.lucide-file-text')).not.toBeNull();
    });
  });

  it('entrar na zona (rootMargin 200px) é o que liga a miniatura', () => {
    pdf.estado = 'ready';
    pdf.url = 'blob:miniatura-1';

    withFiringObserver(() => {
      const { container } = render(<FileThumb item={documento()} size="row" />);
      expect(container.querySelector('[data-testid="files-thumb-pdf"]')).toBeNull();

      enterPreloadZone();

      expect(FiringIntersectionObserver.lastOptions?.rootMargin).toBe('200px');
      expect(ultimaChamada()).toEqual({ id: 'd1', habilitado: true });
      expect(container.querySelector('[data-testid="files-thumb-pdf"]')).toHaveAttribute(
        'src', 'blob:miniatura-1',
      );
    });
  });

  it('PDF sem URL nenhuma cai no ícone, sem esqueleto nem imagem', () => {
    pdf.estado = 'loading';
    const { container } = renderInsideZone('card', documento({ url: '', signedUrl: undefined }));

    // O contrato do M01: item sem URL não fica preso em loading.
    expect(container.querySelector('.lucide-file-text')).not.toBeNull();
    expect(screen.queryByTestId('files-thumb-pdf')).toBeNull();
    expect(screen.queryByTestId('files-thumb-skeleton')).toBeNull();
  });

  it.each([
    ['planilha.xlsx', 'xlsx', 'XLSX', '.lucide-file-spreadsheet'],
    ['relatorio.docx', 'docx', 'DOCX', '.lucide-file-text'],
    ['deck.pptx', 'pptx', 'PPTX', '.lucide-presentation'],
    ['pacote.zip', 'zip', 'ZIP', '.lucide-file-archive'],
  ])('%s: família diferente de PDF fica INTACTA (ícone + selo, sem miniatura)', (filename, extension, badge, iconSelector) => {
    const { container } = renderInsideZone(
      'card',
      documento({ id: 'o1', filename, displayName: filename, extension }),
    );

    expect(container.querySelector(iconSelector)).not.toBeNull();
    expect(screen.getByText(badge)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="files-thumb-pdf"]')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    // Nem chega a montar o caminho do PDF: nenhuma chamada de hook para outras famílias.
    expect(pdf.chamadas).toEqual([]);
  });

  it('genérico (extensão desconhecida) também fica intacto: ícone genérico e nenhum selo', () => {
    const { container } = renderInsideZone(
      'card',
      documento({ id: 'g1', filename: 'misterio.xyz', displayName: 'misterio.xyz', extension: 'xyz' }),
    );

    expect(container.querySelector('.lucide-file')).not.toBeNull();
    expect(screen.queryByText('XYZ')).not.toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(pdf.chamadas).toEqual([]);
  });
});
