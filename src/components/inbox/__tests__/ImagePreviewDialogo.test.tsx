/**
 * Lightbox de imagem como diálogo de verdade (card t_c01da591).
 *
 * Prova, ponto a ponto:
 *  - `role="dialog"` + `aria-modal` + nome acessível;
 *  - Escape tratado NO diálogo (não em listener de `window`);
 *  - o foco ENTRA no diálogo ao abrir, FICA PRESO no Tab/Shift+Tab e VOLTA ao
 *    balão de origem ao fechar;
 *  - axe sem violações;
 *  - o zoom é um botão com nome acessível.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { axe } from 'vitest-axe';
import React from 'react';

vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef(
      (
        { children, ...props }: React.PropsWithChildren<Record<string, unknown>>,
        ref: React.Ref<HTMLDivElement>,
      ) => React.createElement('div', { ...filterDomProps(props), ref }, children),
    ),
    img: React.forwardRef((props: Record<string, unknown>, ref: React.Ref<HTMLImageElement>) =>
      React.createElement('img', { ...filterDomProps(props), ref }),
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) =>
    React.createElement(React.Fragment, null, children),
}));

function filterDomProps(props: Record<string, unknown>) {
  const { whileHover, whileTap, initial, animate, exit, transition, variants, ...rest } = props;
  return rest;
}

vi.mock('@/hooks/system/useDownloadPermission', () => ({
  useDownloadPermission: () => ({ canDownload: true, isLoading: false }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/hooks/storage/useResolvedStorageUrl', () => ({
  useResolvedStorageUrl: (source: string) => ({ url: source, isLoading: false, error: null, refresh: vi.fn() }),
}));

import { ImagePreview, MessageImage } from '@/components/inbox/ImagePreview';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

describe('ImagePreview — diálogo modal com teclado', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('expõe role=dialog, aria-modal e nome acessível', () => {
    render(<ImagePreview src="https://example.com/img.jpg" alt="Foto do cliente" />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Pré-visualização de imagem: Foto do cliente');
  });

  it('fecha com Escape a partir do diálogo e NÃO reage a Esc fora dele (não há listener global)', () => {
    const onClose = vi.fn();
    render(<ImagePreview src="https://example.com/img.jpg" alt="Foto" onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('o foco entra no diálogo ao abrir', () => {
    render(<ImagePreview src="https://example.com/img.jpg" alt="Foto" />);

    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('prende o foco: Tab no último volta ao primeiro e Shift+Tab no primeiro vai ao último', () => {
    render(<ImagePreview src="https://example.com/img.jpg" alt="Foto" />);

    const dialog = screen.getByRole('dialog');
    const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    expect(focusables.length).toBe(3);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    last.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);

    // Com o foco no próprio diálogo, Tab entra no primeiro controle.
    dialog.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
  });

  it('devolve o foco ao elemento de origem (balão) ao fechar', () => {
    const origem = document.createElement('button');
    origem.textContent = 'balão';
    document.body.appendChild(origem);
    origem.focus();

    const { unmount } = render(<ImagePreview src="https://example.com/img.jpg" alt="Foto" onClose={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByRole('dialog'));

    unmount();
    expect(document.activeElement).toBe(origem);

    origem.remove();
  });

  it('o zoom é um botão com nome acessível que alterna ampliar/reduzir', () => {
    render(<ImagePreview src="https://example.com/img.jpg" alt="Foto" />);

    fireEvent.click(screen.getByRole('button', { name: 'Ampliar imagem' }));
    expect(screen.getByRole('button', { name: 'Reduzir imagem' })).toBeInTheDocument();
  });

  it('não tem violação de axe no diálogo', async () => {
    render(<ImagePreview src="https://example.com/img.jpg" alt="Foto do cliente" />);

    const dialog = screen.getByRole('dialog');
    expect(await axe(dialog, { rules: { region: { enabled: false } } })).toHaveNoViolations();
  });
});

describe('MessageImage — balão de origem do lightbox', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('o balão é um <button> e, ao fechar o lightbox, o foco volta para ele', () => {
    render(<MessageImage src="https://example.com/foto.jpg" alt="Foto" />);

    const balao = screen.getByRole('button', { name: 'Expandir imagem: Foto' });
    expect(balao.tagName).toBe('BUTTON');
    expect(balao).toHaveAttribute('type', 'button');

    balao.focus();
    expect(document.activeElement).toBe(balao);

    fireEvent.click(balao);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('dialog'));

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(balao);
  });

  it('não tem violação de axe no balão', async () => {
    const { container } = render(<MessageImage src="https://example.com/foto.jpg" alt="Foto" />);
    expect(await axe(container, { rules: { region: { enabled: false } } })).toHaveNoViolations();
  });
});
