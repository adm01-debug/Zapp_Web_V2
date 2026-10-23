import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import React from 'react';

// framer-motion real monta os elementos via `motion.*`; o mock mantém o DOM
// equivalente (a/tag reais) e tira as props de animação.
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    motion: {
        div: React.forwardRef(
          ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>, ref: React.Ref<HTMLDivElement>) =>
            React.createElement('div', { ...filterDomProps(props), ref }, children)
        ),
        a: React.forwardRef(
          ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>, ref: React.Ref<HTMLAnchorElement>) =>
            React.createElement('a', { ...filterDomProps(props), ref }, children)
        ),
      },
      AnimatePresence: ({ children }: React.PropsWithChildren) =>
        React.createElement(React.Fragment, null, children),
      useReducedMotion: vi.fn(() => null),
  };
});

function filterDomProps(props: Record<string, unknown>) {
  const { initial, animate, exit, transition, whileHover, whileTap, ...rest } = props;
  return rest;
}

import { LinkPreview } from '../LinkPreview';
import { getFavicon, isImageUrl } from '../linkPreviewUtils';

/** Hosts da lista permitida (mesma allowlist de `linkPreviewUtils`). */
const HOSTS_PERMITIDOS = [
  'googleusercontent.com',
  'lh3.googleusercontent.com',
  'whatsapp.net',
  'img.youtube.com',
  'i.ytimg.com',
  'www.youtube.com',
  'youtube.com',
];

function hostPermitido(src: string): boolean {
  if (!src) return true;
  if (src.startsWith('data:') || src.startsWith('blob:')) return true;
  try {
    const host = new URL(src, window.location.origin).hostname.toLowerCase();
    if (new URL(src, window.location.origin).origin === window.location.origin) return true;
    return HOSTS_PERMITIDOS.some((d) => host === d || host.endsWith('.' + d));
  } catch {
    return false;
  }
}

function imgSrcs(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('img')).map((img) => img.getAttribute('src') ?? '');
}

/** Grava todo `src` atribuído a um `<img>`, seja por atributo ou por propriedade. */
function espiaSrcDeImg() {
  const atribuidos: string[] = [];
  const setAttributeOriginal = Element.prototype.setAttribute;
  const spySetAttribute = vi
    .spyOn(Element.prototype, 'setAttribute')
    .mockImplementation(function (this: Element, name: string, value: string) {
      if (name === 'src' && this.tagName === 'IMG') atribuidos.push(String(value));
      return setAttributeOriginal.call(this, name, value);
    });

  const descritor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  if (descritor?.get && descritor?.set) {
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      configurable: true,
      enumerable: descritor.enumerable,
      get(this: HTMLImageElement) {
        return descritor.get!.call(this);
      },
      set(this: HTMLImageElement, value: string) {
        atribuidos.push(String(value));
        descritor.set!.call(this, value);
      },
    });
  }

  return {
    atribuidos,
    restaurar() {
      spySetAttribute.mockRestore();
      if (descritor) Object.defineProperty(HTMLImageElement.prototype, 'src', descritor);
    },
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('LinkPreview — nenhuma mídia de host fora da lista', () => {
  it('getFavicon de domínio qualquer devolve vazio', () => {
    expect(getFavicon('https://evil.example/a')).toBe('');
  });

  it('isImageUrl não aceita extensão só na query', () => {
    expect(isImageUrl('https://x.com/p?f=.png')).toBe(false);
  });

  it('link recebido para imagem em host não permitido não monta <img> e mostra o domínio', () => {
    const espiao = espiaSrcDeImg();
    try {
      const { container } = render(<LinkPreview url="https://evil.example/foto.png" />);

      expect(imgSrcs(container)).toEqual([]);
      expect(espiao.atribuidos.filter((src) => !hostPermitido(src))).toEqual([]);
      expect(screen.getAllByText('evil.example').length).toBeGreaterThan(0);
    } finally {
      espiao.restaurar();
    }
  });

  it('link recebido de outro host qualquer também não monta <img>', () => {
    const espiao = espiaSrcDeImg();
    try {
      const { container } = render(<LinkPreview url="https://rastreador.example/pagina" />);

      expect(imgSrcs(container)).toEqual([]);
      expect(espiao.atribuidos.filter((src) => !hostPermitido(src))).toEqual([]);
    } finally {
      espiao.restaurar();
    }
  });

  it('imagem de host permitido continua montando o <img>', () => {
    const espiao = espiaSrcDeImg();
    try {
      const { container } = render(
        <LinkPreview url="https://img.youtube.com/vi/abc123/mqdefault.jpg" />
      );

      expect(imgSrcs(container)).toContain('https://img.youtube.com/vi/abc123/mqdefault.jpg');
      expect(espiao.atribuidos.every(hostPermitido)).toBe(true);
    } finally {
      espiao.restaurar();
    }
  });

  it('prévia de site comum usa o ícone genérico, sem favicon de terceiro', () => {
    const { container } = render(<LinkPreview url="https://portal.example/noticia" />);

    expect(imgSrcs(container)).toEqual([]);
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
