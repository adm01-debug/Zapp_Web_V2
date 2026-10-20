import { describe, it, expect } from 'vitest';
import { getMediaType } from '@/components/inbox/media-gallery/mediaUtils';

/**
 * #309 / R2-INB-012 — o `message_type` do banco (fonte dos contadores da galeria) precisa
 * vencer a extensao ambigua. Antes, `.webm` estava na lista de video e vencia
 * `message_type='audio'`, entao uma nota de voz (WebM) aparecia em "Videos" enquanto o
 * chip contava em "Audio" — divergencia entre listagem e contadores.
 */
describe('getMediaType — tipo explicito da mensagem vence a extensao ambigua (#309)', () => {
  it('audio WebM (voz do WhatsApp) e classificado como audio, nao video', () => {
    expect(getMediaType('https://x/storage/audio-messages/c1/voice.webm', 'audio')).toBe('audio');
  });

  it('ptt WebM (message_type ptt) continua audio', () => {
    expect(getMediaType('https://x/storage/audio-messages/c1/voice.webm', 'ptt')).toBe('audio');
  });

  it('audio em container MP4 nao vira video', () => {
    expect(getMediaType('https://x/nota-de-voz.mp4', 'audio')).toBe('audio');
  });

  it('video WebM com message_type video continua video', () => {
    expect(getMediaType('https://x/clipe.webm', 'video')).toBe('video');
  });

  it('imagem com extensao de video continua imagem (message_type manda)', () => {
    expect(getMediaType('https://x/foto-persistida.mp4', 'image')).toBe('image');
  });

  it('sticker WebP e imagem (com ou sem metadata equivalente)', () => {
    expect(getMediaType('https://x/figurinha.webp', 'sticker')).toBe('image');
  });

  it('sem message_type cai no fallback por extensao (registros legados)', () => {
    expect(getMediaType('https://x/a.jpg', '')).toBe('image');
    expect(getMediaType('https://x/b.webm', '')).toBe('video');
    expect(getMediaType('https://x/arquivo.webm?token=1', '')).toBe('video');
  });
});
