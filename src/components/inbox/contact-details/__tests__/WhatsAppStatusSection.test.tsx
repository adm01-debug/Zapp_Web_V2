import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import type { WhatsAppStatusMessage } from '@/hooks/integrations/useWhatsAppStatus';

// --- Mocks -------------------------------------------------------------------
// framer-motion: mantém `useReducedMotion` controlável e troca as peças animadas
// por divs simples, expondo como atributos o que o componente pediu para animar
// (o teste mede o COMPORTAMENTO: qual transform/transição o componente escolhe
// em cada modo, não a animação em si).
const fm = vi.hoisted(() => ({ reduced: false }));
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  const React = await import('react');
    const motionDiv = ({
      initial,
      animate,
      exit,
      transition,
      ...rest
    }: Record<string, unknown>) => {
      void exit;
      const initialX =
        initial && typeof initial === 'object' && 'x' in (initial as Record<string, unknown>)
          ? String((initial as Record<string, unknown>).x)
          : '';
      return React.createElement('div', {
        ...rest,
        'data-initial-x': initialX,
        'data-animate': animate ? JSON.stringify(animate) : '',
        'data-transition': transition ? JSON.stringify(transition) : '',
      });
    };
  return {
    ...actual,

    motion: { div: motionDiv },
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useReducedMotion: () => fm.reduced,
  };
});

const hookState = vi.hoisted(() => ({ data: {} as Record<string, unknown> }));
vi.mock('@/hooks/integrations/useWhatsAppStatus', () => ({
  useWhatsAppStatus: () => hookState.data,
}));

const evolution = vi.hoisted(() => ({ getMediaBase64: vi.fn() }));
// Devolve uma função NOVA a cada render (como o hook real pode fazer) para provar
// que a mídia não é rebuscada só porque a identidade da função mudou.
vi.mock('@/hooks/integrations/useEvolutionApi', () => ({
  useEvolutionApi: () => ({
    getMediaBase64: (...args: [string, WhatsAppStatusMessage, boolean]) => evolution.getMediaBase64(...args),
  }),
}));

import { WhatsAppStatusSection } from '../WhatsAppStatusSection';
import { STORY_DURATION_MS } from '../storyUtils';

// --- Fixtures ----------------------------------------------------------------
const textStory = (id: string, text: string): WhatsAppStatusMessage => ({
  id,
  fromMe: false,
  remoteJid: '5511999999999@s.whatsapp.net',
  key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, id },
  message: { extendedTextMessage: { text } },
  messageTimestamp: 1_700_000_000,
});

const imageStory = (id: string, caption?: string): WhatsAppStatusMessage => ({
  id,
  fromMe: false,
  remoteJid: '5511999999999@s.whatsapp.net',
  key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, id },
  message: { imageMessage: { url: 'https://evolution.example/private', caption, mimetype: 'image/jpeg' } },
  messageTimestamp: 1_700_000_000,
});

const setStatus = (statusMessages: WhatsAppStatusMessage[], overrides: Record<string, unknown> = {}) => {
  hookState.data = {
    statusMessages,
    presence: { isOnline: false, lastSeen: null, loading: false },
    instanceName: 'wpp2',
    loading: false,
    error: null,
    refresh: vi.fn(),
    ...overrides,
  };
};

const progressBars = () => screen.getAllByTestId('story-progress-bar');

