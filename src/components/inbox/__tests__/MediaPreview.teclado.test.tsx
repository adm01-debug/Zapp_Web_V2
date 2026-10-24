import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

/**
 * U2 — abrir o documento e o vídeo do balão pelo TECLADO.
 *
 * Antes: o `onClick` era a única porta. `DocumentPreview` e `VideoPreview` eram `<div>` sem
 * papel e sem `tabIndex`, então quem navega por teclado (ou leitor de tela) não alcançava o
 * cartão nem conseguia abri-lo — abrir era privilégio do mouse. A V3 já tinha `role="button"`
 * + `tabIndex` + `Enter`/`Espaço`; aqui não.
 *
 * O que estes testes provam, no DOM renderizado (não em mock do componente):
 *  - o cartão é um botão com nome acessível e `tabIndex=0` (alcançável por Tab);
 *  - `Enter` e `Espaço` abrem o documento (`window.open` espiado) e o `Espaço` não rola a conversa;
 *  - a tecla de um botão INTERNO (Baixar) não abre o documento junto — sem isso, o `keydown`
 *    subiria até o contêiner e um `Enter` no Baixar abriria a aba além de baixar;
 *  - o quadro do vídeo abre a tela cheia pelo `Enter`, e com erro de carregamento deixa de ser
 *    botão (não fica um botão inerte na ordem de tabulação).
 */

const estado = vi.hoisted(() => ({ forcarFalha: false }));

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  const passthrough = (tag: string) =>
      React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
        const { whileHover, whileTap, initial, animate, exit, transition, variants, ...rest } = props;
        void whileHover; void whileTap; void initial; void animate; void exit; void transition; void variants;
        return React.createElement(tag, { ...rest, ref });
      });
  return {
    ...actual,

    motion: {
      div: passthrough('div'),
      span: passthrough('span'),
      button: passthrough('button'),
      img: passthrough('img'),
    },
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
    useReducedMotion: () => false,
  };
});

vi.mock('@/hooks/storage/useResolvedStorageUrl', () => ({
  useResolvedStorageUrl: (source: string) => ({
    url: estado.forcarFalha ? '' : source,
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

vi.mock('@/hooks/system/useDownloadPermission', () => ({
  useDownloadPermission: () => ({ canDownload: true, isLoading: false }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/hooks/communication/useMediaElementVolume', () => ({
  useMediaElementVolume: () => ({ gain: 0.64, muted: false }),
}));

vi.mock('@/lib/mediaVolumeElement', () => ({
  detectVideoAudioTrack: () => true,
}));

vi.mock('../MediaVolumeControl', () => ({
  MediaVolumeControl: () => null,
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  TooltipTrigger: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  TooltipContent: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
}));

import { DocumentPreview, VideoPreview } from '../MediaPreview';

function renderDocumento() {
  return render(
    <DocumentPreview url="https://cdn.test/contrato.pdf" fileName="contrato.pdf" fileSize={2048} isSent={false} />,
  );
}

describe('U2 — documento do balão abre pelo teclado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estado.forcarFalha = false;
  });

  it('o cartão é um botão com nome acessível e entra na ordem do Tab', () => {
    renderDocumento();
    const cartao = screen.getByRole('button', { name: 'Abrir documento contrato.pdf' });

    expect(cartao).toHaveAttribute('tabindex', '0');
    expect(cartao.getAttribute('class')).toContain('focus-visible:ring-2');
  });

  it('Enter no cartão abre o documento em nova aba', () => {
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null);
    renderDocumento();

    const cartao = screen.getByRole('button', { name: 'Abrir documento contrato.pdf' });
    cartao.focus();
    expect(document.activeElement).toBe(cartao);
    fireEvent.keyDown(cartao, { key: 'Enter' });

    expect(abrir).toHaveBeenCalledWith('https://cdn.test/contrato.pdf', '_blank', 'noopener,noreferrer');
    abrir.mockRestore();
  });

  it('Espaço abre o documento e o preventDefault evita rolar a conversa', () => {
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null);
    renderDocumento();

    const cartao = screen.getByRole('button', { name: 'Abrir documento contrato.pdf' });
    // fireEvent devolve false quando o handler chamou preventDefault.
    const naoConsumido = fireEvent.keyDown(cartao, { key: ' ' });

    expect(naoConsumido).toBe(false);
    expect(abrir).toHaveBeenCalledTimes(1);
    abrir.mockRestore();
  });

  it('tecla no botão Baixar não abre o documento junto', () => {
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null);
    renderDocumento();

    const baixar = screen.getByRole('button', { name: 'Baixar contrato.pdf' });
    fireEvent.keyDown(baixar, { key: 'Enter' });

    expect(abrir).not.toHaveBeenCalled();
    abrir.mockRestore();
  });
});

describe('U2 — vídeo do balão abre pelo teclado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estado.forcarFalha = false;
  });

  it('o quadro do vídeo é um botão e o Enter abre a tela cheia', () => {
    render(<VideoPreview url="https://cdn.test/clipe.mp4" isSent={false} />);

    const quadro = screen.getByRole('button', { name: 'Abrir vídeo em tela cheia' });
    expect(quadro).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(quadro, { key: 'Enter' });

    expect(screen.getByRole('dialog', { name: 'Vídeo em tela cheia' })).toBeInTheDocument();
  });

  it('com erro de carregamento o quadro deixa de ser botão', () => {
    estado.forcarFalha = true;
    render(<VideoPreview url="https://cdn.test/clipe.mp4" isSent={false} />);

    expect(screen.queryByRole('button', { name: 'Abrir vídeo em tela cheia' })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
