import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';

// Mock useDownloadPermission
vi.mock('@/hooks/system/useDownloadPermission', () => ({
  useDownloadPermission: () => ({ canDownload: true, isLoading: false }),
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock framer-motion (same pattern as ImagePreviewDownload.test.tsx)
vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef(({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>, ref: React.Ref<HTMLDivElement>) =>
      React.createElement('div', { ...filterDomProps(props), ref }, children)),
    img: React.forwardRef((props: Record<string, unknown>, ref: React.Ref<HTMLImageElement>) =>
      React.createElement('img', { ...filterDomProps(props), ref })),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => React.createElement(React.Fragment, null, children),
}));

function filterDomProps(props: Record<string, unknown>) {
  const { whileHover, whileTap, initial, animate, exit, transition, ...rest } = props;
  return rest;
}

import { ImagePreview } from '@/components/inbox/ImagePreview';

describe('ImagePreview - tamanho do modal (PR #818, 35% de redução)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('aplica max-w-[58.5vw] e max-h-[55.25vh] na <img>, e não mais 90vw/85vh', () => {
    render(<ImagePreview src="https://example.com/img.jpg" alt="Foto" />);

    const img = screen.getByAltText('Foto');
    expect(img).toHaveClass('max-w-[58.5vw]');
    expect(img).toHaveClass('max-h-[55.25vh]');
    expect(img.className).not.toContain('90vw');
    expect(img.className).not.toContain('85vh');
  });

  it('confirma que 58.5vw e 55.25vh são exatamente 65% de 90vw/85vh (redução de 35%)', () => {
    // 90 * 0.65 = 58.5 ; 85 * 0.65 = 55.25
    expect(90 * 0.65).toBeCloseTo(58.5, 5);
    expect(85 * 0.65).toBeCloseTo(55.25, 5);
  });

  it('usa alt="Image" como default quando a prop alt não é passada', () => {
    render(<ImagePreview src="https://example.com/img.jpg" />);
    const img = screen.getByAltText('Image');
    expect(img).toBeInTheDocument();
    expect(img).toHaveClass('max-w-[58.5vw]');
  });

  it('renderiza sem quebrar quando src é uma string vazia (React/jsdom omite o atributo src)', () => {
    render(<ImagePreview src="" alt="Vazio" />);
    const img = screen.getByAltText('Vazio') as HTMLImageElement;
    expect(img).toBeInTheDocument();
    // Achado: com src="", o React não escreve o atributo src no DOM (fica null,
    // não ""), e o browser real emite o warning "An empty string was passed to
    // the src attribute" — reproduzido no stderr deste teste.
    expect(img.getAttribute('src')).toBeNull();
    // O tamanho do modal continua correto mesmo com src inválida.
    expect(img).toHaveClass('max-w-[58.5vw]');
    expect(img).toHaveClass('max-h-[55.25vh]');
  });

  it('fecha o modal ao pressionar Escape', () => {
    const onClose = vi.fn();
    render(<ImagePreview src="https://example.com/img.jpg" alt="Foto" onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('NÃO fecha ao pressionar outras teclas', () => {
    const onClose = vi.fn();
    render(<ImagePreview src="https://example.com/img.jpg" alt="Foto" onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.keyDown(window, { key: 'a' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('fecha ao clicar no backdrop (fora da imagem)', () => {
    const onClose = vi.fn();
    render(<ImagePreview src="https://example.com/img.jpg" alt="Foto" onClose={onClose} />);

    // O componente usa createPortal para document.body, então não dá pra usar
    // `container` do render() (que fica num nó separado). O backdrop é o
    // motion.div raiz com onClick={onClose}, que é o parent direto da <img>.
    const img = screen.getByAltText('Foto');
    const backdrop = img.parentElement as HTMLElement;
    expect(backdrop.className).toContain('fixed');
    expect(backdrop.className).toContain('inset-0');

    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('NÃO fecha ao clicar na própria imagem (stopPropagation)', () => {
    const onClose = vi.fn();
    render(<ImagePreview src="https://example.com/img.jpg" alt="Foto" onClose={onClose} />);

    const img = screen.getByAltText('Foto');
    fireEvent.click(img);
    expect(onClose).not.toHaveBeenCalled();
  });
});
