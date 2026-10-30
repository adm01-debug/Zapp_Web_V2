/**
 * Título da JANELA destacada do chat — `popupManager.openChatPopup`.
 *
 * O popup da conversa tem DOIS lugares que escrevem o título do documento dele: o
 * `ChatPopup` (a página que roda dentro da janela) e este módulo, no evento
 * `load`, quando a janela termina de abrir. Os dois escreviam o mesmo literal
 * solto `Chat — <nome>`; com a marca em uma constante só (`@/lib/productName`),
 * os dois têm de assinar igual — senão o que o ChatPopup escreve é sobrescrito
 * por um título sem o nome do produto assim que a janela carrega.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PRODUCT_NAME, formatDocumentTitle } from '../productName';
import { closeAllPopups, openChatPopup } from '../popupManager';

type JanelaFalsa = {
  closed: boolean;
  focus: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  document: { title: string };
  addEventListener: (evento: string, ouvinte: () => void) => void;
};

function abrirJanelaFalsa(): { janela: JanelaFalsa; carregar: () => void } {
  const ouvintes: (() => void)[] = [];
  const janela: JanelaFalsa = {
    closed: false,
    focus: vi.fn(),
    close: vi.fn(),
    document: { title: '' },
    addEventListener: (evento, ouvinte) => {
      if (evento === 'load') ouvintes.push(ouvinte);
    },
  };
  vi.spyOn(window, 'open').mockReturnValue(janela as unknown as Window);
  return { janela, carregar: () => ouvintes.forEach((ouvinte) => ouvinte()) };
}

describe('popupManager — título da janela destacada', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    closeAllPopups();
    vi.restoreAllMocks();
  });

  it('assina o título da janela com o nome do produto, no mesmo formato do ChatPopup', () => {
    const { janela, carregar } = abrirJanelaFalsa();

    openChatPopup('contato-popup-9', 'Maria Silva');
    expect(janela.document.title, 'o título é escrito no load, não antes').toBe('');

    carregar();
    expect(janela.document.title).toBe(formatDocumentTitle('Chat — Maria Silva'));
    expect(janela.document.title).toBe('Chat — Maria Silva | ZAPP WEB');
    expect(janela.document.title).not.toContain('WhatsApp Omnichannel');
    expect(PRODUCT_NAME).toBe('ZAPP WEB');
  });
});
