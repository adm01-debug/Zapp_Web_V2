import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import type { WhatsAppStatusMessage } from '@/hooks/integrations/useWhatsAppStatus';

// --- Mocks -------------------------------------------------------------------
// framer-motion: mantém `useReducedMotion` controlável e troca as peças animadas
// por divs simples (o teste mede o COMPORTAMENTO: qual transição o componente
// escolhe em cada modo, não a animação em si).
const fm = vi.hoisted(() => ({ reduced: false }));
vi.mock('framer-motion', async () => {
  const React = await import('react');
  const motionDiv = ({
    initial,
    animate,
    exit,
    transition,
    ...rest
  }: Record<string, unknown>) => {
    void animate;
    void exit;
    void transition;
    const initialX =
      initial && typeof initial === 'object' && 'x' in (initial as Record<string, unknown>)
        ? String((initial as Record<string, unknown>).x)
        : '';
    return React.createElement('div', { ...rest, 'data-initial-x': initialX });
  };
  return {
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
vi.mock('@/hooks/integrations/useEvolutionApi', () => ({
  useEvolutionApi: () => ({ getMediaBase64: evolution.getMediaBase64 }),
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
