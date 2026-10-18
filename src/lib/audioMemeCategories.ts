/**
 * Fonte única das categorias de áudio-meme.
 *
 * A lista abaixo é a mesma da Edge Function `classify-audio-meme`
 * (`supabase/functions/classify-audio-meme/index.ts`) — os 21 valores que a IA
 * pode devolver. Antes havia duas listas no front (21 no `AudioMemePicker` e 8
 * no `useMediaLibrary`), então uma categoria criada no admin aparecia crua ou
 * fora do filtro. Aqui a definição é só esta; quem precisa de mapa ou de
 * opções de `<Select>` deriva daqui.
 */

export interface AudioMemeCategory {
  /** Valor gravado em `audio_memes.category` (minúsculo, sem acento no id). */
  id: string;
  emoji: string;
  label: string;
}

export const AUDIO_MEME_CATEGORIES: readonly AudioMemeCategory[] = [
  { id: 'risada', emoji: '😂', label: 'Risada' },
  { id: 'aplausos', emoji: '👏', label: 'Aplausos' },
  { id: 'suspense', emoji: '🎭', label: 'Suspense' },
  { id: 'vitória', emoji: '🏆', label: 'Vitória' },
  { id: 'falha', emoji: '💥', label: 'Falha' },
  { id: 'surpresa', emoji: '😱', label: 'Surpresa' },
  { id: 'triste', emoji: '😢', label: 'Triste' },
  { id: 'raiva', emoji: '😡', label: 'Raiva' },
  { id: 'romântico', emoji: '💕', label: 'Romântico' },
  { id: 'medo', emoji: '👻', label: 'Medo' },
  { id: 'deboche', emoji: '😏', label: 'Deboche' },
  { id: 'narração', emoji: '🎙️', label: 'Narração' },
  { id: 'bordão', emoji: '💬', label: 'Bordão' },
  { id: 'efeito sonoro', emoji: '🔊', label: 'Efeito Sonoro' },
  { id: 'viral', emoji: '🔥', label: 'Viral' },
  { id: 'cumprimento', emoji: '👋', label: 'Cumprimento' },
  { id: 'despedida', emoji: '👋', label: 'Despedida' },
  { id: 'animação', emoji: '🤩', label: 'Animação' },
  { id: 'drama', emoji: '🎬', label: 'Drama' },
  { id: 'gospel', emoji: '⛪', label: 'Gospel' },
  { id: 'outros', emoji: '📦', label: 'Outros' },
];

/** Valor usado quando a categoria gravada não está na lista acima. */
export const AUDIO_MEME_OUTROS: AudioMemeCategory = AUDIO_MEME_CATEGORIES[AUDIO_MEME_CATEGORIES.length - 1];

/** Ids na ordem da lista, para grades de filtro/seleção. */
export const AUDIO_MEME_CATEGORY_IDS: readonly string[] = AUDIO_MEME_CATEGORIES.map((c) => c.id);

const POR_ID = new Map<string, AudioMemeCategory>(AUDIO_MEME_CATEGORIES.map((c) => [c.id, c]));

/**
 * Emoji e rótulo de uma categoria. Categoria desconhecida (linha antiga ou
 * criada fora da lista) cai em "Outros" com rótulo legível — nunca no valor cru.
 */
export function audioMemeCategory(id: string | null | undefined): AudioMemeCategory {
  if (!id) return AUDIO_MEME_OUTROS;
  return POR_ID.get(id) ?? { ...AUDIO_MEME_OUTROS, id };
}

/** Mapa id → emoji, no formato que o admin de mídias consome. */
export function audioMemeCategoryEmojis(): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (const categoria of AUDIO_MEME_CATEGORIES) mapa[categoria.id] = categoria.emoji;
  return mapa;
}
