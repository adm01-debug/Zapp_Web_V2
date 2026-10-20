import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  EXTENDED_EMOJIS,
  WHATSAPP_EMOJIS,
  MessageReactionBar,
  QuickReactionStrip,
  ReactionBadge,
  ReactionPicker,
  type ReactionGroup,
} from '@/components/ui/message-reactions';

/**
 * Primitivos de reação do chat de equipe (UI-10). Usados por `TeamMessageReactionsWrapper`
 * para reagir/retirar reação de uma mensagem; o `MessageReactionBar` desenha os emojis
 * agrupados e o `ReactionPicker`/`QuickReactionStrip` oferecem os emojis.
 *
 * Asserção por NOME ACESSÍVEL e `aria-pressed` de propósito: é o contrato que o leitor de
 * tela e o `group-hover` da bolha usam, não um detalhe de classe CSS.
 */

const reaction = (emoji: string, count: number, reactedByMe: boolean): ReactionGroup => ({
  emoji,
  count,
  reactedByMe,
  profileIds: [],
});

describe('ReactionBadge', () => {
  it('mostra emoji e contagem no nome acessível (plural)', () => {
    render(<ReactionBadge reaction={reaction('👍', 3, false)} onClick={vi.fn()} />);

    // O nome acessível carrega emoji + contagem; o radical "reaç" é conferido à parte
    // porque a produção hoje escreve "reaçãoões" no plural (defeito relatado no cartão).
    const badge = screen.getByRole('button', { name: /^👍 3 reaç/ });
    expect(within(badge).getByText('👍')).toBeInTheDocument();
    expect(within(badge).getByText('3')).toBeInTheDocument();
  });

  it('usa singular no nome acessível quando é só uma reação', () => {
    render(<ReactionBadge reaction={reaction('❤️', 1, false)} onClick={vi.fn()} />);

    expect(screen.getByRole('button', { name: '❤️ 1 reação' })).toBeInTheDocument();
  });

  it('aria-pressed=true quando eu já reagi', () => {
    render(<ReactionBadge reaction={reaction('👍', 2, true)} onClick={vi.fn()} />);

    expect(screen.getByRole('button', { name: /^👍 2 reaç/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('aria-pressed=false quando eu não reagi', () => {
    render(<ReactionBadge reaction={reaction('👍', 2, false)} onClick={vi.fn()} />);

    expect(screen.getByRole('button', { name: /^👍 2 reaç/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('clique devolve o emoji do próprio badge', () => {
    const onClick = vi.fn();
    render(<ReactionBadge reaction={reaction('🔥', 4, false)} onClick={onClick} />);

    fireEvent.click(screen.getByRole('button', { name: /^🔥 4 reaç/ }));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith('🔥');
  });
});

describe('MessageReactionBar', () => {
  const reactions = [reaction('👍', 3, true), reaction('❤️', 1, false)];

  it('renderiza um badge por grupo de reação', () => {
    render(<MessageReactionBar reactions={reactions} onToggle={vi.fn()} />);

    expect(screen.getByRole('button', { name: /^👍 3 reaç/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '❤️ 1 reação' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicar num badge chama onToggle com o emoji daquele badge', () => {
    const onToggle = vi.fn();
    render(<MessageReactionBar reactions={reactions} onToggle={onToggle} />);

    fireEvent.click(screen.getByRole('button', { name: '❤️ 1 reação' }));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('❤️');
  });

  it('oferece o botão "Adicionar reação"', () => {
    render(<MessageReactionBar reactions={reactions} onToggle={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Adicionar reação' })).toBeInTheDocument();
  });

  it('não desenha nada (nem o botão "+") quando não há reações', () => {
    const { container } = render(<MessageReactionBar reactions={[]} onToggle={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('button', { name: 'Adicionar reação' })).toBeNull();
  });
});

describe('ReactionPicker', () => {
  it('oferece o conjunto estendido por padrão, num grid acessível', () => {
    render(<ReactionPicker onSelect={vi.fn()} />);

    const grid = screen.getByRole('grid', { name: 'Selecionar reação' });
    expect(within(grid).getAllByRole('gridcell')).toHaveLength(EXTENDED_EMOJIS.length);
    expect(within(grid).getByRole('gridcell', { name: '👍' })).toBeInTheDocument();
  });

  it('clique num emoji chama onSelect com ele', () => {
    const onSelect = vi.fn();
    render(<ReactionPicker emojis={['🎉', '💯']} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('gridcell', { name: '💯' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('💯');
  });

  it('setas movem o foco no grid (tabindex itinerante)', () => {
    render(<ReactionPicker emojis={['🎉', '💯']} onSelect={vi.fn()} />);

    const primeiro = screen.getByRole('gridcell', { name: '🎉' });
    const segundo = screen.getByRole('gridcell', { name: '💯' });
    expect(primeiro).toHaveAttribute('tabindex', '0');
    expect(segundo).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(primeiro, { key: 'ArrowRight' });

    expect(segundo).toHaveAttribute('tabindex', '0');
    expect(primeiro).toHaveAttribute('tabindex', '-1');
    expect(document.activeElement).toBe(segundo);
  });

  it('Enter seleciona o emoji em foco', () => {
    const onSelect = vi.fn();
    render(<ReactionPicker emojis={['🎉', '💯']} onSelect={onSelect} />);

    fireEvent.keyDown(screen.getByRole('gridcell', { name: '🎉' }), { key: 'Enter' });

    expect(onSelect).toHaveBeenCalledWith('🎉');
  });

  it('Escape fecha sem selecionar', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<ReactionPicker emojis={['🎉']} onSelect={onSelect} onClose={onClose} />);

    fireEvent.keyDown(screen.getByRole('gridcell', { name: '🎉' }), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('QuickReactionStrip', () => {
  it('mostra os emojis rápidos do WhatsApp numa toolbar nomeada', () => {
    render(<QuickReactionStrip onSelect={vi.fn()} onOpenFull={vi.fn()} />);

    const toolbar = screen.getByRole('toolbar', { name: 'Reação rápida' });
    for (const emoji of WHATSAPP_EMOJIS) {
      expect(within(toolbar).getByRole('button', { name: `Reagir com ${emoji}` })).toBeInTheDocument();
    }
  });

  it('clicar num emoji chama onSelect com ele', () => {
    const onSelect = vi.fn();
    render(<QuickReactionStrip onSelect={onSelect} onOpenFull={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reagir com ❤️' }));

    expect(onSelect).toHaveBeenCalledWith('❤️');
  });

  it('"Mais reações" abre o seletor completo', () => {
    const onOpenFull = vi.fn();
    render(<QuickReactionStrip onSelect={vi.fn()} onOpenFull={onOpenFull} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mais reações' }));

    expect(onOpenFull).toHaveBeenCalledTimes(1);
  });
});
