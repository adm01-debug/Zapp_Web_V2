/**
 * Tamanho do texto do chat escolhido pelo usuário e lembrado (aba Aparência).
 *
 * Prova de comportamento, sem mock do componente: renderiza o `ChatTextSize` REAL,
 * clica nos níveis, lê a variável `--chat-font-size` que o <html> recebe e o que ficou
 * no localStorage; remonta o componente para provar que a escolha permanece; e cobre
 * o caso de localStorage indisponível (modo privado) para o controle não morrer.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ChatTextSize } from '../ChatTextSize';

const VAR = '--chat-font-size';
const CHAVE = 'ui-chat-text-size';

function tamanhoNoHtml() {
  return document.documentElement.style.getPropertyValue(VAR);
}

afterEach(() => {
  cleanup();
  document.documentElement.style.removeProperty(VAR);
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('ChatTextSize — escolha do tamanho do texto do chat', () => {
  it('começa no padrão e escreve 14px no <html>', () => {
    render(<ChatTextSize />);
    expect(screen.getByRole('radio', { name: 'Padrão' })).toBeChecked();
    expect(tamanhoNoHtml()).toBe('14px');
  });

  it('escolher um nível muda a variável lida pelas bolhas', () => {
    render(<ChatTextSize />);
    fireEvent.click(screen.getByRole('radio', { name: 'Grande' }));

    expect(screen.getByRole('radio', { name: 'Grande' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Padrão' })).not.toBeChecked();
    expect(tamanhoNoHtml()).toBe('16px');
    expect(localStorage.getItem(CHAVE)).toBe('grande');
  });

  it('a escolha permanece: remontar parte do nível lembrado', () => {
    const primeira = render(<ChatTextSize />);
    fireEvent.click(screen.getByRole('radio', { name: 'Enorme' }));
    expect(tamanhoNoHtml()).toBe('20px');
    primeira.unmount();

    document.documentElement.style.removeProperty(VAR);
    render(<ChatTextSize />);

    expect(screen.getByRole('radio', { name: 'Enorme' })).toBeChecked();
    expect(tamanhoNoHtml()).toBe('20px');
  });

  it('a pré-visualização usa a MESMA classe lida pela variável', () => {
    render(<ChatTextSize />);
    const preview = screen.getByTestId('chat-text-size-preview');
    expect(preview.querySelector('.chat-message-text')).not.toBeNull();
  });

  it('níveis são um grupo de rádio com nome acessível', () => {
    render(<ChatTextSize />);
    expect(screen.getByRole('radiogroup', { name: 'Tamanho do texto do chat' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(5);
  });

  it('localStorage indisponível não quebra o controle nem o valor lembrado', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage bloqueado');
    });

    render(<ChatTextSize />);
    expect(screen.getByRole('radio', { name: 'Padrão' })).toBeChecked();
    expect(tamanhoNoHtml()).toBe('14px');

    fireEvent.click(screen.getByRole('radio', { name: 'Maior' }));
    expect(screen.getByRole('radio', { name: 'Maior' })).toBeChecked();
    expect(tamanhoNoHtml()).toBe('18px');
  });

  it('valor salvo corrompido cai no padrão', () => {
    localStorage.setItem(CHAVE, 'gigante');
    render(<ChatTextSize />);
    expect(screen.getByRole('radio', { name: 'Padrão' })).toBeChecked();
  });
});
