import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    const btn = screen.getByRole('button', { name: /inserir emoji/i });
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
      screen.getByRole('button', { name: /escolher reação/i }),
    ).toBeDefined();
    expect(
      screen.queryByRole('button', { name: /inserir emoji/i }),
    ).toBeNull();
  });

  it('o gatilho do QuickReactionPicker é um botão nativo chamado "Inserir emoji" (motion.button real)', () => {
    render(<QuickReactionPicker onReact={onReact} />);
    const btn = screen.getByRole('button', { name: /inserir emoji/i });
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
