/**
 * N-151 — acessibilidade da Biblioteca de Mídia: controles sem nome acessível.
 *
 * Defeito medido (axe `button-name` [critical]): os controles da LINHA de mídia
 * (renomear, excluir, favoritar, tocar/pausar a prévia), o campo e os botões de
 * salvar/cancelar da edição e os seletores de categoria (filtro da lista, categoria
 * da linha e mover do lote) apareciam como botões "vazios" para o leitor de tela.
 * O botão "Tocar prévia" do AIGenerateDialog só existe DEPOIS da geração.
 *
 * Prova (2 itens na mesma lista, nomes distintos):
 *  - `getByRole` (que FALHA quando há mais de um match) acha os 4 botões de ação de
 *    CADA item pelo nome do item e os 3 seletores nomeados — sem o nome do item, os
 *    rótulos colidem e nada é distinguível;
 *  - o modo de edição expõe campo e botões nomeados por item;
 *  - o play da linha alterna o rótulo para "Pausar <item>";
 *  - o axe não acusa `button-name` nem na lista (com edição aberta e item selecionado)
 *    nem no diálogo de geração com a PRÉVIA ABERTA — o fluxo é conduzido até lá
 *    (clicar na aba e rodar o axe não alcança o botão: ele nasce com o preview).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';

const mockFrom = vi.fn();
const mockStorage = vi.fn();
const mockInvoke = vi.fn();
const mockGetUser = vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } });

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    storage: { from: (...args: unknown[]) => mockStorage(...args) },
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
    auth: { getUser: () => mockGetUser() },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { MediaLibraryAdmin } from '../MediaLibraryAdmin';

/** `new Audio()` falso: o jsdom não reproduz, mas o rótulo do play depende do estado. */
class FakeAudio {
  src: string;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  constructor(src: string) { this.src = src; }
}

const ALFA = 'Figurinha Alfa';
const BETA = 'Figurinha Beta';

function makeItem(name: string) {
  return {
    id: `media-${name}`,
    name,
    category: 'memes',
    is_favorite: false,
    use_count: 0,
    created_at: '2025-01-01T00:00:00Z',
    uploaded_by: 'user-1',
    image_url: `https://storage.example.com/stickers/${encodeURIComponent(name)}.webp`,
    audio_url: `https://storage.example.com/audio-memes/${encodeURIComponent(name)}.mp3`,
  };
}

function setupSupabaseQuery(data: unknown[]) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({ data, error: null }),
    update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }), in: vi.fn().mockResolvedValue({ error: null }) }),
    delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null, data: [] }) }),
  };
  mockFrom.mockReturnValue(chain);
  return chain;
}

