import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CustomEmojiPicker } from '@/components/inbox/CustomEmojiPicker';

const emojis = [
  { id: 'e1', name: 'Coração', category: 'amor', image_url: 'https://x/coracao.png', is_favorite: false, use_count: 3, uploaded_by: null },
  { id: 'e2', name: 'Foguete', category: 'diversos', image_url: 'https://x/foguete.png', is_favorite: true, use_count: 1, uploaded_by: null },
];

const hookState: {
  emojis: typeof emojis;
  loading: boolean; uploading: boolean; saving: boolean;
  pendingUpload: null;
  uploadError: string | null; clearUploadError: () => void;
  hasMore: boolean; loadingMore: boolean; loadMore: () => void;
  fileInputRef: { current: { click: () => void } | null };
  handleFileSelect: () => void;
  handleConfirmUpload: () => void;
  handleCancelUpload: () => void;
  handleSend: () => void;
  toggleFavorite: () => void;
  handleCategoryChange: () => void;
  handleDelete: () => void;
  setPendingUpload: () => void;
} = {
  emojis,
  loading: false,
  uploading: false,
  saving: false,
  pendingUpload: null,
  uploadError: null,
  clearUploadError: vi.fn(),
  hasMore: false,
  loadingMore: false,
  loadMore: vi.fn(),
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

  it('abre e fecha o popover com o Tooltip junto, sem montar o painel em duplicidade', async () => {
    renderPicker();
    const gatilho = screen.getByRole('button', { name: 'Emojis Personalizados' });
    // Tooltip + Popover no mesmo gatilho: abre, fecha (Esc) e reabre.
    // O que este teste mostra: o painel monta exatamente uma vez por ciclo
    // (sem duplicar por loop de render). Não afirma nada além disso.
    fireEvent.click(gatilho);
    expect(await screen.findByText('Customizados')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('Customizados')).toBeNull());
    fireEvent.click(gatilho);
    expect(await screen.findByText('Customizados')).toBeTruthy();
    expect(screen.getAllByText('Customizados')).toHaveLength(1);
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

  it('erro de envio aparece na tela com "Tentar novamente" que limpa e reabre a escolha', async () => {
    hookState.uploadError = 'Erro ao enviar arquivo';
    try {
      await openCustomTab();

      const alerta = screen.getByRole('alert');
      expect(alerta.textContent).toContain('Erro ao enviar arquivo');

      // o input real assume a ref na montagem; espiona o clique nele
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const cliqueArquivo = vi.spyOn(input, 'click').mockImplementation(() => {});

      fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
      expect(hookState.clearUploadError).toHaveBeenCalledTimes(1);
      expect(cliqueArquivo).toHaveBeenCalledTimes(1);
    } finally {
      hookState.uploadError = null;
    }
  });

  it('excluir pede confirmação curta: um clique arma, o segundo exclui, cancelar desarma', async () => {
    await openCustomTab();

    // primeiro clique arma a confirmação e NÃO exclui
    fireEvent.click(screen.getAllByRole('button', { name: 'Excluir' })[0]);
    expect(hookState.handleDelete).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Confirmar exclusão de Coração' })).toBeTruthy();

    // cancelar desarma sem excluir
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar exclusão' }));
    expect(hookState.handleDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Confirmar exclusão de Coração' })).toBeNull();

    // armar de novo e confirmar exclui uma vez
    fireEvent.click(screen.getAllByRole('button', { name: 'Excluir' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão de Coração' }));
    expect(hookState.handleDelete).toHaveBeenCalledTimes(1);
  });

  it('mostra "Carregar mais" quando há mais páginas e chama o carregamento', async () => {
    hookState.hasMore = true;
    try {
      await openCustomTab();
      fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
      expect(hookState.loadMore).toHaveBeenCalledTimes(1);
    } finally {
      hookState.hasMore = false;
    }
  });
});
