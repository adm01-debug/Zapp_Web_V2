/**
 * O cartão troca o nome do produto no título da aba ("WhatsApp Omnichannel" ->
 * "ZAPP WEB", o mesmo do `index.html`). O título da aba é escrito por dois
 * consumidores: `useDocumentTitle` (a tela) e o badge "(n) " de pendências
 * (`useDocumentBadge`, padrão de e-mail). Este teste é o do badge: com o título
 * JÁ montado por `formatDocumentTitle`, o prefixo continua entrando ao esconder
 * a aba e saindo ao voltar — sem empilhar contagens e sem perder o sufixo.
 */
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { formatDocumentTitle } from '@/lib/productName';
import { useDocumentBadge } from '../useDocumentBadge';

/** Estado da aba + evento real que o hook escuta (o popup usa o mesmo evento). */
function abaVisivel(visivel: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, value: !visivel });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useDocumentBadge — com o título novo do produto', () => {
  afterEach(() => {
    document.title = '';
    abaVisivel(true);
  });

  it('prefixa "(n) " só com a aba em segundo plano e devolve o título ao voltar', () => {
    document.title = formatDocumentTitle('Tela');
    expect(document.title).toBe('Tela | ZAPP WEB');

    renderHook(() => useDocumentBadge(3));
    // Visível: título intacto.
    expect(document.title).toBe('Tela | ZAPP WEB');

    abaVisivel(false);
    expect(document.title).toBe('(3) Tela | ZAPP WEB');

    abaVisivel(true);
    expect(document.title).toBe('Tela | ZAPP WEB');
  });

  it('não prefixa quando não há pendência e não empilha contagens', () => {
    document.title = formatDocumentTitle('Tela');

    renderHook(() => useDocumentBadge(0));
    abaVisivel(false);
    expect(document.title).toBe('Tela | ZAPP WEB');

    // Um segundo badge sobre o mesmo título não vira "(2) (1) Tela | ZAPP WEB".
    document.title = '(1) Tela | ZAPP WEB';
    renderHook(() => useDocumentBadge(2));
    abaVisivel(true);
    abaVisivel(false);
    expect(document.title).toBe('(2) Tela | ZAPP WEB');
  });

  it('remove o prefixo ao desmontar, preservando o sufixo do produto', () => {
    document.title = formatDocumentTitle('Tela');

    const { unmount } = renderHook(() => useDocumentBadge(4));
    abaVisivel(false);
    expect(document.title).toBe('(4) Tela | ZAPP WEB');

    unmount();
    expect(document.title).toBe('Tela | ZAPP WEB');
  });
});
