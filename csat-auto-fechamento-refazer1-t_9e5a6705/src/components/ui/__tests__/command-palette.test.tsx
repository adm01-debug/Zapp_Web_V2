import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommandPalette } from '@/components/ui/command-palette';

// R2-INF-034: com a busca vazia a paleta exibe o "Acesso rápido" (cinco destinos) e a
// barra de dicas anuncia "↑↓ navegar / Enter selecionar", mas o listener de teclado
// só percorria `allItems` — que é vazio quando não há consulta. Este teste dispara o
// teclado do usuário (foco no input) sobre o componente REAL e confere o destino
// executado por Enter.
function renderPalette(props: Record<string, unknown> = {}) {
  const onNavigate = vi.fn();
  const onOpenChange = vi.fn();
  render(<CommandPalette open onOpenChange={onOpenChange} onNavigate={onNavigate} {...props} />);
  // O foco real vai para o input de busca quando a paleta abre (command-palette.tsx:91-94).
  const input = screen.getByPlaceholderText(/Buscar ou digitar comando/);
  input.focus();
  return { onNavigate, onOpenChange, input };
}

const arrowDown = (input: HTMLElement) => fireEvent.keyDown(input, { key: 'ArrowDown' });
const arrowUp = (input: HTMLElement) => fireEvent.keyDown(input, { key: 'ArrowUp' });
const enter = (input: HTMLElement) => fireEvent.keyDown(input, { key: 'Enter' });

describe('CommandPalette — teclado no acesso rápido com busca vazia (R2-INF-034)', () => {
  it('Enter com a busca vazia executa o destino em destaque (o primeiro do acesso rápido)', () => {
    const { onNavigate, input } = renderPalette();
    expect(screen.getByText('Acesso rápido')).toBeInTheDocument();

    enter(input);

    expect(onNavigate).toHaveBeenCalledWith('inbox');
  });

  it('as setas percorrem os destinos exibidos e Enter executa o escolhido', () => {
    const { onNavigate, input } = renderPalette();

    arrowDown(input);
    arrowDown(input);
    enter(input);

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('contacts');
  });

  it('a seta para cima a partir do primeiro item dá a volta para o último destino exibido', () => {
    const { onNavigate, input } = renderPalette();

    arrowUp(input);
    enter(input);

    expect(onNavigate).toHaveBeenCalledWith('queues');
  });

  it('a navegação dá a volta depois do último destino (não trava no fim da lista)', () => {
    const { onNavigate, input } = renderPalette();

    for (let i = 0; i < 5; i++) arrowDown(input);
    enter(input);

    expect(onNavigate).toHaveBeenCalledWith('inbox');
  });

  it('com consulta sem resultado nenhum, setas e Enter não executam nada', () => {
    const { onNavigate, onOpenChange, input } = renderPalette();

    fireEvent.change(input, { target: { value: 'zzzzzz' } });
    arrowDown(input);
    arrowUp(input);
    enter(input);

    expect(onNavigate).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('com consulta, Enter continua executando o resultado destacado da busca', () => {
    const { onNavigate, input } = renderPalette();

    fireEvent.change(input, { target: { value: 'relatórios' } });
    enter(input);

    expect(onNavigate).toHaveBeenCalledWith('reports');
  });

  it('item desabilitado na lista da consulta não executa nem fecha a paleta', () => {
    const action = vi.fn();
    const { onNavigate, onOpenChange, input } = renderPalette({
      customCommands: [
        { id: 'action-bloqueada', title: 'Bloqueada', category: 'action', disabled: true, action },
      ],
    });

    fireEvent.change(input, { target: { value: 'bloqueada' } });
    enter(input);

    expect(action).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
