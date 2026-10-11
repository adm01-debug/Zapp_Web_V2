import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatQuickRepliesPopover } from '../ChatQuickRepliesPopover';

// O jsdom não implementa scrollIntoView; o cmdk chama no item ativo ao navegar.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

const REPLIES = [
  { id: 'r1', title: 'Boas-vindas', shortcut: '/bomdia', content: 'Bom dia! Como posso ajudar?', category: 'saudacao' },
  { id: 'r2', title: 'Pedido de dados', shortcut: '/dados', content: 'Pode confirmar seu CPF?', category: 'dados' },
];

function setup(props: Partial<Parameters<typeof ChatQuickRepliesPopover>[0]> = {}) {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <ChatQuickRepliesPopover show replies={REPLIES} onSelect={onSelect} onClose={onClose} {...props} />,
  );
  return { onSelect, onClose, ...view };
}

function getSearchInput() {
  return screen.getByPlaceholderText('Buscar por atalho ou título');
}

describe('ChatQuickRepliesPopover — títulos, rótulos e teclado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mostra o título "Sugestões Rápidas", a dica de teclado e o rótulo acessível do fechar', () => {
    const { onClose } = setup();

    expect(screen.getByText('Sugestões Rápidas')).toBeInTheDocument();
    expect(
      screen.getByText('Use as setas ↑↓ para navegar e Enter para selecionar'),
    ).toBeInTheDocument();

    const closeButton = screen.getByLabelText('Fechar respostas rápidas');
    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lista vazia mostra "Nenhuma resposta rápida cadastrada" (e não o vazio da busca)', () => {
    setup({ replies: [] });

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Nenhuma resposta rápida cadastrada');
    expect(screen.queryByText('Nenhum resultado para esta busca.')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Buscar por atalho ou título')).not.toBeInTheDocument();
  });

  it('setas ↑↓ navegam e Enter seleciona o item ativo', () => {
    const { onSelect } = setup();
    const input = getSearchInput();

    // O primeiro item já é o ativo: ArrowDown move para o segundo.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(REPLIES[1]);
  });

  it('Enter sem navegar seleciona o primeiro item', () => {
    const { onSelect } = setup();

    fireEvent.keyDown(getSearchInput(), { key: 'Enter' });

    expect(onSelect).toHaveBeenCalledWith(REPLIES[0]);
  });

  it('Esc fecha o painel pelo próprio elemento', () => {
    const { onClose } = setup();

    fireEvent.keyDown(getSearchInput(), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a busca incremental filtra por título e por atalho', () => {
    setup();

    fireEvent.change(getSearchInput(), { target: { value: 'dados' } });

    expect(screen.getByText('Pedido de dados')).toBeInTheDocument();
    expect(screen.queryByText('Boas-vindas')).not.toBeInTheDocument();
  });

  it('busca sem correspondência mostra o aviso de busca vazia', () => {
    setup();

    fireEvent.change(getSearchInput(), { target: { value: 'zzz-inexistente' } });

    expect(screen.getByText('Nenhum resultado para esta busca.')).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma resposta rápida cadastrada')).not.toBeInTheDocument();
  });

  it('não renderiza nada com show=false', () => {
    setup({ show: false });

    expect(screen.queryByTestId('quick-replies-popover')).not.toBeInTheDocument();
    expect(screen.queryByText('Sugestões Rápidas')).not.toBeInTheDocument();
  });
});
