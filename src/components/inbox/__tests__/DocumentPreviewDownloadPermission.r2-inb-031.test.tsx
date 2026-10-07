/**
 * R2-INB-031 (#325) — o botão Baixar do documento tem de respeitar
 * `profiles.can_download`, exatamente como o caminho de imagem já faz.
 *
 * Antes da correção, `DocumentPreview` resolvia a URL, chamava fetch→blob e
 * criava `anchor.download` sem nunca consultar `useDownloadPermission`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

const mockCanDownload = vi.fn(() => false);
vi.mock('@/hooks/system/useDownloadPermission', () => ({
  useDownloadPermission: () => ({ canDownload: mockCanDownload(), isLoading: false }),
}));

const RESOLVED_URL = 'https://cdn.example.com/signed/contrato.pdf';
vi.mock('@/hooks/storage/useResolvedStorageUrl', () => ({
  useResolvedStorageUrl: () => ({ url: RESOLVED_URL, isLoading: false, error: null, refresh: vi.fn() }),
}));

const mockToastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef(
      ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>, ref: React.Ref<HTMLDivElement>) =>
        React.createElement('div', { ...filterDomProps(props), ref }, children),
    ),
    button: React.forwardRef(
      ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>, ref: React.Ref<HTMLButtonElement>) =>
        React.createElement('button', { ...filterDomProps(props), ref }, children),
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) =>
    React.createElement(React.Fragment, null, children),
}));

function filterDomProps(props: Record<string, unknown>) {
  const { whileHover, whileTap, initial, animate, exit, transition, ...rest } = props;
  return rest;
}

import { DocumentPreview } from '@/components/inbox/MediaPreview';

function renderDocumento() {
  return render(
    <DocumentPreview
      url="chat-media/contrato.pdf"
      fileName="contrato.pdf"
      fileSize={2048}
      isSent={false}
    />,
  );
}

describe('DocumentPreview — permissão de download (R2-INB-031)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let createdAnchors: HTMLAnchorElement[];

  beforeEach(() => {
    vi.clearAllMocks();
    mockCanDownload.mockReturnValue(false);

    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['%PDF-1.4']),
    });
    vi.stubGlobal('fetch', fetchSpy);

    URL.createObjectURL = vi.fn(() => 'blob:mock-object-url');
    URL.revokeObjectURL = vi.fn();

    createdAnchors = [];
    const createElementOriginal = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((
      tagName: string,
      options?: ElementCreationOptions,
    ) => {
      const elemento = createElementOriginal(tagName, options);
      if (tagName === 'a') createdAnchors.push(elemento as HTMLAnchorElement);
      return elemento;
    }) as typeof document.createElement);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('com can_download=false não faz fetch nem cria anchor.download e informa o bloqueio', async () => {
    renderDocumento();

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(createdAnchors).toHaveLength(0);
    expect(String(mockToastError.mock.calls[0][0])).toContain('bloqueado');
    expect(mockToastError.mock.calls[0][1]).toMatchObject({
      description: expect.stringMatching(/administrador/i),
    });
  });

  it('com can_download=false o botão anuncia o bloqueio ao usuário', () => {
    renderDocumento();

    expect(screen.getByRole('button', { name: /bloquead/i })).toBeInTheDocument();
  });

  it('com can_download=true baixa: fetch na URL assinada e anchor com o nome do arquivo', async () => {
    mockCanDownload.mockReturnValue(true);
    renderDocumento();

    fireEvent.click(screen.getByRole('button', { name: /baixar/i }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith(RESOLVED_URL, { mode: 'cors' }));
    await waitFor(() => expect(createdAnchors).toHaveLength(1));
    expect(createdAnchors[0].download).toBe('contrato.pdf');
    expect(mockToastError).not.toHaveBeenCalled();
  });
});
