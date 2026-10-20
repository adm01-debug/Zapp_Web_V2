/**
 * U03 — chip "E-mail" da barra de abas do topo do chat.
 *
 * Prova (com o componente REAL, sem mock de valor):
 *  - a contagem aparece no chip e acima de 99 vira `99+` (o nome acessível mantém o valor real);
 *  - o nome acessível é `N e-mails não lidos` (singular/plural);
 *  - o clique entrega a ação (`onOpen`), que o pai liga ao link do C03;
 *  - a ligação em `ConversationTabs`: só monta com count > 0, some com 0, e NÃO é
 *    uma aba (a barra continua com as 8 abas contratadas).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { EmailUnreadChip } from '../EmailUnreadChip';
import { ConversationTabs } from '../ConversationTabs';
import type { ConversationTabCounts } from '@/hooks/chat/useConversationTabCounts';

const ZERO: ConversationTabCounts = { tasksOpen: 0, notesTotal: 0, filesTotal: 0 };

function renderChip(count: number) {
  const onOpen = vi.fn();
  render(<EmailUnreadChip count={count} onOpen={onOpen} />);
  return { onOpen };
}

describe('EmailUnreadChip', () => {
  it('mostra a contagem e o rótulo E-mail', () => {
    renderChip(3);
    expect(screen.getByTestId('email-unread-chip-count')).toHaveTextContent('3');
    expect(within(screen.getByTestId('email-unread-chip')).getByText('E-mail')).toBeInTheDocument();
  });

  it('acima de 99 mostra 99+ mas o nome acessível guarda o número real', () => {
    renderChip(120);
    const chip = screen.getByTestId('email-unread-chip');
    expect(screen.getByTestId('email-unread-chip-count')).toHaveTextContent('99+');
    expect(chip).toHaveAttribute('aria-label', '120 e-mails não lidos');
  });

  it('usa singular com 1 e-mail não lido', () => {
    renderChip(1);
    expect(screen.getByTestId('email-unread-chip')).toHaveAttribute('aria-label', '1 e-mail não lido');
  });

  it('o clique dispara a ação (abrir o e-mail do contato)', () => {
    const { onOpen } = renderChip(2);
    fireEvent.click(screen.getByTestId('email-unread-chip'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('a entrada é sutil e só com movimento permitido (motion-safe)', () => {
    renderChip(1);
    const classe = screen.getByTestId('email-unread-chip').getAttribute('class') ?? '';
    expect(classe).toContain('motion-safe:animate-in');
    expect(classe).toContain('motion-safe:fade-in-0');
    // nunca anima sem o prefixo (respeita prefers-reduced-motion)
    expect(classe.split(/\s+/)).not.toContain('animate-in');
  });
});

describe('ConversationTabs — ligação do chip de e-mail (U03)', () => {
  it('monta o chip quando há e-mails não lidos', () => {
    render(
      <ConversationTabs
        activeTab="chat"
        onTabChange={vi.fn()}
        counts={ZERO}
        emailUnread={{ count: 5, onOpen: vi.fn() }}
      />,
    );
    expect(screen.getByTestId('email-unread-chip')).toBeInTheDocument();
    expect(screen.getByTestId('email-unread-chip-count')).toHaveTextContent('5');
  });

  it('não monta o chip com count 0 (sem não lidos, sem alerta)', () => {
    render(
      <ConversationTabs
        activeTab="chat"
        onTabChange={vi.fn()}
        counts={ZERO}
        emailUnread={{ count: 0, onOpen: vi.fn() }}
      />,
    );
    expect(screen.queryByTestId('email-unread-chip')).not.toBeInTheDocument();
  });

  it('não monta o chip quando o canal de e-mail não é informado', () => {
    render(<ConversationTabs activeTab="chat" onTabChange={vi.fn()} counts={ZERO} />);
    expect(screen.queryByTestId('email-unread-chip')).not.toBeInTheDocument();
  });

  it('o chip é uma ação, não uma aba: a barra continua com as 8 abas', () => {
    render(
      <ConversationTabs
        activeTab="chat"
        onTabChange={vi.fn()}
        counts={ZERO}
        emailUnread={{ count: 2, onOpen: vi.fn() }}
      />,
    );
    expect(screen.getAllByRole('tab')).toHaveLength(8);
    // fora do tablist (mesma regra do trailingAction — a semântica de abas não muda)
    expect(within(screen.getByRole('tablist')).queryByTestId('email-unread-chip')).not.toBeInTheDocument();
  });
});
