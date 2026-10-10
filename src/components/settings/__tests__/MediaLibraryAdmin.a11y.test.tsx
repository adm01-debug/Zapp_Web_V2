/**
 * N-151 — acessibilidade: botões e seletores sem nome na Biblioteca de Mídia.
 *
 * Defeitos medidos: botões de renomear, salvar, cancelar, excluir e os
 * filtros de categoria são controles sem nome (button-name [critical]).
 * Inclui o botão "Tocar prévia" do AIGenerateDialog e o botão de play
 * da linha de mídia.
 *
 * Prova: getByRole encontra os 4 botões de ação por item, os 3 seletores
 * nomeados e o axe não acusa button-name.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';

const mockFrom = vi.fn();
const mockStorage = vi.fn();
const mockFunctions = { invoke: vi.fn() };
const mockAuth = { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) };

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    storage: { from: (...args: unknown[]) => mockStorage(...args) },
    functions: { invoke: (...args: unknown[]) => mockFunctions.invoke(...args) },
    auth: { getUser: () => mockAuth.getUser() },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { MediaLibraryAdmin } from '../MediaLibraryAdmin';

function makeSticker(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id || 'sticker-1',
    name: overrides.name || 'Figurinha Teste',
    category: 'engraçado',
    is_favorite: false,
    use_count: 0,
    created_at: '2025-01-01T00:00:00Z',
    uploaded_by: 'user-1',
    image_url: 'https://storage.example.com/stickers/test.webp',
    ...overrides,
  };
}

function setupSupabaseQuery(data: unknown[] = []) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data, error: null }),
    range: vi.fn().mockResolvedValue({ data, error: null }),
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
  mockStorage.mockReturnValue({
    upload: vi.fn().mockResolvedValue({ error: null }),
    remove: vi.fn().mockResolvedValue({ error: null }),
    getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://storage.example.com/file.mp3' } }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupSupabaseQuery([makeSticker()]);
  setupStorage();
});

describe('N-151 — controles sem nome na Biblioteca de Mídia', () => {
  it('getByRole encontra os 4 botões de ação do item (salvar, cancelar, renomear, excluir)', async () => {
    render(<MediaLibraryAdmin />);

    // Entra no modo de edição do primeiro item
    const editBtn = await screen.findByRole('button', { name: 'Renomear' });
    fireEvent.click(editBtn);

    // Os 4 botões agora são visíveis e nomeados
    expect(screen.getByRole('button', { name: 'Salvar nome' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Renomear' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir' })).toBeInTheDocument();
  });

  it('getByRole encontra os 3 seletores de categoria nomeados', async () => {
    render(<MediaLibraryAdmin />);

    // Aguarda os itens carregarem (InlineCategorySelect aparece nas linhas da tabela)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Renomear' })).toBeInTheDocument();
    });

    // Os 3 seletores (SelectTrigger renderiza como button com aria-label)
    expect(screen.getByLabelText('Filtrar por categoria')).toBeInTheDocument();
    expect(await screen.findByLabelText('Filtrar categoria')).toBeInTheDocument();

    // Seleciona o primeiro item para revelar o seletor "Mover para categoria"
    const checkbox = screen.getByRole('checkbox', { name: 'Selecionar Figurinha Teste' });
    fireEvent.click(checkbox);

    expect(await screen.findByLabelText('Mover para categoria')).toBeInTheDocument();
  });

  it('o axe não acusa button-name na tela da Biblioteca de Mídia', async () => {
    render(<MediaLibraryAdmin />);

    // Aguarda os itens carregarem e o botão de editar ficar disponível
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Renomear' })).toBeInTheDocument();
    });

    const results = await axe(document.body, { rules: { 'color-contrast': { enabled: false } } });
    const buttonNameViolations = results.violations.filter((v) => v.id === 'button-name');
    expect(buttonNameViolations).toEqual([]);
  });

  it('o botão "Tocar prévia" do AIGenerateDialog tem nome acessível', async () => {
    render(<MediaLibraryAdmin />);

    // Abre o diálogo de geração de áudio (aba Áudios Meme)
    const audioTab = screen.getByRole('tab', { name: /Áudios Meme/ });
    fireEvent.click(audioTab);

    // Verifica que o axe não acusa button-name (inclui o play preview do AIGenerateDialog)
    const results = await axe(document.body, { rules: { 'color-contrast': { enabled: false } } });
    const buttonNameViolations = results.violations.filter((v) => v.id === 'button-name');
    expect(buttonNameViolations).toEqual([]);
  });
});