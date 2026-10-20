import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import Install from '@/pages/Install';

/**
 * t_a7125912 — o app pode ser instalado e a tela de instalação não promete o que não existe.
 *
 * O `public/manifest.json` (com shortcuts) e o `public/apple-touch-icon.png` existiam,
 * mas o `index.html` não os referenciava: nenhum navegador oferecia o `beforeinstallprompt`
 * e a página `/install` nunca conseguia instalar. O `dist/index.html` é gerado a partir
 * deste arquivo pelo Vite, então a prova mora aqui.
 *
 * O `theme-color` também NÃO é número solto do teste: ele é comparado com o `theme_color`
 * do próprio manifesto (fonte única), que é o mesmo valor que o Chrome usa na barra.
 *
 * E a tela pedia 'Funciona Offline / Acesse dados mesmo sem internet' — falso: o Service
 * Worker está desligado por decisão (`src/config/service_worker.ts`, SERVICE_WORKER_ENABLED
 * = false) e não há cache de shell. O teste renderiza o componente REAL e exige que a
 * promessa tenha sumido da tela.
 */

const RAIZ = process.cwd();
const HTML = readFileSync(join(RAIZ, 'index.html'), 'utf-8');
const MANIFEST = JSON.parse(
  readFileSync(join(RAIZ, 'public', 'manifest.json'), 'utf-8'),
) as {
  name?: string;
  theme_color?: string;
  start_url?: string;
  display?: string;
  icons?: { src?: string; sizes?: string; type?: string; purpose?: string }[];
};

/** `<meta name="x" content="y">` com atributos em qualquer ordem. */
function metaContent(name: string): string | null {
  const tag = HTML.match(
    new RegExp(`<meta\\b(?=[^>]*\\bname="${name}")[^>]*>`, 'i'),
  )?.[0];
  return tag?.match(/\bcontent="([^"]*)"/i)?.[1] ?? null;
}

describe('index.html — app instalável (t_a7125912)', () => {
  it('linka o manifesto que existe em public/', () => {
    expect(HTML).toMatch(/rel="manifest"[^>]*href="\/manifest\.json"/i);
    expect(existsSync(join(RAIZ, 'public', 'manifest.json'))).toBe(true);
    expect(MANIFEST.name?.trim()).toBeTruthy();
  });

  it('linka o ícone Apple que existe em public/', () => {
    expect(HTML).toMatch(/rel="apple-touch-icon"[^>]*href="\/apple-touch-icon\.png"/i);
    expect(existsSync(join(RAIZ, 'public', 'apple-touch-icon.png'))).toBe(true);
  });

  it('declara theme-color igual ao theme_color do manifesto', () => {
    const themeColor = metaContent('theme-color');
    expect(themeColor).toBe(MANIFEST.theme_color);
    expect(themeColor?.trim()).toBeTruthy();
  });

  it('declara as meta tags de app instalável (capable, iOS)', () => {
    expect(metaContent('mobile-web-app-capable')).toBe('yes');
    expect(metaContent('apple-mobile-web-app-capable')).toBe('yes');
    expect(metaContent('apple-mobile-web-app-status-bar-style')).toBeTruthy();
    expect(metaContent('apple-mobile-web-app-title')?.trim()).toBeTruthy();
  });
});

describe('manifest — requisitos de instalabilidade (t_a7125912)', () => {
  it('declara nome, start_url, display standalone e ícones 192/512 existentes', () => {
    expect(MANIFEST.name?.trim()).toBeTruthy();
    expect(MANIFEST.start_url).toBe('/');
    expect(['standalone', 'fullscreen', 'minimal-ui']).toContain(MANIFEST.display);

    const icones = MANIFEST.icons ?? [];
    for (const tamanho of ['192x192', '512x512']) {
      const icone = icones.find(
        (i) => i.sizes === tamanho && i.type === 'image/png' && i.purpose !== 'maskable',
      );
      expect(icone, `manifesto sem ícone ${tamanho} "any"`).toBeTruthy();
      expect(existsSync(join(RAIZ, 'public', (icone?.src ?? '').replace(/^\//, '')))).toBe(true);
    }
  });
});

describe('Install — a tela não promete offline (t_a7125912)', () => {
  function renderizar() {
    return render(
      <MemoryRouter>
        <Install />
      </MemoryRouter>,
    );
  }

  it('não anuncia "Funciona Offline" nem dados "sem internet"', () => {
    renderizar();

    expect(screen.queryByText(/offline/i)).toBeNull();
    expect(screen.queryByText(/sem internet/i)).toBeNull();
    expect(screen.queryByText(/mesmo sem/i)).toBeNull();
    // A tela continua útil: um benefício real substituiu a promessa falsa.
    expect(screen.getByText('Tela Inteira')).toBeInTheDocument();
  });
});