function setupStorage() {
  mockStorage.mockReturnValue({
    upload: vi.fn().mockResolvedValue({ error: null }),
    remove: vi.fn().mockResolvedValue({ error: null }),
    getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://storage.example.com/file.mp3' } }),
    createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://storage.example.com/signed' }, error: null }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupSupabaseQuery([makeItem(ALFA), makeItem(BETA)]);
  setupStorage();
  mockInvoke.mockResolvedValue({ data: { audioContent: 'QUJD' }, error: null });
  vi.stubGlobal('Audio', FakeAudio);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Abre a aba Áudios Meme e espera a LINHA de áudio existir de fato.
 * Radix Tabs só ativa a aba no `mousedown` — `fireEvent.click` sozinho deixa a aba
 * Figurinhas ativa e o botão de prévia (que só existe em áudio) nunca aparece; era
 * exatamente por isso que o teste anterior "passava" sem provar nada.
 * A espera é pelo ÍCONE do play (existe nos dois estados, com ou sem o nome
 * acessível), para que o axe rode com o botão defeituoso na tela em vez de estourar
 * um timeout de `findByRole` antes de chegar na asserção.
 */
async function abrirAudiosComItens(container: HTMLElement) {
  const aba = screen.getByRole('tab', { name: /Áudios Meme/ });
  fireEvent.mouseDown(aba);
  fireEvent.click(aba);
  await waitFor(() => expect(container.querySelector('.lucide-play')).not.toBeNull());
}

const semViolacaoDeButtonName = async () => {
  const results = await axe(document.body, { rules: { 'color-contrast': { enabled: false } } });
  return results.violations.filter((v) => v.id === 'button-name');
};

describe('N-151 — controles sem nome na Biblioteca de Mídia', () => {
  it('cada item tem os 4 botões de ação nomeados pelo item (sem rótulo duplicado)', async () => {
    const { container } = render(<MediaLibraryAdmin />);
    await abrirAudiosComItens(container);

    for (const nome of [ALFA, BETA]) {
      expect(screen.getByRole('button', { name: `Renomear ${nome}` })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: `Excluir ${nome}` })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: `Favoritar ${nome}` })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: `Tocar prévia de ${nome}` })).toBeInTheDocument();
    }

    // O defeito era exatamente este: rótulos iguais para itens diferentes.
    expect(screen.queryByRole('button', { name: 'Renomear' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Excluir' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Favoritar' })).toBeNull();
  });

  it('os 3 seletores de categoria têm nome próprio (filtro da lista, linha e lote)', async () => {
    const { container } = render(<MediaLibraryAdmin />);
    await abrirAudiosComItens(container);

    expect(screen.getByLabelText('Filtrar por categoria')).toBeInTheDocument();
    expect(screen.getByLabelText(`Categoria de ${ALFA}`)).toBeInTheDocument();
    expect(screen.getByLabelText(`Categoria de ${BETA}`)).toBeInTheDocument();
    // O seletor da linha não repete o nome do filtro da lista.
    expect(screen.queryByLabelText('Filtrar categoria')).toBeNull();

    fireEvent.click(screen.getByRole('checkbox', { name: `Selecionar ${ALFA}` }));
    expect(await screen.findByLabelText('Mover para categoria')).toBeInTheDocument();
  });

  it('a edição da linha expõe campo e botões nomeados pelo item', async () => {
    const { container } = render(<MediaLibraryAdmin />);
    await abrirAudiosComItens(container);

    fireEvent.click(screen.getByRole('button', { name: `Renomear ${ALFA}` }));

    expect(screen.getByLabelText(`Novo nome de ${ALFA}`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Salvar nome de ${ALFA}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Cancelar edição de ${ALFA}` })).toBeInTheDocument();
    // O outro item continua com o botão de renomear dele.
    expect(screen.getByRole('button', { name: `Renomear ${BETA}` })).toBeInTheDocument();
  });

  it('o play da linha alterna o rótulo entre tocar a prévia e pausar', async () => {
    const { container } = render(<MediaLibraryAdmin />);
    await abrirAudiosComItens(container);

    fireEvent.click(screen.getByRole('button', { name: `Tocar prévia de ${ALFA}` }));

    expect(await screen.findByRole('button', { name: `Pausar ${ALFA}` })).toBeInTheDocument();
    // O item que não toca continua com o rótulo de tocar.
    expect(screen.getByRole('button', { name: `Tocar prévia de ${BETA}` })).toBeInTheDocument();
  });

  it('o axe não acusa button-name na lista (lista, edição aberta e item selecionado)', async () => {
    const { container } = render(<MediaLibraryAdmin />);
    await abrirAudiosComItens(container);

    // 1) A lista com o botão de prévia RENDERIZADO — é o nó que o axe acusava.
    //    A asserção vem antes de qualquer clique em controle nomeado, para ser ela
    //    mesma o que fica vermelho sem a correção.
    expect(await semViolacaoDeButtonName()).toEqual([]);

    // 2) Com a edição aberta e um item marcado (barra de ações em lote na tela).
    fireEvent.click(screen.getByRole('button', { name: `Renomear ${ALFA}` }));
    fireEvent.click(screen.getByRole('checkbox', { name: `Selecionar ${BETA}` }));

    expect(await semViolacaoDeButtonName()).toEqual([]);
  });

  it('o axe não acusa button-name no AIGenerateDialog com a prévia aberta', async () => {
    const { container } = render(<MediaLibraryAdmin />);
    await abrirAudiosComItens(container);

    fireEvent.click(screen.getByRole('button', { name: /Gerar com IA/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Risada de vilão/), { target: { value: 'Trovão distante com chuva' } });
    fireEvent.click(screen.getByRole('button', { name: /Gerar Preview/i }));

    // A prévia precisa existir de fato: é ela que cria o botão.
    expect(await screen.findByRole('button', { name: 'Tocar prévia' })).toBeInTheDocument();
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));

    expect(await semViolacaoDeButtonName()).toEqual([]);
  });
});
