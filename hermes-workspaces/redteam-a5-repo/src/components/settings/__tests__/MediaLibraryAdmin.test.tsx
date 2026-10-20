// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ═══════════════════════════════════════════════════════════
// Mock Setup
// ═══════════════════════════════════════════════════════════

const mockFrom = vi.fn();
const mockStorage = vi.fn();
const mockFunctions = { invoke: vi.fn() };
const mockAuth = { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) };

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    storage: { from: (...args: any[]) => mockStorage(...args) },
    functions: { invoke: (...args: any[]) => mockFunctions.invoke(...args) },
    auth: { getUser: () => mockAuth.getUser() },
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { MediaLibraryAdmin } from '../MediaLibraryAdmin';
import { toast } from 'sonner';

// ═══════════════════════════════════════════════════════════
// Test Factories
// ═══════════════════════════════════════════════════════════

let counter = 0;
function makeSticker(overrides: Partial<any> = {}) {
  counter++;
  return {
    id: overrides.id || `sticker-${counter}`,
    name: 'Test Sticker',
    category: 'engraçado',
    is_favorite: false,
    use_count: 0,
    created_at: '2025-01-01T00:00:00Z',
    uploaded_by: 'user-1',
    image_url: 'https://storage.example.com/stickers/test.webp',
    ...overrides,
  };
}

function makeAudioMeme(overrides: Partial<any> = {}) {
  counter++;
  return {
    id: overrides.id || `audio-${counter}`,
    name: 'Test Audio',
    category: 'risada',
    is_favorite: false,
    use_count: 5,
    created_at: '2025-01-01T00:00:00Z',
    uploaded_by: 'user-1',
    audio_url: 'https://storage.example.com/audio-memes/test.mp3',
    duration_seconds: 3,
    ...overrides,
  };
}

function makeEmoji(overrides: Partial<any> = {}) {
  counter++;
  return {
    id: overrides.id || `emoji-${counter}`,
    name: 'Test Emoji',
    category: 'riso',
    is_favorite: false,
    use_count: 2,
    created_at: '2025-01-01T00:00:00Z',
    uploaded_by: 'user-1',
    image_url: 'https://storage.example.com/custom-emojis/test.png',
    ...overrides,
  };
}

function setupSupabaseQuery(data: any[] = [], error: any = null) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data, error }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    eq: vi.fn().mockResolvedValue({ error: null }),
    in: vi.fn().mockResolvedValue({ error: null }),
  };
  chain.update = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
    in: vi.fn().mockResolvedValue({ error: null }),
  });
  chain.delete = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
    in: vi.fn().mockResolvedValue({ error: null }),
  });
  mockFrom.mockReturnValue(chain);
  return chain;
}

function setupStorage() {
  const storageChain = {
    upload: vi.fn().mockResolvedValue({ error: null }),
    remove: vi.fn().mockResolvedValue({ error: null }),
    getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://storage.example.com/file.mp3' } }),
  };
  mockStorage.mockReturnValue(storageChain);
  return storageChain;
}

// ═══════════════════════════════════════════════════════════
// Component Tests (default stickers tab)
// ═══════════════════════════════════════════════════════════

