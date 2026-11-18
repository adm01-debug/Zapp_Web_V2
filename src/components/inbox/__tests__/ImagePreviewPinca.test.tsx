import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';

// Mesmo arranjo de mocks dos outros testes de ImagePreview (ImagePreviewSize.test.tsx:6-32).
vi.mock('@/hooks/system/useDownloadPermission', () => ({
  useDownloadPermission: () => ({ canDownload: true, isLoading: false }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return {
    ...actual,
    motion: {
      div: React.forwardRef(({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>, ref: React.Ref<HTMLDivElement>) =>
        React.createElement('div', { ...filterDomProps(props), ref }, children)),
      img: React.forwardRef((props: Record<string, unknown>, ref: React.Ref<HTMLImageElement>) =>
        React.createElement('img', { ...filterDomProps(props), ref })),
    },
    AnimatePresence: ({ children }: React.PropsWithChildren) => React.createElement(React.Fragment, null, children),
    useReducedMotion: vi.fn(() => null),
  };
});

function filterDomProps(props: Record<string, unknown>) {
  const { whileHover, whileTap, initial, animate, exit, transition, drag, dragConstraints, dragElastic, ...rest } = props;
  return rest;
}

import { ImagePreview } from '@/components/inbox/ImagePreview';

// Dois dedos a `d` pixels de distancia, na horizontal.
const doisDedos = (d: number) => [
  { clientX: 0, clientY: 0 },
  { clientX: d, clientY: 0 },
];

const imagem = () => screen.getByRole('img');
// O rotulo do botao e o estado observavel do zoom: 'Ampliar' em 1x, 'Reduzir' acima.
const estaAmpliada = () => Boolean(screen.queryByLabelText('Reduzir imagem'));

describe('ImagePreview: pinca de dois dedos', () => {
  afterEach(cleanup);

  it('afastar os dedos amplia a imagem', () => {
    render(<ImagePreview src="https://exemplo/foto.png" alt="Foto do cliente" />);
    expect(estaAmpliada()).toBe(false);

    fireEvent.touchStart(imagem(), { touches: doisDedos(100) });
    fireEvent.touchMove(imagem(), { touches: doisDedos(200) });

    expect(estaAmpliada()).toBe(true);
  });

  it('aproximar os dedos nao reduz abaixo do tamanho original', () => {
    render(<ImagePreview src="https://exemplo/foto.png" alt="Foto do cliente" />);

    // Primeiro amplia, depois fecha os dedos muito alem do ponto de partida.
    fireEvent.touchStart(imagem(), { touches: doisDedos(100) });
    fireEvent.touchMove(imagem(), { touches: doisDedos(200) });
    fireEvent.touchEnd(imagem(), { touches: [] });
    fireEvent.touchStart(imagem(), { touches: doisDedos(400) });
    fireEvent.touchMove(imagem(), { touches: doisDedos(10) });

    // Volta a 1x e para ali: sem piso, a imagem sumiria de tao pequena.
    expect(estaAmpliada()).toBe(false);
  });

  it('um dedo so nao mexe no zoom (rolar a conversa continua funcionando)', () => {
    render(<ImagePreview src="https://exemplo/foto.png" alt="Foto do cliente" />);

    fireEvent.touchStart(imagem(), { touches: [{ clientX: 0, clientY: 0 }] });
    fireEvent.touchMove(imagem(), { touches: [{ clientX: 0, clientY: 300 }] });

    expect(estaAmpliada()).toBe(false);
  });

  it('o botao continua ampliando e reduzindo, para quem usa teclado', () => {
    render(<ImagePreview src="https://exemplo/foto.png" alt="Foto do cliente" />);

    fireEvent.click(screen.getByLabelText('Ampliar imagem'));
    expect(estaAmpliada()).toBe(true);

    fireEvent.click(screen.getByLabelText('Reduzir imagem'));
    expect(estaAmpliada()).toBe(false);
  });

  it('a pinca nao bloqueia a rolagem enquanto a imagem esta em 1x', () => {
    render(<ImagePreview src="https://exemplo/foto.png" alt="Foto do cliente" />);

    // touchAction so vira 'none' quando ha zoom; em 1x a pagina rola sob a imagem.
    expect(imagem().style.touchAction).toBe('');

    fireEvent.touchStart(imagem(), { touches: doisDedos(100) });
    fireEvent.touchMove(imagem(), { touches: doisDedos(300) });

    expect(imagem().style.touchAction).toBe('none');
  });
});
