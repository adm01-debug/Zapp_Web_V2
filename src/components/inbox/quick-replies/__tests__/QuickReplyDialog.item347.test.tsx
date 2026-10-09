import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { QuickRepliesManager } from '../../QuickRepliesManager';
import type { QuickReplyTemplate } from '@/hooks/chat/useQuickReplies';

// item 347 (R2-INB-054): editar uma resposta rápida reutilizava o formulário
// anterior (de outra edição ou de uma criação) e podia gravá-lo no template
// recém-aberto. O diálogo fica SEMPRE montado dentro do gerenciador (open=false),
// então o estado do formulário não é reiniciado ao abrir/editar.
const { createTemplate, updateTemplate } = vi.hoisted(() => ({
  createTemplate: vi.fn().mockResolvedValue(undefined),
  updateTemplate: vi.fn().mockResolvedValue(undefined),
}));

const TEMPLATES: QuickReplyTemplate[] = [
  {
    id: 'tpl-a',
    title: 'Saudação inicial',
    content: 'Olá! Como posso ajudar?',
    shortcut: '/saudacao',
    category: 'saudacao',
    is_global: false,
    use_count: 3,
    user_id: 'user-1',
    created_at: '2026-10-01T10:00:00.000Z',
    updated_at: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'tpl-b',
    title: 'Pedido de protocolo',
    content: 'Pode me informar o número do protocolo?',
    shortcut: '/protocolo',
    category: 'suporte',
    is_global: false,
    use_count: 1,
    user_id: 'user-1',
    created_at: '2026-10-02T10:00:00.000Z',
    updated_at: '2026-10-02T10:00:00.000Z',
  },
];

vi.mock('@/hooks/chat/useQuickReplies', () => ({
  useQuickReplies: () => ({
    templates: TEMPLATES,
    filteredTemplates: TEMPLATES,
    favoriteTemplates: [],
    recentTemplates: TEMPLATES,
    searchQuery: '',
    setSearchQuery: vi.fn(),
    isLoading: false,
    createTemplate,
    updateTemplate,
    deleteTemplate: vi.fn(),
    toggleFavorite: vi.fn(),
    isFavorite: () => false,
    incrementUseCount: vi.fn(),
    isCreating: false,
    isUpdating: false,
  }),
}));

/** O card do template tem o botão de editar na 3ª posição (favoritar, copiar, editar, excluir). */
function getEditButton(title: string): HTMLElement {
  const card = screen.getByText(title).closest('.group');
  expect(card).not.toBeNull();
  return within(card as HTMLElement).getAllByRole('button')[2];
}

describe('QuickRepliesManager — edição de resposta rápida (item 347)', () => {
  beforeEach(() => {
    createTemplate.mockClear();
    updateTemplate.mockClear();
    localStorage.clear();
  });

  it('abre a edição já com os dados do template clicado', () => {
    render(<QuickRepliesManager />);

    fireEvent.click(getEditButton('Saudação inicial'));

    expect(screen.getByText('Editar Resposta Rápida')).toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toHaveValue('Saudação inicial');
    expect(screen.getByLabelText('Conteúdo')).toHaveValue('Olá! Como posso ajudar?');
    expect(screen.getByLabelText('Atalho')).toHaveValue('/saudacao');
  });

  it('não reutiliza o formulário anterior ao editar outro template', () => {
    render(<QuickRepliesManager />);

    // 1) Usuário passa pelo formulário de criação e fecha.
    fireEvent.click(screen.getByRole('button', { name: /nova/i }));
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Rascunho anterior' } });
    fireEvent.change(screen.getByLabelText('Conteúdo'), { target: { value: 'Conteúdo do rascunho anterior' } });
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(screen.queryByText('Nova Resposta Rápida')).not.toBeInTheDocument();

    // 2) Agora edita OUTRO template: o formulário tem de mostrar os dados DELE.
    fireEvent.click(getEditButton('Pedido de protocolo'));

    expect(screen.getByText('Editar Resposta Rápida')).toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toHaveValue('Pedido de protocolo');
    expect(screen.getByLabelText('Conteúdo')).toHaveValue('Pode me informar o número do protocolo?');
    expect(screen.getByLabelText('Atalho')).toHaveValue('/protocolo');
  });

  it('salva a edição no template aberto, com os dados dele — não com o formulário anterior', async () => {
    render(<QuickRepliesManager />);

    // Formulário anterior (criação) deixa resíduo no estado do diálogo.
    fireEvent.click(screen.getByRole('button', { name: /nova/i }));
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Rascunho anterior' } });
    fireEvent.change(screen.getByLabelText('Conteúdo'), { target: { value: 'Conteúdo do rascunho anterior' } });
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));

    // Abre o template B e salva sem editar nada.
    fireEvent.click(getEditButton('Pedido de protocolo'));
    fireEvent.click(screen.getByRole('button', { name: /salvar alterações/i }));

    await waitFor(() => {
      expect(updateTemplate).toHaveBeenCalledWith({
        id: 'tpl-b',
        title: 'Pedido de protocolo',
        content: 'Pode me informar o número do protocolo?',
        shortcut: '/protocolo',
        category: 'suporte',
      });
    });
    expect(updateTemplate).toHaveBeenCalledTimes(1);
    // Nada foi gravado no template A nem criado um novo.
    expect(updateTemplate).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'tpl-a' }));
    expect(createTemplate).not.toHaveBeenCalled();
  });

  it('criar continua abrindo com o formulário vazio e gravando o que foi digitado', async () => {
    render(<QuickRepliesManager />);

    fireEvent.click(screen.getByRole('button', { name: /nova/i }));
    expect(screen.getByText('Nova Resposta Rápida')).toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toHaveValue('');
    expect(screen.getByLabelText('Conteúdo')).toHaveValue('');

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Boas-vindas' } });
    fireEvent.change(screen.getByLabelText('Conteúdo'), { target: { value: 'Seja bem-vindo!' } });
    fireEvent.change(screen.getByLabelText('Atalho'), { target: { value: '/boasvindas' } });
    fireEvent.click(screen.getByRole('button', { name: /criar resposta/i }));

    await waitFor(() => {
      expect(createTemplate).toHaveBeenCalledWith({
        title: 'Boas-vindas',
        content: 'Seja bem-vindo!',
        shortcut: '/boasvindas',
        category: 'geral',
      });
    });
    expect(updateTemplate).not.toHaveBeenCalled();
  });
});
