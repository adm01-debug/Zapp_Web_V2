/**
 * Doc 11 (achado G10) — a mesma lista de categorias de áudio-meme estava escrita
 * duas vezes: 21 valores no seletor do inbox e 8 rótulos diferentes no admin.
 * Agora existe UMA fonte (`src/lib/audioMemeCategories.ts`) e o que não estiver
 * nela cai em "Outros", com rótulo legível — nunca no valor cru.
 */
import { describe, it, expect } from 'vitest';
import {
  AUDIO_MEME_CATEGORIES,
  AUDIO_MEME_CATEGORY_IDS,
  AUDIO_MEME_OUTROS,
  audioMemeCategory,
  audioMemeCategoryEmojis,
} from '../audioMemeCategories';

/** As 21 categorias que a Edge Function `classify-audio-meme` pode devolver. */
const ESPERADAS = [
  'risada', 'aplausos', 'suspense', 'vitória', 'falha', 'surpresa', 'triste', 'raiva',
  'romântico', 'medo', 'deboche', 'narração', 'bordão', 'efeito sonoro', 'viral',
  'cumprimento', 'despedida', 'animação', 'drama', 'gospel', 'outros',
];

describe('categorias de áudio-meme — fonte única', () => {
  it('cobre exatamente as 21 categorias da Edge, na mesma ordem', () => {
    expect(AUDIO_MEME_CATEGORY_IDS).toEqual(ESPERADAS);
    expect(AUDIO_MEME_CATEGORIES).toHaveLength(21);
  });

  it('toda categoria conhecida tem emoji e rótulo legível', () => {
    for (const cat of AUDIO_MEME_CATEGORIES) {
      expect(cat.emoji).not.toBe('');
      expect(cat.label).not.toBe('');
      expect(cat.label).not.toBe(cat.id); // rótulo não é o id cru
    }
  });

  it('categoria desconhecida cai em "Outros" com rótulo legível', () => {
    const info = audioMemeCategory('trollagem-da-casa');
    expect(info.label).toBe('Outros');
    expect(info.emoji).toBe('📦');
    expect(info.label).not.toBe('trollagem-da-casa');
  });

  it('categoria conhecida preserva id, emoji e rótulo', () => {
    expect(audioMemeCategory('risada')).toEqual({ id: 'risada', emoji: '😂', label: 'Risada' });
    expect(audioMemeCategory('narração').emoji).toBe('🎙️');
  });

  it('o mapa id → emoji do admin sai da MESMA lista', () => {
    const emojis = audioMemeCategoryEmojis();
    expect(Object.keys(emojis)).toEqual(ESPERADAS);
    expect(emojis.outros).toBe(AUDIO_MEME_OUTROS.emoji);
    expect(emojis.falha).toBe(audioMemeCategory('falha').emoji);
  });
});
