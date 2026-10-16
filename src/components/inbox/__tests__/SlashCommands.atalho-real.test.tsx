/**
 * L8 (paridade V3→V2, doc 11) — o hover da lista de comandos não pode anunciar
 * atalho que não existe.
 *
 * A V2 mostrava `⌘{shortcut}` para todo comando, com uma letra que não dispara
 * nada. Agora o hover só mostra o atalho REAL (`shortcutLabel`): `/whisper`
 * exibe `Alt+W`, que é o atalho implementado e testado no compositor
 * (`useChatPanelHandlers.sussurro.test.tsx`). Os demais comandos mostram nada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SlashCommands } from '../SlashCommands';

// O jsdom não implementa `scrollIntoView`, que a lista usa só para manter o item
// selecionado visível. Sem o stub, montar a lista estoura antes de qualquer
// asserção — o alvo (o rótulo do atalho) não depende do scroll.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function montar(inputValue: string) {
  return render(
    <SlashCommands
      isOpen
      inputValue={inputValue}
      onSelectCommand={vi.fn()}
      onClose={vi.fn()}
    />,
  );
}

describe('SlashCommands — só o atalho real no hover (L8)', () => {
  it('/whisper aparece na lista e mostra o atalho real Alt+W', () => {
    montar('/whisper');

    expect(screen.getByText('Sussurro')).toBeInTheDocument();
    expect(screen.getByText('Alt+W').tagName).toBe('KBD');
  });

  it('comando sem atalho real não mostra nenhuma tecla (nada de ⌘X inventado)', () => {
    const { container } = montar('/transfer');

    // A lista tem um rodapé de navegação (↑↓); o que não pode existir é a tecla
    // do comando: nenhum <kbd> com o "⌘" que não dispara nada.
    const teclas = Array.from(container.querySelectorAll('kbd')).map((k) => k.textContent ?? '');
    expect(teclas.some((t) => t.includes('⌘'))).toBe(false);
  });
});