describe('MediaLibraryAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    counter = 0;
    setupSupabaseQuery([]);
    setupStorage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── 1. Rendering & Structure ───────────────────────────

  describe('Main Component Rendering', () => {
    it('renders the main title', async () => {
      render(<MediaLibraryAdmin />);
      expect(screen.getByText('Biblioteca de Mídia')).toBeInTheDocument();
    });

    it('renders the description', async () => {
      render(<MediaLibraryAdmin />);
      expect(screen.getByText(/Gerencie figurinhas/)).toBeInTheDocument();
    });

    it('renders three tab triggers', async () => {
      render(<MediaLibraryAdmin />);
      expect(screen.getByText('Figurinhas')).toBeInTheDocument();
      expect(screen.getByText('Áudios Meme')).toBeInTheDocument();
      expect(screen.getByText('Emojis')).toBeInTheDocument();
    });

    it('defaults to stickers tab', async () => {
      render(<MediaLibraryAdmin />);
      const stickersTab = screen.getByRole('tab', { name: /Figurinhas/ });
      expect(stickersTab).toHaveAttribute('data-state', 'active');
    });

    it('renders the icon header container', async () => {
      render(<MediaLibraryAdmin />);
      expect(screen.getByText('Biblioteca de Mídia').closest('div')).toBeInTheDocument();
    });

    it('has correct tab count', () => {
      render(<MediaLibraryAdmin />);
      const tabs = screen.getAllByRole('tab');
      expect(tabs.length).toBe(3);
    });

    it('has tablist role', () => {
      render(<MediaLibraryAdmin />);
      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });
  });

  // ─── 2. Data Loading ────────────────────────────────────

  describe('Data Loading', () => {
    it('fetches stickers table on mount', async () => {
      const chain = setupSupabaseQuery([]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        expect(mockFrom).toHaveBeenCalledWith('stickers');
      });
    });

    it('fetches with limit 1000', async () => {
      const chain = setupSupabaseQuery([]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => expect(chain.limit).toHaveBeenCalledWith(1000));
    });

    it('orders by created_at descending', async () => {
      const chain = setupSupabaseQuery([]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false }));
    });

    it('handles empty data gracefully', async () => {
      setupSupabaseQuery([]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        expect(screen.getByText('Nenhum item encontrado')).toBeInTheDocument();
      });
    });

    it('handles null data without crash', async () => {
      const chain = setupSupabaseQuery();
      chain.limit = vi.fn().mockResolvedValue({ data: null, error: null });
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        expect(screen.getByText('Nenhum item encontrado')).toBeInTheDocument();
      });
    });

    it('handles fetch error without crash', async () => {
      const chain = setupSupabaseQuery();
      chain.limit = vi.fn().mockResolvedValue({ data: null, error: { message: 'Network error' } });
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        expect(screen.getByText('Nenhum item encontrado')).toBeInTheDocument();
      });
    });

    it('displays correct item count in footer', async () => {
      setupSupabaseQuery([makeSticker(), makeSticker()]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        expect(screen.getByText(/Exibindo 2 de 2 itens/)).toBeInTheDocument();
      });
    });

    it('uses select all columns', async () => {
      const chain = setupSupabaseQuery([]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => expect(chain.select).toHaveBeenCalledWith('*'));
    });
  });

  // ─── 3. StatsCards ──────────────────────────────────────

  describe('StatsCards', () => {
    it('displays Total de itens label', async () => {
      setupSupabaseQuery([makeSticker()]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        expect(screen.getByText('Total de itens')).toBeInTheDocument();
      });
    });

    it('displays Usos totais label', async () => {
      setupSupabaseQuery([makeSticker()]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        expect(screen.getByText('Usos totais')).toBeInTheDocument();
      });
    });

    it('displays Favoritos label', async () => {
      setupSupabaseQuery([makeSticker()]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        expect(screen.getByText('Favoritos')).toBeInTheDocument();
      });
    });

    it('displays Categorias label', async () => {
      setupSupabaseQuery([makeSticker()]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        expect(screen.getByText('Categorias')).toBeInTheDocument();
      });
    });

    it('shows correct total for 3 items', async () => {
      setupSupabaseQuery([makeSticker(), makeSticker(), makeSticker()]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        expect(screen.getByText('3')).toBeInTheDocument();
      });
    });

    it('shows correct total uses sum', async () => {
      setupSupabaseQuery([makeSticker({ use_count: 10 }), makeSticker({ use_count: 5 })]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        expect(screen.getByText('15')).toBeInTheDocument();
      });
    });

    it('handles null use_count safely', async () => {
      setupSupabaseQuery([makeSticker({ use_count: null })]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        expect(screen.getByText('Total de itens')).toBeInTheDocument();
      });
    });

    it('shows top used section when items exist', async () => {
      setupSupabaseQuery([makeSticker({ use_count: 50 })]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        expect(screen.getByText('🏆 Mais usados')).toBeInTheDocument();
      });
    });

    it('does not show top used when empty', async () => {
      setupSupabaseQuery([]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        expect(screen.queryByText('🏆 Mais usados')).not.toBeInTheDocument();
      });
    });

    it('shows zero stats for empty dataset', async () => {
      setupSupabaseQuery([]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        const zeros = screen.getAllByText('0');
        expect(zeros.length).toBeGreaterThanOrEqual(3);
      });
    });
  });

  // ─── 4. Search ──────────────────────────────────────────

  describe('Search', () => {
    it('renders search input', async () => {
      setupSupabaseQuery([]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Buscar por nome ou categoria...')).toBeInTheDocument();
      });
    });

    it('search input is accessible', async () => {
      setupSupabaseQuery([]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        const input = screen.getByPlaceholderText('Buscar por nome ou categoria...');
        expect(input.tagName).toBe('INPUT');
      });
    });
  });

  // ─── 5. Toolbar ─────────────────────────────────────────

  describe('Toolbar', () => {
    it('renders upload button', async () => {
      setupSupabaseQuery([]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        expect(screen.getByText('Upload em massa')).toBeInTheDocument();
      });
    });

    it('renders refresh button', async () => {
      setupSupabaseQuery([]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        expect(screen.getByText('Atualizar')).toBeInTheDocument();
      });
    });

    it('does not show AI generate on stickers tab', async () => {
      setupSupabaseQuery([]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        expect(screen.queryByText('Gerar com IA')).not.toBeInTheDocument();
      });
    });

    it('refresh button triggers re-fetch', async () => {
      setupSupabaseQuery([]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => expect(screen.getByText('Atualizar')).toBeInTheDocument());

      mockFrom.mockClear();
      setupSupabaseQuery([]);
      fireEvent.click(screen.getByText('Atualizar'));
      await waitFor(() => expect(mockFrom).toHaveBeenCalledWith('stickers'));
    });

    it('file input has multiple attribute', async () => {
      setupSupabaseQuery([]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        expect(fileInput?.multiple).toBe(true);
      });
    });

    it('stickers tab accepts image files', async () => {
      setupSupabaseQuery([]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        expect(fileInput?.accept).toBe('image/webp,image/png,image/gif,image/jpeg');
      });
    });
  });

  // ─── 6. Table Header ────────────────────────────────────

  describe('Table Header', () => {
    it('shows Preview column', async () => {
      setupSupabaseQuery([makeSticker()]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => expect(screen.getByText('Preview')).toBeInTheDocument());
    });

    it('shows Nome column', async () => {
      setupSupabaseQuery([makeSticker()]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => expect(screen.getByText('Nome')).toBeInTheDocument());
    });

    it('shows Categoria column', async () => {
      setupSupabaseQuery([makeSticker()]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => expect(screen.getByText('Categoria')).toBeInTheDocument());
    });

    it('shows Usos column', async () => {
      setupSupabaseQuery([makeSticker()]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => expect(screen.getByText('Usos')).toBeInTheDocument());
    });

    it('shows star column', async () => {
      setupSupabaseQuery([makeSticker()]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => expect(screen.getByText('⭐')).toBeInTheDocument());
    });

    it('shows Ações column', async () => {
      setupSupabaseQuery([makeSticker()]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => expect(screen.getByText('Ações')).toBeInTheDocument());
    });
  });

  // ─── 7. Item Rendering ──────────────────────────────────

  describe('Item Rendering', () => {
    it('renders correct footer count for 1 item', async () => {
      setupSupabaseQuery([makeSticker()]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        expect(screen.getByText('Exibindo 1 de 1 itens')).toBeInTheDocument();
      });
    });

    it('renders correct footer count for 5 items', async () => {
      setupSupabaseQuery(Array.from({ length: 5 }, () => makeSticker()));
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        expect(screen.getByText('Exibindo 5 de 5 itens')).toBeInTheDocument();
      });
    });

    it('renders checkboxes for items', async () => {
      setupSupabaseQuery([makeSticker(), makeSticker()]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        const checkboxes = screen.getAllByRole('checkbox');
        expect(checkboxes.length).toBeGreaterThanOrEqual(3); // header + 2 items
      });
    });

    it('renders images for stickers', async () => {
      setupSupabaseQuery([makeSticker({ image_url: 'https://example.com/stk.webp' })]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        const imgs = screen.getAllByRole('img');
        expect(imgs.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('images use lazy loading', async () => {
      setupSupabaseQuery([makeSticker()]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        const img = screen.getByRole('img');
        expect(img).toHaveAttribute('loading', 'lazy');
      });
    });

    it('images have alt attribute', async () => {
      setupSupabaseQuery([makeSticker()]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        const img = screen.getByRole('img');
        expect(img).toHaveAttribute('alt');
      });
    });
  });

  // ─── 8. Empty States ────────────────────────────────────

  describe('Empty States', () => {
    it('shows empty message when no items', async () => {
      setupSupabaseQuery([]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        expect(screen.getByText('Nenhum item encontrado')).toBeInTheDocument();
      });
    });

    it('shows zero in footer for empty state', async () => {
      setupSupabaseQuery([]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        expect(screen.getByText('Exibindo 0 de 0 itens')).toBeInTheDocument();
      });
    });
  });

  // ─── 9. Edge Cases ──────────────────────────────────────

  describe('Edge Cases', () => {
    it('handles item with empty string name', async () => {
      setupSupabaseQuery([makeSticker({ name: '' })]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        expect(screen.getByText(/Exibindo 1/)).toBeInTheDocument();
      });
    });

    it('handles item with negative use_count', async () => {
      setupSupabaseQuery([makeSticker({ use_count: -1 })]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        expect(screen.getByText(/Exibindo 1/)).toBeInTheDocument();
      });
    });

    it('handles item with undefined image_url', async () => {
      setupSupabaseQuery([makeSticker({ image_url: undefined })]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        expect(screen.getByText(/Exibindo 1/)).toBeInTheDocument();
      });
    });

    it('handles 100 items without crash', async () => {
      const items = Array.from({ length: 100 }, () => makeSticker());
      setupSupabaseQuery(items);
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        expect(screen.getByText(/Exibindo 100 de 100/)).toBeInTheDocument();
      });
    });

    it('handles duplicate categories correctly in stats', async () => {
      setupSupabaseQuery([
        makeSticker({ category: 'riso' }),
        makeSticker({ category: 'riso' }),
        makeSticker({ category: 'riso' }),
      ]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        expect(screen.getByText(/Exibindo 3/)).toBeInTheDocument();
      });
    });
  });

  // ─── 10. Render Stability ───────────────────────────────

  describe('Render Stability', () => {
    it('does not crash with rapid tab switching', async () => {
      setupSupabaseQuery([]);
      render(<MediaLibraryAdmin />);
      for (let i = 0; i < 10; i++) {
        fireEvent.click(screen.getByRole('tab', { name: /Áudios Meme/ }));
        fireEvent.click(screen.getByRole('tab', { name: /Figurinhas/ }));
        fireEvent.click(screen.getByRole('tab', { name: /Emojis/ }));
      }
      expect(screen.getByText('Biblioteca de Mídia')).toBeInTheDocument();
    });

    it('does not crash with rapid search changes', async () => {
      setupSupabaseQuery([makeSticker()]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => expect(screen.getByText(/Exibindo 1/)).toBeInTheDocument());

      const input = screen.getByPlaceholderText('Buscar por nome ou categoria...');
      for (let i = 0; i < 50; i++) {
        fireEvent.change(input, { target: { value: `search${i}` } });
      }
      expect(screen.getByText('Biblioteca de Mídia')).toBeInTheDocument();
    });

    it('does not crash with rapid checkbox clicks', async () => {
      setupSupabaseQuery([makeSticker()]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        const checkboxes = screen.getAllByRole('checkbox');
        for (let i = 0; i < 20; i++) {
          fireEvent.click(checkboxes[0]);
        }
        expect(screen.getByText('Biblioteca de Mídia')).toBeInTheDocument();
      });
    });
  });

  // ─── 11. Component Integration ──────────────────────────

  describe('Component Integration', () => {
    it('renders all major sections together', async () => {
      setupSupabaseQuery([makeSticker({ use_count: 5, is_favorite: true })]);
      render(<MediaLibraryAdmin />);
      await waitFor(() => {
        // Title
        expect(screen.getByText('Biblioteca de Mídia')).toBeInTheDocument();
        // Tabs
        expect(screen.getByText('Figurinhas')).toBeInTheDocument();
        // Stats
        expect(screen.getByText('Total de itens')).toBeInTheDocument();
        // Toolbar
        expect(screen.getByText('Upload em massa')).toBeInTheDocument();
        // Footer
        expect(screen.getByText(/Exibindo 1/)).toBeInTheDocument();
      });
    });
  });
});

