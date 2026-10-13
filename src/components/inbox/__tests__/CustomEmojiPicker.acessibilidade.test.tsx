import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CustomEmojiPicker } from '@/components/inbox/CustomEmojiPicker';

const emojis = [
  { id: 'e1', name: 'Coração', category: 'amor', image_url: 'https://x/coracao.png', is_favorite: false, use_count: 3, uploaded_by: null },
  { id: 'e2', name: 'Foguete', category: 'diversos', image_url: 'https://x/foguete.png', is_favorite: true, use_count: 1, uploaded_by: null },
];

const hookState = {
  emojis,
  loading: false,
  uploading: false,
  saving: false,
  pendingUpload: null,
  fileInputRef: { current: null },
  handleFileSelect: vi.fn(),
  handleConfirmUpload: vi.fn(),
  handleCancelUpload: vi.fn(),
  handleSend: vi.fn(),
  toggleFavorite: vi.fn(),
  handleCategoryChange: vi.fn(),
  handleDelete: vi.fn(),
  setPendingUpload: vi.fn(),
};

vi.mock('@/hooks/integrations/useCustomEmojis', () => ({
  useCustomEmojis: () => hookState,
}));

function renderPicker() {
  return render(
    <TooltipProvider>
      <CustomEmojiPicker onSendEmoji={vi.fn()} />
    </TooltipProvider>,
  );
}

async function openCustomTab() {
  renderPicker();
  fireEvent.click(screen.getByRole('button', { name: 'Emojis Personalizados' }));
  fireEvent.click(await screen.findByText('Customizados'));
  await screen.findByAltText('Coração');
}

/** Contador do rodapé da lista ("1/2 emojis ..."): determinístico, sem depender da animação de saída. */
function contador(): string {
  return screen.getByText(/\d+\/2 emojis/).textContent || '';
}

describe('CustomEmojiPicker — acessibilidade e busca sem acento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('abre e fecha o popover com o Tooltip junto, sem loop de render', async () => {
    renderPicker();
    const gatilho = screen.getByRole('button', { name: 'Emojis Personalizados' });
    // Tooltip + Popover no mesmo gatilho: abre, fecha (Esc) e reabre sem travar o render.
    fireEvent.click(gatilho);
    expect(await screen.findByText('Customizados')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('Customizados')).toBeNull());
    fireEvent.click(gatilho);
    expect(await screen.findByText('Customizados')).toBeTruthy();
  });

  it('busca acha "Coração" digitando sem acento e em caixa alta', async () => {
    await openCustomTab();

    const busca = screen.getByPlaceholderText('Buscar emojis...');

    fireEvent.change(busca, { target: { value: 'coracao' } });
    expect(await screen.findByAltText('Coração')).toBeTruthy();
    expect(contador()).toContain('1/2');

    fireEvent.change(busca, { target: { value: 'CORACAO' } });
    expect(await screen.findByAltText('Coração')).toBeTruthy();
    expect(contador()).toContain('1/2');

    // categoria também casa sem acento/caixa
    fireEvent.change(busca, { target: { value: 'AMOR' } });
    expect(await screen.findByAltText('Coração')).toBeTruthy();
    expect(contador()).toContain('1/2');

    fireEvent.change(busca, { target: { value: 'inexistente' } });
    expect(contador()).toContain('0/2');
  });

  it('os controles de favoritar e excluir têm rótulo e aparecem no foco por teclado', async () => {
    await openCustomTab();

    const favoritar = screen.getAllByRole('button', { name: 'Favoritar' })[0];
    const excluir = screen.getAllByRole('button', { name: 'Excluir' })[0];

    // antes do foco o overlay está oculto; o foco por teclado o revela no CSS
    expect(favoritar.parentElement?.parentElement?.className).toContain('group-focus-within:opacity-100');

    favoritar.focus();
    expect(document.activeElement).toBe(favoritar);
    excluir.focus();
    expect(document.activeElement).toBe(excluir);
  });

  it('o botão de limpar busca tem rótulo acessível e devolve a lista', async () => {
    await openCustomTab();
    const busca = screen.getByPlaceholderText('Buscar emojis...');
    fireEvent.change(busca, { target: { value: 'zzz' } });
    expect(contador()).toContain('0/2');

    fireEvent.click(screen.getByRole('button', { name: 'Limpar busca' }));
    expect(await screen.findByAltText('Coração')).toBeTruthy();
    expect(contador()).toContain('2/2');
  });
});