describe('WhatsAppStatusSection', () => {
  beforeEach(() => {
    fm.reduced = false;
    evolution.getMediaBase64.mockReset();
    setStatus([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('some quando o contato não tem stories', () => {
    render(<WhatsAppStatusSection phone="5511999999999" />);
    expect(screen.queryByTestId('whatsapp-status-section')).not.toBeInTheDocument();
  });

  it('mostra skeleton enquanto carrega', () => {
    setStatus([], { loading: true });
    render(<WhatsAppStatusSection phone="5511999999999" />);
    expect(screen.getByTestId('whatsapp-status-loading')).toBeInTheDocument();
  });

  it('lista as miniaturas e marca story não visto com o anel colorido', () => {
    setStatus([textStory('a', 'primeiro'), textStory('b', 'segundo')]);
    render(<WhatsAppStatusSection phone="5511999999999" />);

    const thumbs = screen.getAllByTestId('whatsapp-status-thumb');
    expect(thumbs).toHaveLength(2);
    expect(thumbs[0]).toHaveAttribute('data-seen', 'false');
    expect(thumbs[0].className).toContain('ring-whatsapp');
  });

  it('cada miniatura é um botão focável, com nome acessível, e abre pelo teclado', () => {
    setStatus([textStory('a', 'primeiro')]);
    render(<WhatsAppStatusSection phone="5511999999999" />);

    const thumb = screen.getByTestId('whatsapp-status-thumb');
    expect(thumb.tagName).toBe('BUTTON');
    expect(thumb).not.toHaveAttribute('tabindex', '-1');
    expect(thumb).toHaveAttribute('aria-label', expect.stringContaining('não visto'));

    thumb.focus();
    expect(thumb).toHaveFocus();

    // botão nativo ativa com Enter/Espaço; aqui provamos que o botão focado abre o status
    fireEvent.click(thumb);
    expect(screen.getByTestId('story-viewer')).toBeInTheDocument();
  });

  it('busca a mídia SOB DEMANDA ao abrir o status, pelo caminho privado da V2', async () => {
    const story = imageStory('img-1', 'Legenda do status');
    evolution.getMediaBase64.mockResolvedValue({ base64: 'AAAA', mimetype: 'image/jpeg' });
    setStatus([story]);
    render(<WhatsAppStatusSection phone="5511999999999" />);

    expect(evolution.getMediaBase64).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('whatsapp-status-thumb'));

    const image = await screen.findByTestId('story-image');
    expect(image).toHaveAttribute('src', 'data:image/jpeg;base64,AAAA');
    expect(image).toHaveAttribute('alt', 'Legenda do status');
    expect(evolution.getMediaBase64).toHaveBeenCalledWith('wpp2', story, false);
  });

  it('não rebusca a mídia só porque o hook devolveu uma função nova (render de novo)', async () => {
    const story = imageStory('img-1', 'Legenda do status');
    evolution.getMediaBase64.mockResolvedValue({ base64: 'AAAA', mimetype: 'image/jpeg' });
    setStatus([story]);
    const { rerender } = render(<WhatsAppStatusSection phone="5511999999999" />);

    fireEvent.click(screen.getByTestId('whatsapp-status-thumb'));
    await screen.findByTestId('story-image');
    expect(evolution.getMediaBase64).toHaveBeenCalledTimes(1);

    rerender(<WhatsAppStatusSection phone="5511999999999" />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(evolution.getMediaBase64).toHaveBeenCalledTimes(1);
  });

  it('navega com as setas do teclado', () => {
    setStatus([textStory('a', 'primeiro'), textStory('b', 'segundo')]);
    render(<WhatsAppStatusSection phone="5511999999999" />);
    fireEvent.click(screen.getAllByTestId('whatsapp-status-thumb')[0]);

    const viewer = screen.getByTestId('story-viewer');
    expect(screen.getByTestId('story-text')).toHaveTextContent('primeiro');

    fireEvent.keyDown(viewer, { key: 'ArrowRight' });
    expect(screen.getByTestId('story-text')).toHaveTextContent('segundo');

    fireEvent.keyDown(viewer, { key: 'ArrowLeft' });
    expect(screen.getByTestId('story-text')).toHaveTextContent('primeiro');
  });

  it('navega pelos botões anterior e próximo, desabilitados nas pontas', () => {
    setStatus([textStory('a', 'primeiro'), textStory('b', 'segundo')]);
    render(<WhatsAppStatusSection phone="5511999999999" />);
    fireEvent.click(screen.getAllByTestId('whatsapp-status-thumb')[0]);

    const prev = screen.getByRole('button', { name: 'Status anterior' });
    const next = screen.getByRole('button', { name: 'Próximo status' });
    expect(prev).toBeDisabled();
    expect(next).toBeEnabled();

    fireEvent.click(next);
    expect(screen.getByTestId('story-text')).toHaveTextContent('segundo');
    expect(prev).toBeEnabled();
    expect(next).toBeDisabled();

    fireEvent.click(prev);
    expect(screen.getByTestId('story-text')).toHaveTextContent('primeiro');
    expect(prev).toBeDisabled();
  });

  it('fecha no Esc e marca o story como visto', async () => {
    setStatus([textStory('a', 'primeiro')]);
    render(<WhatsAppStatusSection phone="5511999999999" />);
    fireEvent.click(screen.getByTestId('whatsapp-status-thumb'));

    fireEvent.keyDown(screen.getByTestId('story-viewer'), { key: 'Escape' });

    await waitFor(() => expect(screen.queryByTestId('story-viewer')).not.toBeInTheDocument());
    expect(screen.getByTestId('whatsapp-status-thumb')).toHaveAttribute('data-seen', 'true');
    expect(screen.getByTestId('whatsapp-status-thumb').className).toContain('ring-border');
  });

  it('avança sozinho depois da duração do story', () => {
    vi.useFakeTimers();
    setStatus([textStory('a', 'primeiro'), textStory('b', 'segundo')]);
    render(<WhatsAppStatusSection phone="5511999999999" />);
    fireEvent.click(screen.getAllByTestId('whatsapp-status-thumb')[0]);
    expect(screen.getByTestId('story-text')).toHaveTextContent('primeiro');

    act(() => {
      vi.advanceTimersByTime(STORY_DURATION_MS);
    });

    expect(screen.getByTestId('story-text')).toHaveTextContent('segundo');
  });

  it('anima a barra só por transform (scaleX) e a duração dura o story', () => {
    setStatus([textStory('a', 'primeiro'), textStory('b', 'segundo')]);
    render(<WhatsAppStatusSection phone="5511999999999" />);
    fireEvent.click(screen.getAllByTestId('whatsapp-status-thumb')[0]);

    const bars = progressBars();
    expect(bars).toHaveLength(2);
    expect(bars[0]).toHaveAttribute('data-state', 'active');
    expect(bars[1]).toHaveAttribute('data-state', 'idle');

    const activeFill = bars[0].querySelector('[data-animate]');
    expect(activeFill).toHaveAttribute('data-animate', JSON.stringify({ scaleX: 1 }));
    expect(activeFill?.getAttribute('data-transition')).toContain(`"duration":${STORY_DURATION_MS / 1000}`);
    expect(activeFill?.getAttribute('data-transition')).toContain('"ease":"linear"');

    // a barra ainda não alcançada fica em scaleX 0 (não cresce por conta própria)
    expect(bars[1].querySelector('[data-animate]')).toHaveAttribute('data-animate', JSON.stringify({ scaleX: 0 }));
  });

  it('com movimento reduzido não desliza e a barra não anima', () => {
    fm.reduced = true;
    setStatus([textStory('a', 'primeiro'), textStory('b', 'segundo')]);
    render(<WhatsAppStatusSection phone="5511999999999" />);
    fireEvent.click(screen.getAllByTestId('whatsapp-status-thumb')[0]);

    const reduced = screen.getByTestId('story-viewer').querySelector('[data-motion="reduced"]');
    expect(reduced).toHaveAttribute('data-initial-x', '');

    const activeFill = progressBars()[0].querySelector('[data-animate]');
    expect(activeFill).toHaveAttribute('data-transition', JSON.stringify({ duration: 0 }));
  });

  it('com movimento completo entra deslizando; com movimento reduzido, só a opacidade', () => {
    setStatus([textStory('a', 'primeiro')]);
    const { unmount } = render(<WhatsAppStatusSection phone="5511999999999" />);
    fireEvent.click(screen.getByTestId('whatsapp-status-thumb'));
    const full = screen.getByTestId('story-viewer').querySelector('[data-motion="full"]');
    expect(full).toHaveAttribute('data-initial-x', '24');
    unmount();

    fm.reduced = true;
    render(<WhatsAppStatusSection phone="5511999999999" />);
    fireEvent.click(screen.getByTestId('whatsapp-status-thumb'));
    const reduced = screen.getByTestId('story-viewer').querySelector('[data-motion="reduced"]');
    expect(reduced).toHaveAttribute('data-initial-x', '');
  });
});
