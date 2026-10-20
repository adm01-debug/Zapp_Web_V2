/**
 * Tamanho do texto do chat escolhido pelo usuário e lembrado (aba Aparência).
 *
 * Prova de comportamento, sem mock do componente: renderiza o `ChatTextSize` REAL,
 * clica nos níveis, lê a variável `--chat-font-size` que o <html> recebe e o que ficou
 * no localStorage; remonta o componente para provar que a escolha permanece; e cobre
 * o caso de localStorage indisponível (modo privado) para o controle não morrer.
 *
 * O último bloco prova o BOOT: `aplicarTamanhoDoChatSalvo()` (chamada em src/main.tsx)
 * aplica a escolha lembrada no <html> sem montar o `ChatTextSize` — é o que faz a
 * escolha valer no chat sem o usuário abrir a aba Aparência nesta sessão.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ChatTextSize } from '../ChatTextSize';
import { aplicarTamanhoDoChatSalvo } from '../useChatTextSize';

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

  it('montar o controle NÃO sobrescreve um valor salvo válido (o lembrete é da escolha)', () => {
    localStorage.setItem(CHAVE, 'grande');
    render(<ChatTextSize />);
    expect(localStorage.getItem(CHAVE)).toBe('grande');
  });
});

describe('aplicarTamanhoDoChatSalvo — o boot aplica a escolha lembrada', () => {
  it('com "enorme" salvo escreve 20px no <html> SEM montar o ChatTextSize', () => {
    localStorage.setItem(CHAVE, 'enorme');

    aplicarTamanhoDoChatSalvo();

    expect(tamanhoNoHtml()).toBe('20px');
    // nada de tela foi montado: o DOM segue sem o grupo de rádio do controle
    expect(document.querySelector('[role="radiogroup"]')).toBeNull();
  });

  it('sem nada salvo escreve o padrão (14px, o mesmo `text-sm` de antes)', () => {
    aplicarTamanhoDoChatSalvo();
    expect(tamanhoNoHtml()).toBe('14px');
  });

  it('valor corrompido cai no padrão e não quebra o boot', () => {
    localStorage.setItem(CHAVE, 'gigante');
    aplicarTamanhoDoChatSalvo();
    expect(tamanhoNoHtml()).toBe('14px');
  });

  it('storage indisponível não quebra o boot (modo privado)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage bloqueado');
    });
    expect(() => aplicarTamanhoDoChatSalvo()).not.toThrow();
    expect(tamanhoNoHtml()).toBe('14px');
  });
});
