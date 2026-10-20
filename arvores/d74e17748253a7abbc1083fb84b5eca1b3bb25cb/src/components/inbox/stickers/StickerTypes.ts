export interface StickerItem {
  id: string;
  name: string | null;
  image_url: string;
  category: string;
  is_favorite: boolean;
  use_count: number;
  owner_id?: string | null;
}

export const CATEGORY_LABELS: Record<string, { emoji: string; label: string }> = {
  'pessoal': { emoji: '📸', label: 'Pessoal' },
  'comemoração': { emoji: '🎉', label: 'Comemoração' },
  'riso': { emoji: '😂', label: 'Riso' },
  'chorando': { emoji: '😢', label: 'Chorando' },
  'amor': { emoji: '❤️', label: 'Amor' },
  'raiva': { emoji: '😡', label: 'Raiva' },
  'surpresa': { emoji: '😲', label: 'Surpresa' },
  'pensativo': { emoji: '🤔', label: 'Pensativo' },
  'cumprimento': { emoji: '👋', label: 'Cumprimento' },
  'despedida': { emoji: '👋', label: 'Despedida' },
  'concordância': { emoji: '👍', label: 'Concordância' },
  'negação': { emoji: '🙅', label: 'Negação' },
  'sono': { emoji: '😴', label: 'Sono' },
  'fome': { emoji: '🍔', label: 'Fome' },
  'medo': { emoji: '😨', label: 'Medo' },
  'vergonha': { emoji: '🙈', label: 'Vergonha' },
  'deboche': { emoji: '😏', label: 'Deboche' },
  'fofo': { emoji: '🥰', label: 'Fofo' },
  'triste': { emoji: '😔', label: 'Triste' },
  'animado': { emoji: '🤩', label: 'Animado' },
  'engraçado': { emoji: '🤣', label: 'Engraçado' },
  'outros': { emoji: '📦', label: 'Outros' },
  'recebidas': { emoji: '📥', label: 'Recebidas' },
  'enviadas': { emoji: '📤', label: 'Enviadas' },
};

export const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS);

export interface PendingUpload {
  file: File;
  imageUrl: string;
  storagePath: string;
  aiCategory: string;
  selectedCategory: string;
  name: string;
}
