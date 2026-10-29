/**
 * Reação única por autor por mensagem — cartão t_fa2f142f (paridade V3 → V2).
 *
 * O defeito: `MessageReactions.handleReact` só comparava o emoji CLICADO. Com o autor já tendo
 * reagido com 👍, tocar em ❤️ chamava só `addReaction('❤️')` e a mensagem ficava com DUAS
 * reações do mesmo atendente (o mesmo vale para o `QuickReactionBar`).
 *
 * Como este teste prova: renderiza os componentes REAIS (jsdom) com o hook `useMessageReactions`
 * mockado, clica nos emojis como o atendente clica e lê a tela e as chamadas de gravação:
 * a antiga sai ANTES da nova entrar, tocar no mesmo emoji só remove, e a tela otimista volta ao
 * estado anterior quando a gravação falha (rollback).
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  reactions: [] as Array<Record<string, unknown>>,
  profileId: 'p1' as string | undefined,
}));

const mocks = vi.hoisted(() => ({
  addReaction: vi.fn(async () => undefined),
  removeReaction: vi.fn(async () => undefined),
}));

vi.mock('@/hooks/chat/useMessageReactions', () => ({
  useMessageReactions: () => ({
    reactions: state.reactions,
    addReaction: mocks.addReaction,
    removeReaction: mocks.removeReaction,
    hasReacted: (emoji: string) =>
      state.reactions.some((r) => r.user_id === state.profileId && r.emoji === emoji),
    currentProfileId: state.profileId,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover-content">{children}</div>
  ),
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
}));

vi.mock('framer-motion', () => {
  type MotionProps = Record<string, unknown> & { children?: React.ReactNode };
  const strip = ({
    whileHover: _whileHover,
    whileTap: _whileTap,
    initial: _initial,
    animate: _animate,
    transition: _transition,
    ...rest
  }: MotionProps) => rest;
  return {
    motion: {
      button: (props: MotionProps) => (
        <button {...(strip(props) as React.ButtonHTMLAttributes<HTMLButtonElement>)} />
      ),
      div: (props: MotionProps) => <div {...(strip(props) as React.HTMLAttributes<HTMLDivElement>)} />,
    },
  };
});

import { MessageReactions, QuickReactionBar } from '../MessageReactions';

function reacao(userId: string, emoji: string, nome: string) {
  return {
    id: `r-${userId}-${emoji}`,
    message_id: 'm-1',
    user_id: userId,
    contact_id: 'c-1',
    emoji,
    created_at: '2026-10-13T00:00:00.000Z',
    user_name: nome,
  };
}

function emojiDoPicker(emoji: string): HTMLButtonElement {
  const picker = screen.getByTestId('popover-content');
  const botao = Array.from(picker.querySelectorAll('button')).find((b) => b.textContent === emoji);
  if (!botao) throw new Error(`emoji ${emoji} ausente no seletor`);
  return botao;
}

function badges(container: HTMLElement) {
  return Array.from(container.querySelectorAll('[data-testid="reaction-badge"]'));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.addReaction.mockResolvedValue(undefined);
  mocks.removeReaction.mockResolvedValue(undefined);
  state.profileId = 'p1';
});

describe('MessageReactions — uma reação por autor', () => {
  it('trocar de emoji remove a antiga ANTES de gravar a nova', async () => {
    state.reactions = [reacao('p1', '👍', 'Ana'), reacao('p2', '❤️', 'Bia')];
    const { container } = render(<MessageReactions messageId="m-1" />);

    await act(async () => {
      fireEvent.click(emojiDoPicker('❤️'));
    });

    expect(mocks.removeReaction).toHaveBeenCalledWith('👍');
    expect(mocks.addReaction).toHaveBeenCalledWith('❤️');
    expect(mocks.removeReaction.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.addReaction.mock.invocationCallOrder[0],
    );

    // Tela otimista imediata: 👍 sai e ❤️ passa a ser minha, agregando as duas pessoas.
    const lista = badges(container);
    expect(lista.map((b) => b.getAttribute('data-emoji'))).toEqual(['❤️']);
    expect(lista[0].className).toContain('ring-primary/20');
    expect(lista[0].textContent).toContain('2');
  });

  it('tocar no mesmo emoji remove a reação, sem somar', async () => {
    state.reactions = [reacao('p1', '👍', 'Ana')];
    const { container } = render(<MessageReactions messageId="m-1" />);

    await act(async () => {
      fireEvent.click(emojiDoPicker('👍'));
    });

    expect(mocks.removeReaction).toHaveBeenCalledWith('👍');
    expect(mocks.addReaction).not.toHaveBeenCalled();
    expect(badges(container)).toHaveLength(0);
  });

  it('se a gravação falha, a tela volta ao emoji anterior (rollback)', async () => {
    state.reactions = [reacao('p1', '👍', 'Ana')];
    mocks.addReaction.mockRejectedValueOnce(new Error('falha ao gravar'));
    const { container } = render(<MessageReactions messageId="m-1" />);

    await act(async () => {
      fireEvent.click(emojiDoPicker('❤️'));
    });

    const lista = badges(container);
    expect(lista.map((b) => b.getAttribute('data-emoji'))).toEqual(['👍']);
    expect(lista[0].className).toContain('ring-primary/20');
  });
});

describe('QuickReactionBar — uma reação por autor', () => {
  it('trocar de emoji remove a antiga ANTES de gravar a nova', async () => {
    state.reactions = [reacao('p1', '👍', 'Ana')];
    const { container } = render(<QuickReactionBar messageId="m-1" />);

    const busca = (emoji: string) =>
      Array.from(container.querySelectorAll('[data-testid="quick-reaction-emoji"]')).find(
        (b) => b.getAttribute('data-emoji') === emoji,
      ) as HTMLButtonElement;

    await act(async () => {
      fireEvent.click(busca('😂'));
    });

    expect(mocks.removeReaction).toHaveBeenCalledWith('👍');
    expect(mocks.addReaction).toHaveBeenCalledWith('😂');
    expect(busca('😂').className).toContain('ring-primary/30');
    expect(busca('👍').className).not.toContain('ring-primary/30');
  });
});
