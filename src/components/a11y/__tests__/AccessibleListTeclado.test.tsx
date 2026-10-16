// PADRÃO DE TESTE DE TECLADO — ADR-011 (docs/adr/ADR-011-testes-de-teclado-user-event.md)
//
// Teclado que o jsdom NÃO simula (Tab movendo o foco, Enter/Space clicando o
// elemento focado, setas num roving tabindex) se escreve com
// `@testing-library/user-event` (via `userEvent.setup()`), NUNCA com
// `fireEvent.keyDown` — o `fireEvent` entrega o evento mas não move o foco nem
// aciona o elemento, então um teste de teclado escrito assim passa mesmo com o
// alvo quebrado (é o "teste que não prova" que o revisor recusa).
//
// Este arquivo é o exemplo vivo do padrão: exercita o `AccessibleList` real
// (`src/components/a11y/a11yComponents.tsx` + `useRovingTabindex`), que só
// responde a teclado.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccessibleList } from '@/components/a11y/a11yComponents';

function renderLista(onSelect = vi.fn()) {
  render(
    <AccessibleList
      items={['Alpha', 'Beta', 'Gama']}
      label="Filtros salvos"
      renderItem={(item) => <span>{item}</span>}
      onSelect={onSelect}
    />,
  );
  return { onSelect, options: screen.getAllByRole('option') };
}

describe('AccessibleList — teclado com user-event (padrão ADR-011)', () => {
  it('Tab entra na lista e as setas movem o foco entre os itens', async () => {
    const user = userEvent.setup();
    const { options } = renderLista();

    // Roving tabindex: só o item focado é tabulável
    expect(options[0]).toHaveAttribute('tabindex', '0');
    expect(options[1]).toHaveAttribute('tabindex', '-1');

    await user.tab();

    // Sem user-event o jsdom não move o foco com Tab: este é o teclado-objeto do teste
    expect(options[0]).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(options[1]).toHaveFocus();
    expect(options[0]).toHaveAttribute('tabindex', '-1');
    expect(options[1]).toHaveAttribute('tabindex', '0');
  });

  it('Home e End saltam para o primeiro e o último item', async () => {
    const user = userEvent.setup();
    const { options } = renderLista();

    await user.tab();
    await user.keyboard('{End}');
    expect(options[2]).toHaveFocus();

    await user.keyboard('{Home}');
    expect(options[0]).toHaveFocus();
  });

  it('a seta para cima no primeiro item dá a volta para o último', async () => {
    const user = userEvent.setup();
    const { options } = renderLista();

    await user.tab();
    await user.keyboard('{ArrowUp}');
    expect(options[2]).toHaveFocus();
  });

  it('Enter e Space selecionam o item que está com o foco', async () => {
    const user = userEvent.setup();
    const { onSelect, options } = renderLista();

    await user.tab();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onSelect).toHaveBeenCalledWith('Beta', 1);

    onSelect.mockClear();
    await user.keyboard('{ArrowDown} ');
    expect(onSelect).toHaveBeenCalledWith('Gama', 2);
    expect(options[2]).toHaveFocus();
  });
});
