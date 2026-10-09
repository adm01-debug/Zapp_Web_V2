import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ═══════════════════════════════════════════════════════════
// Mock Setup — só o cliente Supabase e o sonner são mockados.
// `useResolvedStorageUrl` e `parseSupabaseStorageObjectUrl` rodam DE VERDADE:
// é o caminho que a tela usa para trocar o locator de bucket privado pela
// assinatura. Mockar o resolvedor provaria um caminho que a tela não usa.
// ═══════════════════════════════════════════════════════════

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  storageFrom: vi.fn(),
  createSignedUrl: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mocks.from(...args),
    storage: { from: (...args: unknown[]) => mocks.storageFrom(...args) },
    functions: { invoke: vi.fn() },
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { MediaLibraryAdmin } from '../MediaLibraryAdmin';
import { SUPABASE_URL } from '@/config/supabase';

// Mesma origem que o resolvedor usa para reconhecer o locator canônico.
const ORIGIN = new URL(SUPABASE_URL).origin;
const SIGNED = (path: string) =>
  `${ORIGIN}/storage/v1/object/sign/whatsapp-media/${path}?token=fresh`;

// ═══════════════════════════════════════════════════════════
// Test Factories
// ═══════════════════════════════════════════════════════════

function sticker(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sticker-1',
    name: 'Figurinha',
    category: 'memes',
    is_favorite: false,
    use_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    uploaded_by: 'user-1',
    image_url: 'https://cdn.example.com/f.webp',
    ...overrides,
  };
}

function audioMeme(overrides: Record<string, unknown> = {}) {
  return {
    id: 'audio-1',
    name: 'Meme',
    category: 'risadas',
    is_favorite: false,
    use_count: 3,
    created_at: '2026-01-01T00:00:00Z',
    uploaded_by: 'user-1',
    audio_url: 'https://cdn.example.com/a.mp3',
    duration_seconds: 3,
    ...overrides,
  };
}

/** Cada tabela responde só as suas linhas (o picker e a biblioteca leem a mesma `stickers`). */
function setupTables(tables: Record<string, unknown[]>) {
  mocks.from.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      order: () => chain,
      range: (from: number, to: number) => Promise.resolve({ data: (tables[table] ?? []).slice(from, to + 1), error: null }),
      limit: () => Promise.resolve({ data: tables[table] ?? [], error: null }),
      insert: () => Promise.resolve({ error: null }),
      update: () => ({ eq: () => Promise.resolve({ error: null }), in: () => Promise.resolve({ error: null }) }),
      delete: () => ({ eq: () => Promise.resolve({ error: null }), in: () => Promise.resolve({ error: null }) }),
    };
    return chain;
  });
}

function setupStorage() {
  mocks.storageFrom.mockReturnValue({
    createSignedUrl: mocks.createSignedUrl,
    upload: vi.fn().mockResolvedValue({ error: null }),
    remove: vi.fn().mockResolvedValue({ error: null }),
    getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: '' } }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupTables({ stickers: [], audio_memes: [], custom_emojis: [] });
  mocks.createSignedUrl.mockResolvedValue({
    data: { signedUrl: SIGNED('fallback.webp') },
    error: null,
  });
  setupStorage();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ═══════════════════════════════════════════════════════════
// R2-INB-052 (#345-B) — miniatura da biblioteca administrativa
// ═══════════════════════════════════════════════════════════

describe('MediaLibraryAdmin — miniatura de bucket privado', () => {
  it('caso 1: locator público legado de bucket privado vira assinatura na miniatura', async () => {
    const locator = `${ORIGIN}/storage/v1/object/public/whatsapp-media/recebida.webp`;
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: SIGNED('recebida.webp') },
      error: null,
    });
    setupTables({ stickers: [sticker({ id: 's1', name: 'Recebida', image_url: locator })] });

    render(<MediaLibraryAdmin />);

    const img = await screen.findByAltText('Recebida');
    await waitFor(() =>
      expect(mocks.createSignedUrl).toHaveBeenCalledWith('recebida.webp', 3600),
    );
    expect(mocks.storageFrom).toHaveBeenCalledWith('whatsapp-media');
    expect(img).toHaveAttribute('src', SIGNED('recebida.webp'));
  });

  it('caso 2: URL assinada expirada é renovada antes de a miniatura carregar', async () => {
    const expired = `${ORIGIN}/storage/v1/object/sign/whatsapp-media/x.webp?token=expired`;
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: SIGNED('x.webp') },
      error: null,
    });
    setupTables({ stickers: [sticker({ id: 's2', name: 'Renovada', image_url: expired })] });

    render(<MediaLibraryAdmin />);

    const img = await screen.findByAltText('Renovada');
    await waitFor(() => expect(mocks.createSignedUrl).toHaveBeenCalledWith('x.webp', 3600));
    expect(img).toHaveAttribute('src', SIGNED('x.webp'));
  });

  it('caso 3: falha ao assinar mostra placeholder estável e a linha continua na tabela', async () => {
    mocks.createSignedUrl.mockResolvedValue({
      data: null,
      error: new Error('object missing'),
    });
    const locator = `${ORIGIN}/storage/v1/object/public/whatsapp-media/sumida.webp`;
    setupTables({ stickers: [sticker({ id: 's3', name: 'Sumida', image_url: locator })] });

    render(<MediaLibraryAdmin />);

    expect(await screen.findByTestId('media-row-thumb-error')).toBeInTheDocument();
    // A linha permanece: só a miniatura cai no placeholder. O nome aparece no
    // "Mais usados" do cabeçalho E na própria linha da tabela.
    expect(screen.getAllByText('Sumida').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByAltText('Sumida')).not.toBeInTheDocument();
  });

  it('caso 4a: URL não canônica passa intacta e não pede assinatura', async () => {
    setupTables({
      stickers: [sticker({ id: 's4', name: 'CDN', image_url: 'https://cdn.example.com/f.webp' })],
    });

    render(<MediaLibraryAdmin />);

    const img = await screen.findByAltText('CDN');
    expect(img).toHaveAttribute('src', 'https://cdn.example.com/f.webp');
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it('caso 4b: a linha de áudio meme segue com o botão Play e sem <img>', async () => {
    setupTables({
      audio_memes: [audioMeme({ id: 'a1', name: 'Meme' })],
    });

    const { container } = render(<MediaLibraryAdmin />);
    // Radix Tabs só ativa a aba no `mousedown` (não no `click` puro).
    const abaAudio = screen.getByRole('tab', { name: /Áudios Meme/ });
    fireEvent.mouseDown(abaAudio);
    fireEvent.click(abaAudio);

    await waitFor(() => expect(container.querySelector('.lucide-play')).not.toBeNull());
    expect(screen.getAllByText('Meme').length).toBeGreaterThan(0);
    expect(container.querySelector('img')).toBeNull();
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });
});
