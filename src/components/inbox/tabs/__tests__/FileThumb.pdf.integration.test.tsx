import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { FileThumb, type FileThumbSize } from '../FileThumb';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';

/**
 * M06 — INTEGRAÇÃO do tile de PDF: `FileThumb` REAL + `usePdfThumbnail` REAL + `useResolvedStorageUrl` REAL.
 *
 * Só a FRONTEIRA é dublada: o cliente Supabase (a assinatura da URL do bucket privado) e
 * `renderPdfThumbnail` (a biblioteca pdfjs tem teste próprio, em `src/lib/__tests__/pdfThumbnail.test.ts`).
 * Nada do caminho do produto é substituído: entrar na zona de pré-carregamento assina o objeto,
 * pede a miniatura e mostra o object URL devolvido pela biblioteca.
 *
 * Diferente de `FileThumb.pdf.test.tsx` (que prova o CONTRATO do tile com o hook dublado), aqui o
 * hook que decide os estados está ligado de verdade — é esta a malha que prova o tile de ponta a ponta.
 */

const { createSignedUrl, renderPdfThumbnail, logWarn } = vi.hoisted(() => ({
  createSignedUrl: vi.fn(),
  renderPdfThumbnail: vi.fn(),
  logWarn: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: (caminho: string, ttl: number) => createSignedUrl(bucket, caminho, ttl),
      }),
    },
  },
}));

vi.mock('@/config/supabase', () => ({ SUPABASE_URL: 'https://test.supabase.co' }));

vi.mock('@/lib/pdfThumbnail', () => ({
  renderPdfThumbnail: (...args: unknown[]) => renderPdfThumbnail(...args),
}));

