import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import React from 'react';

/**
 * U2 — a tela cheia do vídeo é um diálogo de verdade.
 *
 * Antes: a sobreposição era um `<div>` sem papel e sem nome, o `Esc` não fechava, o foco ficava
 * onde estava (no gatilho) e o botão "Baixar" desabilitado ainda tinha um `onClick` que disparava
 * um toast de bloqueio. Leitor de tela não anunciava diálogo nenhum e quem usa teclado ficava preso.
 *
 * O que estes testes provam, no DOM renderizado:
 *  - `role="dialog"` + `aria-modal` + nome acessível ("Vídeo em tela cheia");
 *  - o foco inicial entra no "Fechar" e, ao fechar, volta ao gatilho;
 *  - `Esc` fecha e NAO vaza para o painel de baixo (stopPropagation no próprio diálogo);
 *  - o controle de velocidade anuncia a velocidade atual no nome acessível;
 *  - o "Baixar" desabilitado não faz nada ao clique;
 *  - axe sem violação no diálogo renderizado;
 *  - reduzir movimento desliga o fade de entrada/saída, e sem ele o fade continua.
 */

const estado = vi.hoisted(() => ({
  reduzirMovimento: false,
  propsDeMovimento: [] as Record<string, unknown>[],
}));

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal();
  const passthrough = (tag: string) =>
      React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
        const { whileHover, whileTap, initial, animate, exit, transition, variants, ...rest } = props;
        void whileHover; void whileTap; void transition; void variants;
        estado.propsDeMovimento.push({ ...rest, initial, animate, exit });
        return React.createElement(tag, { ...rest, ref });
      });
  return {
    ...actual,

    motion: {
      div: passthrough('div'),
      span: passthrough('span'),
      button: passthrough('button'),
    },
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
    useReducedMotion: () => estado.reduzirMovimento,
  };
});

vi.mock('@/hooks/communication/useMediaElementVolume', () => ({
  useMediaElementVolume: () => ({ gain: 0.64, muted: false }),
}));

vi.mock('@/lib/mediaVolumeElement', () => ({
  detectVideoAudioTrack: () => true,
}));

vi.mock('../MediaVolumeControl', () => ({
  MediaVolumeControl: () => null,
}));

vi.mock('@/hooks/storage/useResolvedStorageUrl', () => ({
  useResolvedStorageUrl: (source: string) => ({ url: source, isLoading: false, error: null, refresh: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { toast } from 'sonner';
import { VideoFullscreen } from '../VideoFullscreen';

const URL_VIDEO = 'https://cdn.test/clipe-em-tela-cheia.mp4';

function abrir(extra?: { onClose?: () => void }) {
  return render(<VideoFullscreen url={URL_VIDEO} onClose={extra?.onClose ?? vi.fn()} />);
}

/** Cenario real: um gatilho no balão que abre e fecha a tela cheia. */
function Cenario() {
  const [aberto, setAberto] = React.useState(false);
  return (
    <div>
      <button type="button" onClick={() => setAberto(true)}>Ver em tela cheia</button>
      {aberto && <VideoFullscreen url={URL_VIDEO} onClose={() => setAberto(false)} />}
    </div>
  );
}

function propsDoDialogo() {
  return estado.propsDeMovimento.find((props) => props.role === 'dialog');
}

beforeEach(() => {
  vi.clearAllMocks();
  estado.reduzirMovimento = false;
  estado.propsDeMovimento.length = 0;
});

describe('U2 — VideoFullscreen é um diálogo', () => {
  it('tem papel de diálogo, é modal e tem nome acessível', () => {
    abrir();

    const dialogo = screen.getByRole('dialog', { name: 'Vídeo em tela cheia' });
    expect(dialogo).toHaveAttribute('aria-modal', 'true');
  });

  it('abre com o foco no botão Fechar', () => {
    abrir();

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fechar' }));
  });

  it('Esc fecha o vídeo e devolve o foco ao gatilho', () => {
    render(<Cenario />);
    const gatilho = screen.getByRole('button', { name: 'Ver em tela cheia' });
    gatilho.focus();
    fireEvent.click(gatilho);
    expect(screen.getByRole('dialog', { name: 'Vídeo em tela cheia' })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Fechar' }), { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(gatilho);
  });

  it('Esc do diálogo não vaza para o painel de baixo', () => {
    const escutaDoPainel = vi.fn();
    document.addEventListener('keydown', escutaDoPainel);
    try {
      abrir();
      const naoConsumido = fireEvent.keyDown(screen.getByRole('button', { name: 'Fechar' }), { key: 'Escape' });

      // não deu preventDefault (a tecla segue legível), mas não subiu até o documento
      expect(naoConsumido).toBe(true);
      expect(escutaDoPainel).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', escutaDoPainel);
    }
  });

  it('o controle de velocidade anuncia a velocidade atual', () => {
    abrir();

    const velocidade = screen.getByRole('button', { name: 'Velocidade de reprodução: 1x' });
    fireEvent.click(velocidade);

    expect(screen.getByRole('button', { name: 'Velocidade de reprodução: 1.25x' })).toBeInTheDocument();
  });

  it('o botão Baixar desabilitado não dispara nada ao clique', () => {
    const abrirAba = vi.spyOn(window, 'open').mockReturnValue(null);
    abrir();

    const baixar = screen.getByRole('button', { name: 'Baixar' });
    expect(baixar).toBeDisabled();
    fireEvent.click(baixar);

    // Antes o "Baixar" (desabilitado) ainda carregava um onClick que chamava `toast.error`.
    // No jsdom o clique de um botão desabilitado sobe mesmo assim; no navegador ele nem é
    // disparado. O que se prova aqui é o que o cartão pede: nenhum efeito, nenhum download.
    expect(toast.error).not.toHaveBeenCalled();
    expect(abrirAba).not.toHaveBeenCalled();
    abrirAba.mockRestore();
  });

  it('axe sem violação no diálogo renderizado', async () => {
    abrir();

    const resultado = await axe(document.body, {
      rules: { region: { enabled: false }, 'color-contrast': { enabled: false } },
    });

    expect(resultado).toHaveNoViolations();
  });
});

describe('U2 — VideoFullscreen respeita reduzir movimento', () => {
  it('com reduzir movimento, entra sem fade (initial=false)', () => {
    estado.reduzirMovimento = true;
    abrir();

    const props = propsDoDialogo();
    expect(props?.initial).toBe(false);
    expect(props?.exit).toEqual({ opacity: 1 });
  });

  it('sem reduzir movimento, entra com fade e sai com fade', () => {
    estado.reduzirMovimento = false;
    abrir();

    const props = propsDoDialogo();
    expect(props?.initial).toEqual({ opacity: 0 });
    expect(props?.exit).toEqual({ opacity: 0 });
  });
});
