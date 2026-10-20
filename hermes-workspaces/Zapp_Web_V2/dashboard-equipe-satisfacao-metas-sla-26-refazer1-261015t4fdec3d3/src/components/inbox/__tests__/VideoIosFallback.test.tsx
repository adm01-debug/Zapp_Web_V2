import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

/**
 * VOL-04 — fallback de vídeo no iOS: o elemento precisa ser CORS-limpo e tocar embutido.
 *
 * No iOS/Safari `HTMLMediaElement.volume` é SOMENTE-LEITURA (D5/E09/E10), então o app cai
 * no caminho `GainNode`/WebAudio (`src/lib/mediaVolumeElement.ts`). Esse caminho chama
 * `createMediaElementSource(element)`, que só aceita mídia CORS-limpa: numa URL assinada
 * cross-origin SEM `crossOrigin="anonymous"` a chamada lança `SecurityError`, o `catch`
 * (mediaVolumeElement.ts:108) a engole e o ganho cai no `element.volume = gain` — no-op
 * silencioso no iOS. Resultado: o slider de volume do app não muda nada no vídeo e o
 * defeito fica invisível. O `<audio>` de mensagem já usa `crossOrigin="anonymous"`
 * (`AudioMessagePlayer.tsx`); os vídeos controlados pelo app não usavam.
 *
 * Sem `playsInline` o iOS sequestra o vídeo para o player nativo em tela cheia, e os
 * controles do app (o `MediaVolumeControl` do fullscreen) somem. O preview do balão já
 * tinha `playsInline` (MediaPreview.tsx); o fullscreen e a galeria não.
 *
 * Estes testes provam a presença das duas proteções no DOM renderizado, que é o que dá
 * viabilidade ao fallback ANTES de qualquer aparelho real entrar na conta.
 */

vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      const { whileHover, whileTap, initial, animate, exit, transition, variants, ...rest } = props;
      return React.createElement('div', { ...rest, ref });
    }),
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
}));

// Foco no DOM do <video>: o hook de volume e a sonda de faixa de áudio entram stubados.
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

import { VideoFullscreen } from '../VideoFullscreen';
import { MediaPreviewDialog } from '../media-gallery/MediaPreviewDialog';
import type { MediaItem } from '../media-gallery/mediaUtils';

/** O <video> do app precisa aceitar `createMediaElementSource` no caminho WebAudio do iOS. */
function expectIosVideoFallbackReady(video: HTMLVideoElement | null) {
  expect(video, 'esperava um <video> renderizado').not.toBeNull();
  const el = video as HTMLVideoElement;
  expect(
    el.getAttribute('crossorigin'),
    'sem crossOrigin="anonymous" o createMediaElementSource sobre a URL assinada '
      + 'cross-origin lança SecurityError e o volume do vídeo vira um no-op silencioso no iOS',
  ).toBe('anonymous');
  expect(
    el.hasAttribute('playsinline'),
    'sem playsInline o iOS sequestra o vídeo para o player nativo e os controles do app somem',
  ).toBe(true);
}

beforeEach(() => vi.clearAllMocks());

describe('VOL-04 — vídeo em tela cheia (VideoFullscreen) pronto para o fallback do iOS', () => {
  it('o <video> é CORS-limpo (crossOrigin) e toca embutido (playsInline)', () => {
    render(<VideoFullscreen url="https://signed.test/video.mp4" onClose={() => {}} />);
    expectIosVideoFallbackReady(document.body.querySelector('video'));
  });
});

describe('VOL-04 — vídeo da galeria (MediaPreviewDialog) pronto para o fallback do iOS', () => {
  it('o <video> é CORS-limpo (crossOrigin) e toca embutido (playsInline)', () => {
    const video: MediaItem & { displayName: string } = {
      id: 'v1',
      url: 'https://signed.test/galeria.mp4',
      type: 'video',
      filename: 'galeria-original.mp4',
      created_at: '2026-01-10T10:00:00.000Z',
      caption: null,
      displayName: 'Vídeo da conversa',
    };
    render(<MediaPreviewDialog item={video} open onOpenChange={() => {}} />);
    expectIosVideoFallbackReady(document.body.querySelector('video'));
  });
});