vi.mock('@/lib/logger', () => ({
  log: { warn: logWarn, error: vi.fn(), info: vi.fn(), debug: vi.fn() },
  createLogger: () => ({ warn: logWarn, error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const STORAGE = 'https://test.supabase.co';
const CAMINHO = 'documentos/contrato.pdf';
const URL_ASSINADA = `${STORAGE}/storage/v1/object/sign/whatsapp-media/${CAMINHO}?token=assinatura-fresca`;

let criados = 0;
const createObjectURL = vi.fn(() => `blob:miniatura-${(criados += 1)}`);
const revokeObjectURL = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  criados = 0;
  // jsdom não implementa os object URLs; o tile usa os dois.
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: revokeObjectURL });

  // Assinatura de bucket privado OK e página 1 renderizada: o caminho feliz é o padrão.
  createSignedUrl.mockResolvedValue({ data: { signedUrl: URL_ASSINADA }, error: null });
  renderPdfThumbnail.mockResolvedValue(new Blob(['pagina-1'], { type: 'image/jpeg' }));
});

/**
 * Item de `useContactMedia` como a consulta o entrega: `url` é o locator durável do bucket
 * privado (por isso o tile PRECISA assinar antes de mostrar) e `extension` é o que decide a
 * família do documento. Sem `signedUrl`: o caminho exercitado é o da assinatura individual.
 */
function documento(overrides: Partial<ContactMediaItem> = {}): ContactMediaItem {
  return {
    id: 'doc-1',
    url: `${STORAGE}/storage/v1/object/public/whatsapp-media/${CAMINHO}`,
    type: 'document',
    filename: 'contrato.pdf',
    displayName: 'contrato.pdf',
    extension: 'pdf',
    senderLabel: null,
    created_at: '2026-10-07T12:00:00.000Z',
    caption: null,
    mimetype: 'application/pdf',
    size: 4096,
    meta: null,
    sender: 'contact',
    ...overrides,
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

const SIZES: FileThumbSize[] = ['card', 'row', 'cell'];

function renderInsideZone(size: FileThumbSize, item = documento()) {
  return withFiringObserver(() => {
    const result = render(<FileThumb item={item} size={size} />);
    enterPreloadZone();
    return result;
  });
}

describe('M06 — tile de PDF: caminho completo (assinatura → miniatura → <img>)', () => {
  it('assina o objeto do bucket privado, pede a miniatura da URL ASSINADA e mostra a 1ª página', async () => {
    const { container } = renderInsideZone('card');

    const img = await screen.findByTestId('files-thumb-pdf');
    expect(img).toHaveAttribute('src', 'blob:miniatura-1');
    expect(img).toHaveAttribute('alt', 'contrato.pdf');
    expect(img.className).toContain('object-contain');
    // A página 1 entra no lugar do ícone da família; o selo da extensão continua.
    expect(container.querySelector('.lucide-file-text')).toBeNull();
    expect(screen.getByText('PDF')).toBeInTheDocument();

    expect(createSignedUrl).toHaveBeenCalledWith('whatsapp-media', CAMINHO, 3600);
    const [urlRecebida, opcoes] = renderPdfThumbnail.mock.calls[0] as [string, {
      largura: number; chave?: string; sinal: AbortSignal;
    }];
    // A biblioteca recebe a URL assinada (token), NUNCA o locator durável.
    expect(urlRecebida).toBe(URL_ASSINADA);
    expect(urlRecebida).not.toBe(documento().url);
    expect(opcoes.largura).toBe(320);
    expect(opcoes.chave).toBe('doc-1');
    expect(opcoes.sinal).toBeInstanceOf(AbortSignal);
    // O Blob vira object URL (e é ele que o <img> mostra).
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  });

  it.each(SIZES)('%s: o quadro é o mesmo nos três tamanhos (página contida, sem ícone por baixo)', async (size) => {
    const { container } = renderInsideZone(size);

    const img = await screen.findByTestId('files-thumb-pdf');
    expect(img.className).toContain('h-full');
    expect(img.className).toContain('w-full');
    expect(container.querySelector('.lucide-file-text')).toBeNull();
    expect(container.querySelector('[data-testid="files-thumb-skeleton"]')).toBeNull();
  });

  it('enquanto a página não fica pronta mostra o esqueleto — e troca pela página quando ela chega', async () => {
    let liberar: (blob: Blob | null) => void = () => undefined;
    renderPdfThumbnail.mockImplementation(() => new Promise<Blob | null>((resolve) => { liberar = resolve; }));

    const { container } = renderInsideZone('card');

    // A assinatura já resolveu (a biblioteca foi chamada) e a tela segue carregando.
    await waitFor(() => expect(renderPdfThumbnail).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('files-thumb-skeleton')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.lucide-file-text')).toBeNull();

    await act(async () => { liberar(new Blob(['pagina-1'], { type: 'image/jpeg' })); });

    expect(await screen.findByTestId('files-thumb-pdf')).toHaveAttribute('src', 'blob:miniatura-1');
    expect(screen.queryByTestId('files-thumb-skeleton')).toBeNull();
    expect(container.querySelector('.lucide-file-text')).toBeNull();
  });

  it('desmontar o tile revoga o object URL da página (a página não vaza memória)', async () => {
    const { unmount } = renderInsideZone('card');
    await screen.findByTestId('files-thumb-pdf');

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:miniatura-1');
  });
});

describe('M06 — tile de PDF: fora da tela e falhas', () => {
  it('fora da zona de pré-carregamento não assina nem renderiza nada — e entrar na zona é o que liga', async () => {
    const { container } = withFiringObserver(() => render(<FileThumb item={documento()} size="card" />));

    expect(FiringIntersectionObserver.lastOptions?.rootMargin).toBe('200px');
    // Nenhuma ida ao storage e nenhuma renderização: lista longa não monta PDF fora da tela.
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(renderPdfThumbnail).not.toHaveBeenCalled();
    expect(container.querySelector('.lucide-file-text')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByTestId('files-thumb-skeleton')).toBeNull();

    enterPreloadZone();

    expect(await screen.findByTestId('files-thumb-pdf')).toBeInTheDocument();
    expect(createSignedUrl).toHaveBeenCalledTimes(1);
  });

  it('falha ao assinar a URL: ícone da família, sem imagem quebrada e sem erro nenhum na tela', async () => {
    createSignedUrl.mockResolvedValue({ data: null, error: new Error('sem permissão') });

    const { container } = renderInsideZone('card');

    // Sai de "loading" (esqueleto) para o ícone da família: é o único desfecho visível.
    await waitFor(() => expect(screen.queryByTestId('files-thumb-skeleton')).toBeNull());
    expect(container.querySelector('.lucide-file-text')).not.toBeNull();
    expect(screen.getByText('PDF')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByTitle('Prévia indisponível')).not.toBeInTheDocument();
    expect(renderPdfThumbnail).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalled();
  });

  it('PDF corrompido (a biblioteca não devolve página): ícone da família, sem object URL e sem erro na tela', async () => {
    renderPdfThumbnail.mockRejectedValue(new Error('PDF corrompido'));

    const { container } = renderInsideZone('card');

    await waitFor(() => expect(renderPdfThumbnail).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId('files-thumb-skeleton')).toBeNull());
    expect(container.querySelector('.lucide-file-text')).not.toBeNull();
    expect(screen.getByText('PDF')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(screen.queryByTitle('Prévia indisponível')).not.toBeInTheDocument();
  });

  it('mimetype enganoso (.pdf com image/webp): não vira imagem quebrada — volta ao ícone da família', async () => {
    renderPdfThumbnail.mockRejectedValue(new Error('não é um PDF'));

    const { container } = renderInsideZone('card', documento({ mimetype: 'image/webp' }));

    await waitFor(() => expect(screen.queryByTestId('files-thumb-skeleton')).toBeNull());
    // Continua documento PDF (a família é da extensão) e a tentativa que falhou não deixa imagem.
    expect(screen.getByText('PDF')).toBeInTheDocument();
    expect(container.querySelector('.lucide-file-text')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(renderPdfThumbnail).toHaveBeenCalledTimes(1);
  });
});

describe('M06 — tile de PDF: outras famílias e o PDF só pelo MIME', () => {
  it.each([
    ['planilha.xlsx', 'xlsx', 'XLSX', '.lucide-file-spreadsheet'],
    ['relatorio.docx', 'docx', 'DOCX', '.lucide-file-text'],
    ['deck.pptx', 'pptx', 'PPTX', '.lucide-presentation'],
    ['pacote.zip', 'zip', 'ZIP', '.lucide-file-archive'],
  ])('%s: família diferente de PDF não entra no caminho da miniatura (nada assinado)', async (filename, extension, badge, icone) => {
    const { container } = renderInsideZone('card', documento({
      id: 'outro',
      filename,
      displayName: filename,
      extension,
      url: `${STORAGE}/storage/v1/object/public/whatsapp-media/documentos/${filename}`,
    }));

    // Sem caminho assíncrono nenhum pendente: o ramo do PDF nem é montado.
    await act(async () => {});

    expect(container.querySelector(icone)).not.toBeNull();
    expect(screen.getByText(badge)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByTestId('files-thumb-skeleton')).toBeNull();
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(renderPdfThumbnail).not.toHaveBeenCalled();
  });

  it('PDF só pelo MIME (sem extensão): o tile não inventa prévia nem selo — ícone genérico', async () => {
    // A família do documento no tile é decidida pela EXTENSÃO (etapa 29); sem extensão o item não
    // é roteado para o ramo do PDF, então nada é assinado e nada é renderizado.
    const { container } = renderInsideZone('card', documento({
      id: 'sem-extensao',
      url: `${STORAGE}/storage/v1/object/public/whatsapp-media/documentos/sem-extensao`,
      filename: '',
      displayName: 'Documento',
      extension: null,
      mimetype: 'application/pdf',
    }));

    await act(async () => {});

    expect(container.querySelector('.lucide-file')).not.toBeNull();
    expect(container.querySelector('.lucide-file-text')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByText('PDF')).not.toBeInTheDocument();
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(renderPdfThumbnail).not.toHaveBeenCalled();
  });
});
