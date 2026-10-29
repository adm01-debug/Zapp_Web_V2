/**
 * t_16e19364 — a tela vazia do Inbox ganha ação, números e a tecla certa.
 *
 * Cada item do aceite tem a sua prova aqui:
 *  1. "Nova conversa" dispara o callback que a `RealtimeInboxView` liga ao
 *     `setShowNewConversation` (o modal mora na view — o vazio só pede para abrir);
 *  2. os contadores são os NÚMEROS RECEBIDOS (12 aguardando / 3 não lidas), os
 *     mesmos que a `RealtimeInboxView` tira de `useInboxFilters().chipCounts`; a
 *     tela vazia não recalcula nem esconde o valor, inclusive quando é zero;
 *  3. sem o callback não existe botão morto (o render antigo segue válido);
 *  4. a dica de atalho mostra "⌘" no Mac e "Ctrl" no Windows/Linux;
 *  5. a entrada discreta só é aplicada quando o sistema permite movimento
 *     (`prefers-reduced-motion: reduce`);
 *  6. axe sem violação.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { InboxEmptyChat } from '@/components/inbox/InboxEmptyChat';

/** O jsdom não tem a plataforma real; o componente lê `navigator.platform`. */
function fingirPlataforma(plataforma: string) {
  Object.defineProperty(window.navigator, 'platform', { value: plataforma, configurable: true });
}

/** Substitui o stub global de `matchMedia` (src/test/setup.ts) pelo caso do teste. */
function fingirMovimentoReduzido(reduzido: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: reduzido && query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

afterEach(() => {
  fingirPlataforma('');
  fingirMovimentoReduzido(false);
});

describe('InboxEmptyChat — ação "Nova conversa"', () => {
  it('chama onNewConversation ao clique (é ele que abre o modal existente)', () => {
    const abrir = vi.fn();
    render(<InboxEmptyChat onNewConversation={abrir} />);

    fireEvent.click(screen.getByRole('button', { name: 'Nova conversa' }));

    expect(abrir).toHaveBeenCalledTimes(1);
  });

  it('sem o callback não renderiza botão morto', () => {
    render(<InboxEmptyChat />);

    expect(screen.queryByRole('button', { name: 'Nova conversa' })).toBeNull();
  });
});

describe('InboxEmptyChat — contadores reais', () => {
  it('mostra os números recebidos, como os chips da lista', () => {
    render(<InboxEmptyChat waitingCount={12} unreadCount={3} />);

    expect(screen.getByTestId('inbox-empty-waiting')).toHaveTextContent('12 aguardando');
    expect(screen.getByTestId('inbox-empty-unread')).toHaveTextContent('3 não lidas');
  });

  it('mostra zero quando a lista está vazia, sem sumir com o contador', () => {
    render(<InboxEmptyChat waitingCount={0} unreadCount={0} />);

    expect(screen.getByTestId('inbox-empty-waiting')).toHaveTextContent('0 aguardando');
    expect(screen.getByTestId('inbox-empty-unread')).toHaveTextContent('0 não lidas');
  });

  it('flexiona "não lida" no singular', () => {
    render(<InboxEmptyChat waitingCount={1} unreadCount={1} />);

    expect(screen.getByTestId('inbox-empty-unread')).toHaveTextContent('1 não lida');
    expect(screen.getByTestId('inbox-empty-unread')).not.toHaveTextContent('não lidas');
  });
});

describe('InboxEmptyChat — tecla do atalho por sistema', () => {
  it('no Mac a busca aparece com ⌘, nunca "Ctrl"', async () => {
    fingirPlataforma('MacIntel');
    render(<InboxEmptyChat />);

    const barra = screen.getByTestId('inbox-empty-shortcuts');
    await waitFor(() => expect(within(barra).getByText('⌘')).toBeInTheDocument());
    expect(within(barra).queryByText('Ctrl')).toBeNull();
  });

  it('fora do Mac a busca continua com "Ctrl"', async () => {
    fingirPlataforma('Win32');
    render(<InboxEmptyChat />);

    const barra = screen.getByTestId('inbox-empty-shortcuts');
    await waitFor(() => expect(within(barra).getByText('Ctrl')).toBeInTheDocument());
    expect(within(barra).queryByText('⌘')).toBeNull();
  });
});

describe('InboxEmptyChat — movimento', () => {
  it('com movimento permitido, a entrada discreta é aplicada', () => {
    fingirMovimentoReduzido(false);
    render(<InboxEmptyChat />);

    expect(screen.getByTestId('inbox-empty-actions').className).toContain(
      'motion-safe:animate-in',
    );
  });

  it('sob prefers-reduced-motion: reduce nada anima (nem em laço)', () => {
    fingirMovimentoReduzido(true);
    const { container } = render(<InboxEmptyChat />);

    expect(screen.getByTestId('inbox-empty-actions').className).not.toContain('animate-in');
    expect(container.innerHTML).not.toMatch(/infinite/i);
    expect(container.innerHTML).not.toMatch(/animate-(pulse|spin|bounce|ping)/);
  });
});

describe('InboxEmptyChat — acessibilidade', () => {
  it('axe sem violações na tela vazia com ação e contadores', async () => {
    const { container } = render(
      <InboxEmptyChat waitingCount={12} unreadCount={3} onNewConversation={() => {}} />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