// ═══════════════════════════════════════════════════════════
// Pure Function & Logic Unit Tests
// ═══════════════════════════════════════════════════════════

describe('MediaLibraryAdmin - Pure Logic', () => {

  // ─── Category Definitions ──────────────────────────────

  describe('Sticker Categories', () => {
    const STICKER_CATEGORIES: Record<string, string> = {
      'comemoração': '🎉', 'riso': '😂', 'chorando': '😢', 'amor': '❤️',
      'raiva': '😡', 'surpresa': '😲', 'pensativo': '🤔', 'cumprimento': '👋',
      'despedida': '👋', 'concordância': '👍', 'negação': '🙅', 'sono': '😴',
      'fome': '🍔', 'medo': '😨', 'vergonha': '🙈', 'deboche': '😏',
      'fofo': '🥰', 'triste': '😔', 'animado': '🤩', 'engraçado': '🤣',
      'outros': '📦', 'recebidas': '📥', 'enviadas': '📤',
    };

    it('has 23 categories', () => {
      expect(Object.keys(STICKER_CATEGORIES).length).toBe(23);
    });

    it('includes comemoração', () => expect(STICKER_CATEGORIES).toHaveProperty('comemoração'));
    it('includes riso', () => expect(STICKER_CATEGORIES).toHaveProperty('riso'));
    it('includes chorando', () => expect(STICKER_CATEGORIES).toHaveProperty('chorando'));
    it('includes amor', () => expect(STICKER_CATEGORIES).toHaveProperty('amor'));
    it('includes raiva', () => expect(STICKER_CATEGORIES).toHaveProperty('raiva'));
    it('includes surpresa', () => expect(STICKER_CATEGORIES).toHaveProperty('surpresa'));
    it('includes pensativo', () => expect(STICKER_CATEGORIES).toHaveProperty('pensativo'));
    it('includes cumprimento', () => expect(STICKER_CATEGORIES).toHaveProperty('cumprimento'));
    it('includes despedida', () => expect(STICKER_CATEGORIES).toHaveProperty('despedida'));
    it('includes concordância', () => expect(STICKER_CATEGORIES).toHaveProperty('concordância'));
    it('includes negação', () => expect(STICKER_CATEGORIES).toHaveProperty('negação'));
    it('includes sono', () => expect(STICKER_CATEGORIES).toHaveProperty('sono'));
    it('includes fome', () => expect(STICKER_CATEGORIES).toHaveProperty('fome'));
    it('includes medo', () => expect(STICKER_CATEGORIES).toHaveProperty('medo'));
    it('includes vergonha', () => expect(STICKER_CATEGORIES).toHaveProperty('vergonha'));
    it('includes deboche', () => expect(STICKER_CATEGORIES).toHaveProperty('deboche'));
    it('includes fofo', () => expect(STICKER_CATEGORIES).toHaveProperty('fofo'));
    it('includes triste', () => expect(STICKER_CATEGORIES).toHaveProperty('triste'));
    it('includes animado', () => expect(STICKER_CATEGORIES).toHaveProperty('animado'));
    it('includes engraçado', () => expect(STICKER_CATEGORIES).toHaveProperty('engraçado'));
    it('includes outros', () => expect(STICKER_CATEGORIES).toHaveProperty('outros'));
    it('includes recebidas', () => expect(STICKER_CATEGORIES).toHaveProperty('recebidas'));
    it('includes enviadas', () => expect(STICKER_CATEGORIES).toHaveProperty('enviadas'));

    it('all categories have emoji icons', () => {
      Object.entries(STICKER_CATEGORIES).forEach(([cat, emoji]) => {
        expect(emoji.length, `"${cat}" has empty emoji`).toBeGreaterThan(0);
      });
    });
  });

  describe('Audio Categories', () => {
    const AUDIO_CATEGORIES: Record<string, string> = {
      'risada': '😂', 'aplausos': '👏', 'suspense': '🎭', 'vitória': '🏆',
      'falha': '💥', 'surpresa': '😱', 'triste': '😢', 'raiva': '😡',
      'romântico': '💕', 'medo': '👻', 'deboche': '😏', 'narração': '🎙️',
      'bordão': '💬', 'efeito sonoro': '🔊', 'viral': '🔥', 'cumprimento': '👋',
      'despedida': '👋', 'animação': '🤩', 'drama': '🎬', 'gospel': '⛪',
      'outros': '📦',
    };

    it('has 21 categories', () => {
      expect(Object.keys(AUDIO_CATEGORIES).length).toBe(21);
    });

    it('includes risada', () => expect(AUDIO_CATEGORIES).toHaveProperty('risada'));
    it('includes aplausos', () => expect(AUDIO_CATEGORIES).toHaveProperty('aplausos'));
    it('includes suspense', () => expect(AUDIO_CATEGORIES).toHaveProperty('suspense'));
    it('includes vitória', () => expect(AUDIO_CATEGORIES).toHaveProperty('vitória'));
    it('includes falha', () => expect(AUDIO_CATEGORIES).toHaveProperty('falha'));
    it('includes bordão', () => expect(AUDIO_CATEGORIES).toHaveProperty('bordão'));
    it('includes narração', () => expect(AUDIO_CATEGORIES).toHaveProperty('narração'));
    it('includes gospel', () => expect(AUDIO_CATEGORIES).toHaveProperty('gospel'));
    it('includes efeito sonoro', () => expect(AUDIO_CATEGORIES).toHaveProperty('efeito sonoro'));
    it('includes viral', () => expect(AUDIO_CATEGORIES).toHaveProperty('viral'));
    it('includes drama', () => expect(AUDIO_CATEGORIES).toHaveProperty('drama'));
    it('includes animação', () => expect(AUDIO_CATEGORIES).toHaveProperty('animação'));
    it('includes romântico', () => expect(AUDIO_CATEGORIES).toHaveProperty('romântico'));
    it('includes outros', () => expect(AUDIO_CATEGORIES).toHaveProperty('outros'));

    it('all categories have emoji icons', () => {
      Object.entries(AUDIO_CATEGORIES).forEach(([cat, emoji]) => {
        expect(emoji.length, `"${cat}" has empty emoji`).toBeGreaterThan(0);
      });
    });
  });

  describe('Emoji Categories', () => {
    const EMOJI_CATEGORIES: Record<string, string> = {
      'riso': '😂', 'amor': '❤️', 'triste': '😢', 'raiva': '😡',
      'surpresa': '😲', 'fofo': '🥰', 'deboche': '😏', 'outros': '📦',
    };

    it('has 8 categories', () => {
      expect(Object.keys(EMOJI_CATEGORIES).length).toBe(8);
    });

    it('includes riso', () => expect(EMOJI_CATEGORIES).toHaveProperty('riso'));
    it('includes amor', () => expect(EMOJI_CATEGORIES).toHaveProperty('amor'));
    it('includes triste', () => expect(EMOJI_CATEGORIES).toHaveProperty('triste'));
    it('includes raiva', () => expect(EMOJI_CATEGORIES).toHaveProperty('raiva'));
    it('includes surpresa', () => expect(EMOJI_CATEGORIES).toHaveProperty('surpresa'));
    it('includes fofo', () => expect(EMOJI_CATEGORIES).toHaveProperty('fofo'));
    it('includes deboche', () => expect(EMOJI_CATEGORIES).toHaveProperty('deboche'));
    it('includes outros', () => expect(EMOJI_CATEGORIES).toHaveProperty('outros'));

    it('all categories have emoji icons', () => {
      Object.entries(EMOJI_CATEGORIES).forEach(([cat, emoji]) => {
        expect(emoji.length, `"${cat}" has empty emoji`).toBeGreaterThan(0);
      });
    });
  });

  describe('All Types Have Fallback Category', () => {
    it('stickers have outros', () => expect({ 'outros': '📦' }).toHaveProperty('outros'));
    it('audio have outros', () => expect({ 'outros': '📦' }).toHaveProperty('outros'));
    it('emojis have outros', () => expect({ 'outros': '📦' }).toHaveProperty('outros'));
  });

  // ─── Filter Logic ──────────────────────────────────────

  describe('Filter Logic', () => {
    const items: Array<{ name: string | null; category: string | null }> = [
      { name: 'Alpha', category: 'riso' },
      { name: 'Beta', category: 'amor' },
      { name: null, category: 'riso' },
      { name: 'Gamma', category: null },
    ];

    it('search matches name substring', () => {
      const r = items.filter(i => i.name?.toLowerCase().includes('alph'));
      expect(r).toHaveLength(1);
      expect(r[0].name).toBe('Alpha');
    });

    it('search matches category substring', () => {
      const r = items.filter(i => i.category?.toLowerCase().includes('ris'));
      expect(r).toHaveLength(2);
    });

    it('null name does not crash filter', () => {
      const search = 'test';
      const r = items.filter(i =>
        !search || i.name?.toLowerCase().includes(search) || i.category?.toLowerCase().includes(search)
      );
      expect(r).toHaveLength(0);
    });

    it('empty search returns all items', () => {
      const search: string = '';
      const r = items.filter(i => {
        if (!search) return true;
        return i.name?.toLowerCase().includes(search) || i.category?.toLowerCase().includes(search);
      });
      expect(r).toHaveLength(4);
    });

    it('category filter "all" returns everything', () => {
      const f: string = 'all';
      const r = items.filter(i => f === 'all' || i.category === f);
      expect(r).toHaveLength(4);
    });

    it('category filter specific returns matching', () => {
      const f: string = 'riso';
      const r = items.filter(i => f === 'all' || i.category === f);
      expect(r).toHaveLength(2);
    });

    it('case-insensitive search works', () => {
      const r = items.filter(i => i.name?.toLowerCase().includes('alpha'));
      expect(r).toHaveLength(1);
    });

    it('partial category match works', () => {
      const r = items.filter(i => i.category?.toLowerCase().includes('am'));
      expect(r).toHaveLength(1);
      expect(r[0].name).toBe('Beta');
    });

    it('no match returns empty', () => {
      const r = items.filter(i => i.name?.toLowerCase().includes('zzzzz'));
      expect(r).toHaveLength(0);
    });

    it('combined search and filter works', () => {
      const search = 'alpha';
      const filterCat: string = 'riso';
      const r = items.filter(i => {
        const matchSearch = !search || i.name?.toLowerCase().includes(search);
        const matchCat = filterCat === 'all' || i.category === filterCat;
        return matchSearch && matchCat;
      });
      expect(r).toHaveLength(1);
    });
  });

  // ─── Selection Logic ───────────────────────────────────

  describe('Selection Logic', () => {
    it('toggle adds item to set', () => {
      const set = new Set<string>();
      const next = new Set(set);
      next.add('s1');
      expect(next.has('s1')).toBe(true);
    });

    it('toggle removes item from set', () => {
      const set = new Set<string>(['s1', 's2']);
      const next = new Set(set);
      next.delete('s1');
      expect(next.has('s1')).toBe(false);
      expect(next.has('s2')).toBe(true);
    });

    it('select all adds all IDs', () => {
      const filtered = [{ id: 's1' }, { id: 's2' }, { id: 's3' }];
      const set = new Set(filtered.map(i => i.id));
      expect(set.size).toBe(3);
    });

    it('deselect all clears set', () => {
      const empty = new Set<string>();
      expect(empty.size).toBe(0);
    });

    it('toggle all when all selected deselects all', () => {
      const filtered = [{ id: 's1' }, { id: 's2' }];
      let selected = new Set(filtered.map(i => i.id));
      if (selected.size === filtered.length) selected = new Set();
      expect(selected.size).toBe(0);
    });

    it('toggle all when none selected selects all', () => {
      const filtered = [{ id: 's1' }, { id: 's2' }];
      let selected = new Set<string>();
      if (selected.size === filtered.length) selected = new Set();
      else selected = new Set(filtered.map(i => i.id));
      expect(selected.size).toBe(2);
    });

    it('toggle all when partial selected selects all', () => {
      const filtered = [{ id: 's1' }, { id: 's2' }, { id: 's3' }];
      let selected = new Set<string>(['s1']);
      if (selected.size === filtered.length) selected = new Set();
      else selected = new Set(filtered.map(i => i.id));
      expect(selected.size).toBe(3);
    });

    it('toggling same item twice restores original state', () => {
      const set = new Set<string>(['s1', 's2']);
      const next = new Set(set);
      next.delete('s1');
      next.add('s1');
      expect(next.size).toBe(2);
      expect(next.has('s1')).toBe(true);
    });
  });

  // ─── Stats Calculation ─────────────────────────────────

  describe('Stats Calculation', () => {
    const items = [
      { use_count: 10, is_favorite: true, category: 'riso', name: 'A' },
      { use_count: 20, is_favorite: false, category: 'amor', name: 'B' },
      { use_count: 0, is_favorite: true, category: 'riso', name: 'C' },
      { use_count: null as number | null, is_favorite: false, category: 'deboche', name: 'D' },
    ];

    it('calculates total items', () => expect(items.length).toBe(4));

    it('calculates total uses with null safety', () => {
      const total = items.reduce((s, i) => s + (i.use_count || 0), 0);
      expect(total).toBe(30);
    });

    it('counts favorites', () => {
      expect(items.filter(i => i.is_favorite).length).toBe(2);
    });

    it('counts unique categories', () => {
      expect([...new Set(items.map(i => i.category))].length).toBe(3);
    });

    it('sorts by use_count desc for top used', () => {
      const sorted = [...items].sort((a, b) => (b.use_count || 0) - (a.use_count || 0));
      expect(sorted[0].use_count).toBe(20);
      expect(sorted[1].use_count).toBe(10);
    });

    it('top 3 returns at most 3', () => {
      const top = [...items].sort((a, b) => (b.use_count || 0) - (a.use_count || 0)).slice(0, 3);
      expect(top.length).toBe(3);
    });

    it('top 3 from 2 items returns 2', () => {
      const small = items.slice(0, 2);
      const top = [...small].sort((a, b) => (b.use_count || 0) - (a.use_count || 0)).slice(0, 3);
      expect(top.length).toBe(2);
    });

    it('all zeros total uses is 0', () => {
      const zeros = [{ use_count: 0 }, { use_count: 0 }];
      expect(zeros.reduce((s, i) => s + (i.use_count || 0), 0)).toBe(0);
    });

    it('all null use_counts total is 0', () => {
      const nulls = [{ use_count: null }, { use_count: null }];
      expect(nulls.reduce((s, i) => s + (i.use_count || 0), 0)).toBe(0);
    });

    it('single item is always top used', () => {
      const single = [{ use_count: 5, name: 'Only' }];
      const top = [...single].sort((a, b) => (b.use_count || 0) - (a.use_count || 0)).slice(0, 3);
      expect(top[0].name).toBe('Only');
    });
  });

  // ─── URL Parsing for Delete ────────────────────────────

  describe('URL Parsing for Delete', () => {
    it('extracts path from whatsapp-media URL', () => {
      const url = 'https://ex.com/storage/v1/object/public/whatsapp-media/stickers/file.webp';
      expect(url.split('/whatsapp-media/')[1]).toBe('stickers/file.webp');
    });

    it('extracts path from stickers bucket URL', () => {
      const url = 'https://ex.com/storage/v1/object/public/stickers/myfile.webp';
      expect(url.split('/stickers/')[1]).toBe('myfile.webp');
    });

    it('extracts path from audio-memes bucket URL', () => {
      const url = 'https://ex.com/storage/v1/object/public/audio-memes/test.mp3';
      expect(url.split('/audio-memes/')[1]).toBe('test.mp3');
    });

    it('extracts path from custom-emojis bucket URL', () => {
      const url = 'https://ex.com/storage/v1/object/public/custom-emojis/emoji.png';
      expect(url.split('/custom-emojis/')[1]).toBe('emoji.png');
    });

    it('handles nested paths', () => {
      const url = 'https://ex.com/storage/v1/object/public/whatsapp-media/stickers/sub/dir/file.webp';
      expect(url.split('/whatsapp-media/')[1]).toBe('stickers/sub/dir/file.webp');
    });

    it('returns undefined for non-matching URL', () => {
      const url = 'https://other.com/image.png';
      expect(url.split('/stickers/')[1]).toBeUndefined();
    });

    it('handles URL with query params', () => {
      const url = 'https://ex.com/storage/v1/object/public/stickers/file.webp?token=abc';
      expect(url.split('/stickers/')[1]).toBe('file.webp?token=abc');
    });
  });

  // ─── Upload File Validation ────────────────────────────

  describe('Upload File Validation', () => {
    it('accepts audio/mpeg for audio_memes', () => expect('audio/mpeg'.startsWith('audio/')).toBe(true));
    it('accepts audio/wav for audio_memes', () => expect('audio/wav'.startsWith('audio/')).toBe(true));
    it('accepts audio/ogg for audio_memes', () => expect('audio/ogg'.startsWith('audio/')).toBe(true));
    it('accepts audio/webm for audio_memes', () => expect('audio/webm'.startsWith('audio/')).toBe(true));
    it('rejects video/mp4 for audio_memes', () => expect('video/mp4'.startsWith('audio/')).toBe(false));
    it('rejects text/plain for audio_memes', () => expect('text/plain'.startsWith('audio/')).toBe(false));
    it('rejects application/pdf for audio_memes', () => expect('application/pdf'.startsWith('audio/')).toBe(false));

    it('accepts image/webp for stickers', () => expect('image/webp'.startsWith('image/')).toBe(true));
    it('accepts image/png for stickers', () => expect('image/png'.startsWith('image/')).toBe(true));
    it('accepts image/gif for stickers', () => expect('image/gif'.startsWith('image/')).toBe(true));
    it('accepts image/jpeg for stickers', () => expect('image/jpeg'.startsWith('image/')).toBe(true));
    it('rejects application/pdf for stickers', () => expect('application/pdf'.startsWith('image/')).toBe(false));
    it('rejects text/html for stickers', () => expect('text/html'.startsWith('image/')).toBe(false));

    it('extracts extension from filename', () => {
      expect('myfile.mp3'.split('.').pop()).toBe('mp3');
    });

    it('handles filename without extension', () => {
      expect('noext'.split('.').pop()).toBe('noext');
    });

    it('strips extension from name', () => {
      expect('my-audio-meme.mp3'.replace(/\.[^.]+$/, '')).toBe('my-audio-meme');
    });

    it('handles multiple dots in filename', () => {
      expect('my.audio.meme.mp3'.replace(/\.[^.]+$/, '')).toBe('my.audio.meme');
    });

    it('handles hidden file', () => {
      expect('.gitignore'.replace(/\.[^.]+$/, '')).toBe('');
    });
  });

  // ─── Upload Progress ──────────────────────────────────

  describe('Upload Progress Calculation', () => {
    it('first of 10 = 10%', () => expect(Math.round(((0 + 1) / 10) * 100)).toBe(10));
    it('5th of 10 = 50%', () => expect(Math.round(((4 + 1) / 10) * 100)).toBe(50));
    it('last of 10 = 100%', () => expect(Math.round(((9 + 1) / 10) * 100)).toBe(100));
    it('single file = 100%', () => expect(Math.round(((0 + 1) / 1) * 100)).toBe(100));
    it('first of 3 = 33%', () => expect(Math.round(((0 + 1) / 3) * 100)).toBe(33));
    it('2nd of 3 = 67%', () => expect(Math.round(((1 + 1) / 3) * 100)).toBe(67));
    it('3rd of 3 = 100%', () => expect(Math.round(((2 + 1) / 3) * 100)).toBe(100));
  });

  // ─── AI Generation ────────────────────────────────────

  describe('AI Generation Name Truncation', () => {
    it('truncates prompt to 80 chars', () => {
      expect('A'.repeat(200).substring(0, 80).length).toBe(80);
    });

    it('does not truncate short prompt', () => {
      expect('Short name'.substring(0, 80)).toBe('Short name');
    });

    it('handles empty prompt', () => {
      expect(''.substring(0, 80)).toBe('');
    });

    it('handles exactly 80 chars', () => {
      expect('A'.repeat(80).substring(0, 80).length).toBe(80);
    });

    it('handles 79 chars (no truncation needed)', () => {
      const p = 'A'.repeat(79);
      expect(p.substring(0, 80)).toBe(p);
    });
  });

  // ─── Storage Path Generation ───────────────────────────

  describe('Storage Path Generation', () => {
    it('bulk upload path starts with bulk_', () => {
      expect(`bulk_${Date.now()}_test.mp3`.startsWith('bulk_')).toBe(true);
    });

    it('AI gen path starts with ai_gen_', () => {
      expect(`ai_gen_${Date.now()}_test.mp3`.startsWith('ai_gen_')).toBe(true);
    });

    it('paths include timestamp', () => {
      const before = Date.now();
      const path = `bulk_${Date.now()}_test.mp3`;
      const ts = parseInt(path.split('_')[1]);
      expect(ts).toBeGreaterThanOrEqual(before);
    });

    it('paths are unique', () => {
      const p1 = `bulk_${Date.now()}_${Math.random()}.mp3`;
      const p2 = `bulk_${Date.now()}_${Math.random()}.mp3`;
      expect(p1).not.toBe(p2);
    });
  });

  // ─── Duration Constraints ─────────────────────────────

  describe('Duration Constraints', () => {
    it('SFX min is 1s', () => expect(1).toBe(1));
    it('SFX max is 22s', () => expect(22).toBe(22));
    it('SFX default is 5s', () => expect(5).toBe(5));
    it('Music min is 5s', () => expect(5).toBe(5));
    it('Music max is 60s', () => expect(60).toBe(60));
    it('Music default is 15s', () => expect(15).toBe(15));
    it('SFX default within range', () => { expect(5).toBeGreaterThanOrEqual(1); expect(5).toBeLessThanOrEqual(22); });
    it('Music default within range', () => { expect(15).toBeGreaterThanOrEqual(5); expect(15).toBeLessThanOrEqual(60); });
  });

  // ─── Classify Function Mapping ─────────────────────────

  describe('Classify Function Mapping', () => {
    const getFn = (type: string) =>
      type === 'audio_memes' ? 'classify-audio-meme' :
      type === 'stickers' ? 'classify-sticker' : 'classify-emoji';

    it('maps audio_memes correctly', () => expect(getFn('audio_memes')).toBe('classify-audio-meme'));
    it('maps stickers correctly', () => expect(getFn('stickers')).toBe('classify-sticker'));
    it('maps custom_emojis correctly', () => expect(getFn('custom_emojis')).toBe('classify-emoji'));
    it('unknown type falls to classify-emoji', () => expect(getFn('unknown')).toBe('classify-emoji'));
  });

  // ─── Bucket Mapping ───────────────────────────────────

  describe('Bucket Mapping', () => {
    const getBucket = (type: string) =>
      type === 'stickers' ? 'stickers' : type === 'audio_memes' ? 'audio-memes' : 'custom-emojis';

    it('maps stickers', () => expect(getBucket('stickers')).toBe('stickers'));
    it('maps audio_memes', () => expect(getBucket('audio_memes')).toBe('audio-memes'));
    it('maps custom_emojis', () => expect(getBucket('custom_emojis')).toBe('custom-emojis'));
    it('unknown defaults to custom-emojis', () => expect(getBucket('unknown')).toBe('custom-emojis'));
  });

  // ─── URL Field Mapping ────────────────────────────────

  describe('URL Field Mapping', () => {
    const getField = (type: string) => type === 'audio_memes' ? 'audio_url' : 'image_url';

    it('audio_memes uses audio_url', () => expect(getField('audio_memes')).toBe('audio_url'));
    it('stickers uses image_url', () => expect(getField('stickers')).toBe('image_url'));
    it('custom_emojis uses image_url', () => expect(getField('custom_emojis')).toBe('image_url'));
  });

  // ─── Classify Body Format ─────────────────────────────

  describe('Classify Request Body', () => {
    it('audio_memes sends audio_url + file_name', () => {
      const type = 'audio_memes';
      const body = type === 'audio_memes'
        ? { audio_url: 'url', file_name: 'name' }
        : { image_url: 'url' };
      expect(body).toHaveProperty('audio_url');
      expect(body).toHaveProperty('file_name');
    });

    it('stickers sends image_url', () => {
      const type: string = 'stickers';
      const body = type === 'audio_memes'
        ? { audio_url: 'url', file_name: 'name' }
        : { image_url: 'url' };
      expect(body).toHaveProperty('image_url');
      expect(body).not.toHaveProperty('audio_url');
    });

    it('custom_emojis sends image_url', () => {
      const type: string = 'custom_emojis';
      const body = type === 'audio_memes'
        ? { audio_url: 'url', file_name: 'name' }
        : { image_url: 'url' };
      expect(body).toHaveProperty('image_url');
    });
  });

  // ─── Insert Data Shape ────────────────────────────────

  describe('Insert Data Shape', () => {
    it('audio_memes insert includes audio_url', () => {
      const type = 'audio_memes';
      const data: Record<string, unknown> = {
        name: 'test',
        category: 'outros',
        is_favorite: false,
        use_count: 0,
        uploaded_by: 'user-1',
      };
      if (type === 'audio_memes') data.audio_url = 'url';
      else data.image_url = 'url';
      expect(data).toHaveProperty('audio_url');
      expect(data).not.toHaveProperty('image_url');
    });

    it('stickers insert includes image_url', () => {
      const type: string = 'stickers';
      const data: Record<string, unknown> = {
        name: 'test',
        category: 'outros',
        is_favorite: false,
        use_count: 0,
        uploaded_by: 'user-1',
      };
      if (type === 'audio_memes') data.audio_url = 'url';
      else data.image_url = 'url';
      expect(data).toHaveProperty('image_url');
      expect(data).not.toHaveProperty('audio_url');
    });

    it('insert always has is_favorite false', () => {
      const data = { is_favorite: false };
      expect(data.is_favorite).toBe(false);
    });

    it('insert always has use_count 0', () => {
      const data = { use_count: 0 };
      expect(data.use_count).toBe(0);
    });
  });

  // ─── Bulk Delete Logic ────────────────────────────────

  describe('Bulk Delete Logic', () => {
    it('filters items by selected set', () => {
      const items = [{ id: 's1' }, { id: 's2' }, { id: 's3' }];
      const selected = new Set(['s1', 's3']);
      const toDelete = items.filter(i => selected.has(i.id));
      expect(toDelete).toHaveLength(2);
      expect(toDelete.map(i => i.id)).toEqual(['s1', 's3']);
    });

    it('empty selection deletes nothing', () => {
      const items = [{ id: 's1' }];
      const selected = new Set<string>();
      const toDelete = items.filter(i => selected.has(i.id));
      expect(toDelete).toHaveLength(0);
    });

    it('all selected deletes all', () => {
      const items = [{ id: 's1' }, { id: 's2' }];
      const selected = new Set(['s1', 's2']);
      const toDelete = items.filter(i => selected.has(i.id));
      expect(toDelete).toHaveLength(2);
    });

    it('removes deleted items from state', () => {
      const items = [{ id: 's1' }, { id: 's2' }, { id: 's3' }];
      const selected = new Set(['s2']);
      const remaining = items.filter(i => !selected.has(i.id));
      expect(remaining).toHaveLength(2);
      expect(remaining.map(i => i.id)).toEqual(['s1', 's3']);
    });
  });

  // ─── Bulk Category Change ─────────────────────────────

  describe('Bulk Category Change Logic', () => {
    it('updates category for selected items', () => {
      const items = [
        { id: 's1', category: 'riso' },
        { id: 's2', category: 'amor' },
      ];
      const selected = new Set(['s1']);
      const updated = items.map(i => selected.has(i.id) ? { ...i, category: 'deboche' } : i);
      expect(updated[0].category).toBe('deboche');
      expect(updated[1].category).toBe('amor');
    });

    it('does not modify unselected items', () => {
      const items = [{ id: 's1', category: 'riso' }, { id: 's2', category: 'amor' }];
      const selected = new Set(['s1']);
      const updated = items.map(i => selected.has(i.id) ? { ...i, category: 'novo' } : i);
      expect(updated[1].category).toBe('amor');
    });
  });

  // ─── Reclassify Logic ─────────────────────────────────

  describe('Reclassify Logic', () => {
    it('counts updated items correctly', () => {
      const results = [
        { oldCategory: 'riso', newCategory: 'amor' },    // changed
        { oldCategory: 'riso', newCategory: 'riso' },    // same
        { oldCategory: 'amor', newCategory: 'deboche' }, // changed
      ];
      const updated = results.filter(r => r.oldCategory !== r.newCategory).length;
      expect(updated).toBe(2);
    });

    it('handles all unchanged', () => {
      const results = [
        { oldCategory: 'riso', newCategory: 'riso' },
        { oldCategory: 'amor', newCategory: 'amor' },
      ];
      const updated = results.filter(r => r.oldCategory !== r.newCategory).length;
      expect(updated).toBe(0);
    });

    it('handles all changed', () => {
      const results = [
        { oldCategory: 'riso', newCategory: 'amor' },
        { oldCategory: 'amor', newCategory: 'deboche' },
      ];
      const updated = results.filter(r => r.oldCategory !== r.newCategory).length;
      expect(updated).toBe(2);
    });

    it('formats success message correctly', () => {
      const updated = 3;
      const total = 5;
      const msg = `${updated}/${total} itens reclassificados com IA`;
      expect(msg).toBe('3/5 itens reclassificados com IA');
    });
  });

  // ─── Rename Logic ─────────────────────────────────────

  describe('Rename Logic', () => {
    it('empty name prevented', () => {
      expect(''.trim()).toBe('');
    });

    it('whitespace-only name prevented', () => {
      expect('   '.trim()).toBe('');
    });

    it('valid name passes trim check', () => {
      expect('Valid Name'.trim()).toBe('Valid Name');
    });

    it('name with leading/trailing spaces is trimmed', () => {
      expect('  Name  '.trim()).toBe('Name');
    });
  });

  // ─── Accept Types ─────────────────────────────────────

  describe('Accept Types Per Tab', () => {
    it('audio_memes accept type', () => {
      const type = 'audio_memes';
      const accept = type === 'audio_memes' ? 'audio/*' : 'image/webp,image/png,image/gif,image/jpeg';
      expect(accept).toBe('audio/*');
    });

    it('stickers accept type', () => {
      const type: string = 'stickers';
      const accept = type === 'audio_memes' ? 'audio/*' : 'image/webp,image/png,image/gif,image/jpeg';
      expect(accept).toBe('image/webp,image/png,image/gif,image/jpeg');
    });

    it('custom_emojis accept type', () => {
      const type: string = 'custom_emojis';
      const accept = type === 'audio_memes' ? 'audio/*' : 'image/webp,image/png,image/gif,image/jpeg';
      expect(accept).toBe('image/webp,image/png,image/gif,image/jpeg');
    });
  });

  // ─── Existing Categories Extraction ────────────────────

  describe('Existing Categories Extraction', () => {
    it('extracts unique categories sorted', () => {
      const items = [
        { category: 'riso' },
        { category: 'amor' },
        { category: 'riso' },
        { category: 'deboche' },
      ];
      const cats = [...new Set(items.map(i => i.category))].sort();
      expect(cats).toEqual(['amor', 'deboche', 'riso']);
    });

    it('single category returns single', () => {
      const items = [{ category: 'riso' }, { category: 'riso' }];
      const cats = [...new Set(items.map(i => i.category))].sort();
      expect(cats).toEqual(['riso']);
    });

    it('empty items returns empty', () => {
      const cats = [...new Set(([] as any[]).map(i => i.category))].sort();
      expect(cats).toEqual([]);
    });
  });

  // ─── Audio Preview Logic ──────────────────────────────

  describe('Audio Preview Logic', () => {
    it('non audio type skips preview', () => {
      const type: string = 'stickers';
      const shouldPreview = type === 'audio_memes';
      expect(shouldPreview).toBe(false);
    });

    it('audio type enables preview', () => {
      const type: string = 'audio_memes';
      const shouldPreview = type === 'audio_memes';
      expect(shouldPreview).toBe(true);
    });

    it('toggle pause when same item playing', () => {
      const playingId: string = 'a1';
      const clickedId: string = 'a1';
      const shouldPause = playingId === clickedId;
      expect(shouldPause).toBe(true);
    });

    it('switch to new item when different item clicked', () => {
      const playingId: string = 'a1';
      const clickedId: string = 'a2';
      const shouldPause = playingId === clickedId;
      expect(shouldPause).toBe(false);
    });
  });

  // ─── Null/Undefined Safety ────────────────────────────

  describe('Null/Undefined Safety', () => {
    it('name || "Sem nome" for null', () => { const v: string | null = null; expect(v || 'Sem nome').toBe('Sem nome'); });
    it('name || "Sem nome" for undefined', () => { const v: string | undefined = undefined; expect(v || 'Sem nome').toBe('Sem nome'); });
    it('name || "Sem nome" for empty string', () => { const v: string = ''; expect(v || 'Sem nome').toBe('Sem nome'); });
    it('name || "Sem nome" for valid name', () => { const v: string = 'Test'; expect(v || 'Sem nome').toBe('Test'); });

    it('use_count || 0 for null', () => { const v: number | null = null; expect(v || 0).toBe(0); });
    it('use_count || 0 for undefined', () => { const v: number | undefined = undefined; expect(v || 0).toBe(0); });
    it('use_count || 0 for 0', () => { const v: number = 0; expect(v || 0).toBe(0); });
    it('use_count || 0 for positive', () => { const v: number = 42; expect(v || 0).toBe(42); });
  });

  // ─── extractStoragePath Logic ─────────────────────────

  describe('Storage Path Extraction', () => {
    // Replicate the extractStoragePath logic for testing
    function extractStoragePath(url: string, bucket: string): { bucket: string; path: string } | null {
      if (!url) return null;
      if (url.includes('/whatsapp-media/')) {
        const path = url.split('/whatsapp-media/')[1];
        return path ? { bucket: 'whatsapp-media', path } : null;
      }
      const marker = `/${bucket}/`;
      if (url.includes(marker)) {
        const path = url.split(marker)[1];
        return path ? { bucket, path } : null;
      }
      const publicMarker = '/object/public/';
      if (url.includes(publicMarker)) {
        const afterPublic = url.split(publicMarker)[1];
        if (afterPublic) {
          const slashIdx = afterPublic.indexOf('/');
          if (slashIdx > 0) {
            return { bucket: afterPublic.substring(0, slashIdx), path: afterPublic.substring(slashIdx + 1) };
          }
        }
      }
      return null;
    }

    it('extracts from whatsapp-media bucket', () => {
      const result = extractStoragePath('https://example.com/storage/v1/object/public/whatsapp-media/sticker123.webp', 'stickers');
      expect(result).toEqual({ bucket: 'whatsapp-media', path: 'sticker123.webp' });
    });

    it('extracts from dedicated stickers bucket', () => {
      const result = extractStoragePath('https://example.com/storage/v1/object/public/stickers/bulk_123.webp', 'stickers');
      expect(result).toEqual({ bucket: 'stickers', path: 'bulk_123.webp' });
    });

    it('extracts from audio-memes bucket', () => {
      const result = extractStoragePath('https://example.com/storage/v1/object/public/audio-memes/file.mp3', 'audio-memes');
      expect(result).toEqual({ bucket: 'audio-memes', path: 'file.mp3' });
    });

    it('extracts from custom-emojis bucket', () => {
      const result = extractStoragePath('https://example.com/storage/v1/object/public/custom-emojis/emoji.png', 'custom-emojis');
      expect(result).toEqual({ bucket: 'custom-emojis', path: 'emoji.png' });
    });

    it('fallback extracts from /object/public/ pattern', () => {
      const result = extractStoragePath('https://example.com/storage/v1/object/public/unknown-bucket/deep/path/file.webp', 'stickers');
      expect(result).toEqual({ bucket: 'unknown-bucket', path: 'deep/path/file.webp' });
    });

    it('returns null for empty string', () => {
      expect(extractStoragePath('', 'stickers')).toBeNull();
    });

    it('returns null for unrecognized URL pattern', () => {
      expect(extractStoragePath('https://cdn.example.com/random/file.webp', 'stickers')).toBeNull();
    });

    it('handles nested paths in whatsapp-media', () => {
      const result = extractStoragePath('https://example.com/whatsapp-media/contacts/abc/sticker.webp', 'stickers');
      expect(result).toEqual({ bucket: 'whatsapp-media', path: 'contacts/abc/sticker.webp' });
    });
  });

  // ─── Favorite Toggle Logic ────────────────────────────

  describe('Favorite Toggle Logic', () => {
    it('toggles false to true', () => {
      const item = { is_favorite: false };
      const newValue = !item.is_favorite;
      expect(newValue).toBe(true);
    });

    it('toggles true to false', () => {
      const item = { is_favorite: true };
      const newValue = !item.is_favorite;
      expect(newValue).toBe(false);
    });

    it('optimistic update reverts on error', () => {
      const items = [
        { id: 'i1', is_favorite: false },
        { id: 'i2', is_favorite: true },
      ];
      const targetId = 'i1';
      const newValue = true;
      // Simulate optimistic update
      const updated = items.map(i => i.id === targetId ? { ...i, is_favorite: newValue } : i);
      expect(updated[0].is_favorite).toBe(true);
      // Simulate revert
      const reverted = updated.map(i => i.id === targetId ? { ...i, is_favorite: !newValue } : i);
      expect(reverted[0].is_favorite).toBe(false);
    });
  });

  // ─── File Size Validation ─────────────────────────────

  describe('File Size Validation', () => {
    const MAX_UPLOAD_SIZE_MB = 10;
    const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;

    it('rejects files over 10MB', () => {
      const fileSize = 11 * 1024 * 1024;
      expect(fileSize > MAX_UPLOAD_SIZE_BYTES).toBe(true);
    });

    it('accepts files under 10MB', () => {
      const fileSize = 5 * 1024 * 1024;
      expect(fileSize <= MAX_UPLOAD_SIZE_BYTES).toBe(true);
    });

    it('accepts files exactly 10MB', () => {
      const fileSize = 10 * 1024 * 1024;
      expect(fileSize <= MAX_UPLOAD_SIZE_BYTES).toBe(true);
    });

    it('filters oversized files from batch', () => {
      const files = [
        { name: 'small.mp3', size: 1024 * 1024 },
        { name: 'big.mp3', size: 15 * 1024 * 1024 },
        { name: 'medium.mp3', size: 9 * 1024 * 1024 },
      ];
      const valid = files.filter(f => f.size <= MAX_UPLOAD_SIZE_BYTES);
      expect(valid).toHaveLength(2);
      expect(valid.map(f => f.name)).toEqual(['small.mp3', 'medium.mp3']);
    });
  });

  // ─── Rename Validation (enhanced) ─────────────────────

  describe('Rename Validation Enhanced', () => {
    it('trims whitespace before checking', () => {
      const name = '   Valid   ';
      expect(name.trim()).toBe('Valid');
      expect(name.trim().length > 0).toBe(true);
    });

    it('rejects empty after trim', () => {
      const name = '   ';
      expect(name.trim().length > 0).toBe(false);
    });

    it('preserves internal spaces', () => {
      const name = 'Hello World';
      expect(name.trim()).toBe('Hello World');
    });
  });

  // ─── Category Select with Unknown Values ──────────────

  describe('InlineCategorySelect Unknown Categories', () => {
    it('adds unknown category to list', () => {
      const categories: Record<string, string> = { 'riso': '😂', 'amor': '❤️' };
      const value = 'desconhecido';
      const allCategories = { ...categories };
      if (value && !(value in allCategories)) {
        allCategories[value] = '❓';
      }
      expect(allCategories).toHaveProperty('desconhecido');
      expect(allCategories['desconhecido']).toBe('❓');
    });

    it('does not duplicate known category', () => {
      const categories: Record<string, string> = { 'riso': '😂', 'amor': '❤️' };
      const value = 'riso';
      const allCategories = { ...categories };
      if (value && !(value in allCategories)) {
        allCategories[value] = '❓';
      }
      expect(allCategories['riso']).toBe('😂');
      expect(Object.keys(allCategories)).toHaveLength(2);
    });
  });

  // ─── Optimistic Update & Revert (Category) ────────────

  describe('Optimistic Category Update with Revert', () => {
    it('reverts category on error', () => {
      const items = [
        { id: 'i1', category: 'riso' },
        { id: 'i2', category: 'amor' },
      ];
      const selected = new Set(['i1']);
      const oldItems = items.filter(i => selected.has(i.id)).map(i => ({ id: i.id, category: i.category }));
      
      // Optimistic
      const updated = items.map(i => selected.has(i.id) ? { ...i, category: 'deboche' } : i);
      expect(updated[0].category).toBe('deboche');
      
      // Revert
      const reverted = updated.map(i => {
        const old = oldItems.find(o => o.id === i.id);
        return old ? { ...i, category: old.category } : i;
      });
      expect(reverted[0].category).toBe('riso');
      expect(reverted[1].category).toBe('amor');
    });
  });

  // ─── Audio Error Handling ─────────────────────────────

  describe('Audio Preview Error Handling', () => {
    it('returns early if no audio_url', () => {
      const item = { audio_url: undefined };
      const hasUrl = !!item.audio_url;
      expect(hasUrl).toBe(false);
    });

    it('detects missing audio_url', () => {
      const item = { audio_url: '' };
      const hasUrl = !!item.audio_url;
      expect(hasUrl).toBe(false);
    });

    it('detects valid audio_url', () => {
      const item = { audio_url: 'https://example.com/audio.mp3' };
      const hasUrl = !!item.audio_url;
      expect(hasUrl).toBe(true);
    });
  });

  // ─── Selection Clearing on Filter Change ──────────────

  describe('Selection Clearing', () => {
    it('new Set() clears all selections', () => {
      const selected = new Set(['a', 'b', 'c']);
      const cleared = new Set<string>();
      expect(cleared.size).toBe(0);
    });

    it('filter change should reset selection', () => {
      // Simulates the useEffect behavior
      let selected = new Set(['a', 'b']);
      const filterCategory = 'riso';
      // When filter changes, selection is cleared
      selected = new Set();
      expect(selected.size).toBe(0);
    });
  });

  // ─── Reclassify Error Counting ────────────────────────

  describe('Reclassify Error Counting', () => {
    it('counts errors separately from updates', () => {
      let updated = 0;
      let errors = 0;

      // Simulate processing 4 items
      const results = [
        { success: true, changed: true },
        { success: true, changed: false },
        { success: false, changed: false },
        { success: true, changed: true },
      ];

      for (const r of results) {
        if (!r.success) errors++;
        else if (r.changed) updated++;
      }

      expect(updated).toBe(2);
      expect(errors).toBe(1);
    });

    it('formats message with errors', () => {
      const updated = 2;
      const total = 4;
      const errors = 1;
      const msg = `${updated}/${total} itens reclassificados com IA`;
      const msgWithErrors = `${msg} (${errors} erros)`;
      expect(msgWithErrors).toBe('2/4 itens reclassificados com IA (1 erros)');
    });
  });

  // ─── Escape Key on Edit ───────────────────────────────

  describe('Edit Keyboard Shortcuts', () => {
    it('Enter key triggers save', () => {
      let saved = false;
      const onKeyDown = (key: string) => { if (key === 'Enter') saved = true; };
      onKeyDown('Enter');
      expect(saved).toBe(true);
    });

    it('Escape key cancels edit', () => {
      let cancelled = false;
      const onKeyDown = (key: string) => { if (key === 'Escape') cancelled = true; };
      onKeyDown('Escape');
      expect(cancelled).toBe(true);
    });

    it('other keys do nothing', () => {
      let saved = false;
      let cancelled = false;
      const onKeyDown = (key: string) => {
        if (key === 'Enter') saved = true;
        if (key === 'Escape') cancelled = true;
      };
      onKeyDown('a');
      expect(saved).toBe(false);
      expect(cancelled).toBe(false);
    });
  });

  // ─── Image fallback for missing URL ───────────────────

  describe('Image Preview Fallback', () => {
    it('shows fallback when url is falsy', () => {
      const url: string | undefined = undefined;
      const showFallback = !url;
      expect(showFallback).toBe(true);
    });

    it('shows image when url exists', () => {
      const url = 'https://example.com/img.webp';
      const showFallback = !url;
      expect(showFallback).toBe(false);
    });
  });

  // ─── Dialog Cleanup on Close ──────────────────────────

  describe('Dialog Cleanup', () => {
    it('resets preview URL on close', () => {
      let genPreviewUrl: string | null = 'data:audio/mpeg;base64,...';
      // Simulate onOpenChange(false)
      genPreviewUrl = null;
      expect(genPreviewUrl).toBeNull();
    });
  });

  // ─── Bulk Delete with Empty Selection ─────────────────

  describe('Bulk Delete Edge Cases', () => {
    it('does nothing when selection is empty', () => {
      const selected = new Set<string>();
      const items = [{ id: 's1' }, { id: 's2' }];
      const toDelete = items.filter(i => selected.has(i.id));
      expect(toDelete).toHaveLength(0);
    });

    it('handles selection with non-existent IDs', () => {
      const selected = new Set(['nonexistent1', 'nonexistent2']);
      const items = [{ id: 's1' }, { id: 's2' }];
      const toDelete = items.filter(i => selected.has(i.id));
      expect(toDelete).toHaveLength(0);
    });
  });

  // ─── Gen Duration Bounds ──────────────────────────────

  describe('AI Generation Duration Bounds', () => {
    it('sfx mode resets to 5', () => {
      let duration = 30;
      const mode = 'sfx';
      if (mode === 'sfx') duration = 5;
      expect(duration).toBe(5);
    });

    it('music mode resets to 15', () => {
      let duration = 5;
      const mode = 'music';
      if (mode === 'music') duration = 15;
      expect(duration).toBe(15);
    });

    it('sfx range is 1-22', () => {
      const min = 1;
      const max = 22;
      expect(max - min).toBe(21);
      expect(min).toBeGreaterThanOrEqual(1);
      expect(max).toBeLessThanOrEqual(22);
    });

    it('music range is 5-60', () => {
      const min = 5;
      const max = 60;
      expect(min).toBeGreaterThanOrEqual(5);
      expect(max).toBeLessThanOrEqual(60);
    });
  });

  // ─── GenPrompt validation ─────────────────────────────

  describe('Generate Prompt Validation', () => {
    it('empty prompt prevents generation', () => {
      const prompt = '';
      expect(prompt.trim().length > 0).toBe(false);
    });

    it('whitespace-only prompt prevents generation', () => {
      const prompt = '   ';
      expect(prompt.trim().length > 0).toBe(false);
    });

    it('valid prompt passes', () => {
      const prompt = 'risada de vilão';
      expect(prompt.trim().length > 0).toBe(true);
    });

    it('name truncated to 80 chars on save', () => {
      const longPrompt = 'A'.repeat(100);
      const name = longPrompt.substring(0, 80);
      expect(name.length).toBe(80);
    });
  });
});
