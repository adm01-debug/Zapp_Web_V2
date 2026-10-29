import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { EmojiPicker, QuickReactionPicker } from '@/components/ui/emoji-picker';

// N-200 — o botão que abre o seletor de emoji tem nome acessível.
//
// Sem nenhum mock de 'framer-motion': o motion.button REAL renderiza um
// <button> nativo, e o getByRole abaixo só passa se o gatilho for mesmo um
// botão de verdade (um motion.div renderizaria <div>, sem papel de botão).
// A asserção extra no tagName fecha a outra direção: um <div role="button">
// passaria no getByRole mas falha no tagName.
const onSelect = vi.fn();
const onReact = vi.fn();

describe('EmojiPicker — botão que abre o seletor tem nome acessível', () => {
  it('o gatilho padrão do EmojiPicker é um botão nativo chamado "Inserir emoji"', () => {
    render(<EmojiPicker onEmojiSelect={onSelect} />);
    const btn = screen.getByRole('button', { name: 'Inserir emoji' });
    expect(btn.tagName).toBe('BUTTON');
  });

  it('o trigger customizado do EmojiPicker mantém o próprio nome (asChild não injeta o padrão)', () => {
    render(
      <EmojiPicker
        onEmojiSelect={onSelect}
        trigger={<button aria-label="Escolher reação">😀</button>}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Escolher reação' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Inserir emoji' }),
    ).toBeNull();
  });

  it('o gatilho do QuickReactionPicker é um botão nativo chamado "Inserir emoji" (motion.button real)', () => {
    render(<QuickReactionPicker onReact={onReact} />);
    const btn = screen.getByRole('button', { name: 'Inserir emoji' });
    expect(btn.tagName).toBe('BUTTON');
  });

  it('as reações rápidas são botões nativos (motion.button real, não div)', () => {
    render(<QuickReactionPicker onReact={onReact} />);
    const like = screen.getByRole('button', { name: '👍' });
    expect(like.tagName).toBe('BUTTON');
  });

  // jsdom não tem layout: contraste fica fora (mesmo padrão dos *.a11y do
  // repo); o alvo aqui é estrutural — botão sem nome (regra button-name).
  // O <main> contém o fragmento para a regra `region` não mascarar o alvo.
  it('axe: gatilho padrão do EmojiPicker sem violações', async () => {
    const { container } = render(
      <main>
        <EmojiPicker onEmojiSelect={onSelect} />
      </main>,
    );
    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });

  it('axe: gatilho do QuickReactionPicker sem violações', async () => {
    const { container } = render(
      <main>
        <QuickReactionPicker onReact={onReact} />
      </main>,
    );
    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });
});

// localStorage indisponível (modo privado / cota cheia)
//
// O defeito: `handleSelect` entregava o emoji e SÓ DEPOIS escrevia no
// localStorage SEM try/catch. A exceção subia antes de `setIsOpen(false)` e o
// picker ficava aberto por baixo do erro. O teste abaixo dispara a exceção de
// verdade (spy em Storage.prototype.setItem) e exige as DUAS coisas: emoji
// entregue e picker fechado.
describe('EmojiPicker — localStorage indisponível', () => {
  it('entrega o emoji e fecha o picker mesmo quando a escrita no localStorage lança', () => {
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
    const entregues: string[] = [];
    try {
      render(<EmojiPicker onEmojiSelect={(e) => entregues.push(e)} />);

      fireEvent.click(screen.getByRole('button', { name: 'Inserir emoji' }));
      fireEvent.click(screen.getByRole('button', { name: '😀' }));

      expect(entregues).toEqual(['😀']);
      // Fechado = o conteúdo do popover (o campo de busca) sai da tela.
      expect(screen.queryByPlaceholderText(/Buscar emoji/)).toBeNull();
    } finally {
      setItem.mockRestore();
    }
  });

  it('monta com recentes vazios quando a leitura do localStorage lança', () => {
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('SecurityError');
      });
    try {
      render(<EmojiPicker onEmojiSelect={onSelect} />);
      fireEvent.click(screen.getByRole('button', { name: 'Inserir emoji' }));
      // Abre normalmente, sem "Recentes" (a leitura falha virou lista vazia).
      expect(screen.getByPlaceholderText(/Buscar emoji/)).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Recentes' }),
      ).toBeNull();
    } finally {
      getItem.mockRestore();
    }
  });

  it('as categorias têm nome acessível em pt-BR e marcam a ativa com aria-pressed', () => {
    render(<EmojiPicker onEmojiSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Inserir emoji' }));

    const rostos = screen.getByRole('button', { name: 'Rostos' });
    expect(rostos.tagName).toBe('BUTTON');
    expect(rostos).toHaveAttribute('type', 'button');
    expect(rostos).toHaveAttribute('aria-pressed', 'true');

    const comidas = screen.getByRole('button', { name: 'Comida' });
    expect(comidas).toHaveAttribute('aria-pressed', 'false');
  });
});
