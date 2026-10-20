import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SlashCommands } from '../SlashCommands';

// jsdom não implementa scrollIntoView — a lista de comandos centraliza o item
// selecionado. Stub só de ambiente de teste; nada de produção muda por causa dele.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// R2-INB-021 (item 317): /note e /tag apareciam na lista de comandos e, ao
// serem escolhidos, só limpavam o input e mostravam um aviso — a interface
// oferecia uma operação que não concluía. Aqui se prova o consumidor: a lista
// não oferece os comandos sem implementação e os que sobram seguem
// selecionáveis, chegando ao handler.

function renderList(inputValue = '/') {
  const onSelectCommand = vi.fn();
  render(
    <SlashCommands
      inputValue={inputValue}
      isOpen
      onSelectCommand={onSelectCommand}
      onClose={vi.fn()}
    />
  );
  return onSelectCommand;
}

describe('lista de comandos de barra — R2-INB-021', () => {
  it('não oferece /note nem /tag', () => {
    renderList();

    expect(screen.queryByText('/note')).toBeNull();
    expect(screen.queryByText('/tag')).toBeNull();
  });

  it('os comandos que sobraram são selecionáveis e chegam ao consumidor', () => {
    const onSelectCommand = renderList();

    fireEvent.click(screen.getByText('/star'));
    expect(onSelectCommand).toHaveBeenCalledWith(expect.objectContaining({ id: 'star' }));

    fireEvent.click(screen.getByText('/resolve'));
    expect(onSelectCommand).toHaveBeenCalledWith(expect.objectContaining({ id: 'resolve' }));

    expect(screen.queryByText('/note')).toBeNull();
  });

  it('filtrar por "nota" não devolve comando sem implementação', () => {
    renderList('/nota');

    expect(screen.queryByText('/note')).toBeNull();
  });
});
