/**
 * R2-INB-063 — o corpo do card de resposta rápida anunciava cópia sem escrever
 * no clipboard.
 *
 * Consumidor do defeito: Configurações → Mensagens (`SettingsView` renderiza
 * `<QuickRepliesManager compact={false} />`, sem `onSelect`). Clicar no CORPO do
 * card chamava `handleSelect`, que incrementava uso, chamava um `onSelect`
 * inexistente e mostrava "Resposta copiada!" — sem tocar no clipboard. O ícone
 * dedicado Copiar usa outro handler (`onCopy`) e sempre escreveu.
 *
 * Aqui o componente é o REAL: só o hook de dados (`@/hooks/chat/useQuickReplies`,
 * o mesmo caminho que a tela importa) e o `sonner` são mockados.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QuickRepliesManager } from '../QuickRepliesManager';

const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: toastSuccess, error: toastError }),
}));

const TEMPLATE = {
  id: 'tpl-1',
  title: 'Boas-vindas',
  content: 'Olá! Como posso ajudar?',
  shortcut: '/boas-vindas',
  category: 'geral',
  is_global: false,
  use_count: 3,
  user_id: 'user-1',
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T10:00:00.000Z',
};

const incrementUseCount = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/chat/useQuickReplies', () => ({
  useQuickReplies: () => ({
    templates: [TEMPLATE],
    filteredTemplates: [TEMPLATE],
    favoriteTemplates: [],
    recentTemplates: [TEMPLATE],
    searchQuery: '',
    setSearchQuery: vi.fn(),
    isLoading: false,
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    toggleFavorite: vi.fn(),
    isFavorite: () => false,
    incrementUseCount,
    isCreating: false,
    isUpdating: false,
  }),
}));

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  toastSuccess.mockReset();
  toastError.mockReset();
  incrementUseCount.mockReset();
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
});

/** O corpo do card é o elemento que carrega o título/conteúdo (não os ícones). */
const clicarNoCorpo = () => fireEvent.click(screen.getByText('Boas-vindas'));

const botaoCopiarDoCard = (container: HTMLElement) =>
  container.querySelector('.lucide-copy')?.closest('button') as HTMLButtonElement;

describe('R2-INB-063 — corpo do card de resposta rápida', () => {
  it('sem onSelect (Configurações): o clique no corpo escreve no clipboard e só então anuncia a cópia', async () => {
    render(<QuickRepliesManager />);

    clicarNoCorpo();

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(TEMPLATE.content));
    expect(toastSuccess).toHaveBeenCalledWith('Resposta copiada!');
    expect(toastError).not.toHaveBeenCalled();
  });

  it('com onSelect (Composer): o clique no corpo insere a resposta, não copia e não anuncia cópia', async () => {
    const onSelect = vi.fn();
    render(<QuickRepliesManager onSelect={onSelect} />);

    clicarNoCorpo();

    expect(onSelect).toHaveBeenCalledWith(TEMPLATE.content);
    expect(writeText).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalledWith('Resposta copiada!');
  });

  it('falha do clipboard: não anuncia cópia quando a escrita não volta', async () => {
    writeText.mockRejectedValueOnce(new Error('clipboard bloqueado'));
    render(<QuickRepliesManager />);

    clicarNoCorpo();

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalledWith('Resposta copiada!');
  });
});

describe('R2-INB-063 — ícone dedicado Copiar (não confundir com o corpo)', () => {
  it('o ícone copia o conteúdo e não dispara o onSelect do corpo', async () => {
    const onSelect = vi.fn();
    const { container } = render(<QuickRepliesManager onSelect={onSelect} />);

    fireEvent.click(botaoCopiarDoCard(container));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(TEMPLATE.content));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
