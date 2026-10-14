/**
 * RD-071 — Ficha completa do contato: casca da janela.
 *
 * A ficha do contato deixou de ser um painel lateral de 380 px (`fixed right-0`)
 * e virou a janela centralizada do design
 * (`docs/design/contatos-redesign-2026-10-12/`, `.zc-dialog`): até 1050 px,
 * raio 17 px, cabeçalho com ícone + contexto "Contatos / Ficha completa" e os
 * controles Anterior / Próximo / Fechar; no celular ocupa a tela inteira.
 *
 * O que se prova aqui é COMPORTAMENTO (a casca é real, o `Dialog` do sistema):
 *  - abre com `role="dialog"` e o contexto no título acessível;
 *  - `Esc` e o botão Fechar fecham a ficha;
 *  - Anterior/Próximo chamam o handler quando ligados e ficam desabilitados
 *    quando não há handler (RD-078 é quem liga à lista) — nunca clique morto;
 *  - ao fechar, o foco volta ao elemento que abriu (card/linha de Contatos);
 *  - o conteúdo atual (ações, informações, atividade, timeline, notas, compras
 *    e produtos enviados) continua dentro da nova casca.
 *
 * As classes responsivas (celular = tela cheia) são a única prova possível no
 * jsdom, que não aplica media query/Tailwind: aqui não há layout para medir.
 * Filhos que falam direto com a rede viram stubs, como no resto desta pasta.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useState, type ReactNode } from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContactDetailPanel } from '../ContactDetailPanel';

vi.mock('@/services/contact.service', () => ({
  ContactService: {
    fetchStats: vi.fn().mockResolvedValue({
      totalMessages: 3, avgResponseTimeMinutes: 0, totalConversations: 0,
      messagesChangePercent: null, conversationsChangePercent: null,
      csatAverage: null, csatCount: 0,
    }),
    getLastMessageDates: vi.fn().mockResolvedValue({ data: [], error: null }),
  },
}));

vi.mock('../ContactActivityTimeline', () => ({ ContactActivityTimeline: () => <div data-testid="timeline" /> }));
vi.mock('../ContactNotes', () => ({ ContactNotes: () => <div data-testid="notes" /> }));
vi.mock('../ContactPurchaseHistory', () => ({ ContactPurchaseHistory: () => <div data-testid="purchases" /> }));
vi.mock('../ContactEngagementScore', () => ({ ContactEngagementScore: () => <div data-testid="score" /> }));
vi.mock('@/hooks/integrations/useCatalogSendHistory', () => ({
  useCatalogSendHistory: () => ({ rows: [], isLoading: false, error: null }),
}));
vi.mock('@/components/catalog/ExternalProductCatalog', () => ({
  ExternalProductCatalog: ({ trigger }: { trigger?: ReactNode }) => <div>{trigger}</div>,
}));

const CONTACT = {
  id: 'c1',
  name: 'Maria Silva',
  phone: '5541999990000',
  created_at: '2026-01-01T00:00:00Z',
};

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPanel(props: Partial<Parameters<typeof ContactDetailPanel>[0]> = {}) {
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={newClient()}>
      <ContactDetailPanel
        contact={CONTACT}
        onClose={onClose}
        onOpenChat={vi.fn()}
        onEdit={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onClose };
}

/** Reproduz a tela de Contatos: a ficha só monta depois do clique no card. */
function Harness({ onPrev, onNext }: { onPrev?: () => void; onNext?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <QueryClientProvider client={newClient()}>
      <button type="button" onClick={() => setOpen(true)}>Abrir ficha</button>
      {open && (
        <ContactDetailPanel
          contact={CONTACT}
          onClose={() => setOpen(false)}
          onOpenChat={() => {}}
          onEdit={() => {}}
          onPrev={onPrev}
          onNext={onNext}
        />
      )}
    </QueryClientProvider>
  );
}

afterEach(() => cleanup());

describe('RD-071 — casca da janela da ficha do contato', () => {
  it('abre como janela centralizada de até 1050 px, com contexto e controles', () => {
    renderPanel();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.className).toContain('max-w-[1050px]');
    expect(dialog.className).toContain('sm:rounded-[17px]');
    expect(dialog.className).toContain('shadow-elev-4');
    // O painel lateral antigo era `fixed right-0 ... w-[380px]`.
    expect(dialog.className).not.toContain('right-0');
    expect(dialog.className).not.toContain('w-[380px]');

    // O contexto do cabeçalho é o título acessível da janela.
    expect(screen.getByText('Contatos / Ficha completa')).toBeInTheDocument();
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)?.textContent).toContain('Contatos / Ficha completa');

    expect(screen.getByRole('button', { name: 'Fechar ficha' })).toBeEnabled();
  });

  it('no celular ocupa a tela inteira', () => {
    renderPanel();
    const dialog = screen.getByRole('dialog');

    // Sem variante `max-sm:` a janela continuaria centrada/deslocada como no
    // desktop — em telas < 640 px ela passa a ocupar a viewport toda.
    for (const cls of [
      'max-sm:h-[100dvh]',
      'max-sm:max-h-[100dvh]',
      'max-sm:max-w-none',
      'max-sm:left-0',
      'max-sm:top-0',
      'max-sm:translate-x-0',
      'max-sm:translate-y-0',
      'max-sm:rounded-none',
    ]) {
      expect(dialog.className).toContain(cls);
    }
  });

  it('Esc fecha a ficha', () => {
    const { onClose } = renderPanel();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('o botão Fechar fecha a ficha', () => {
    const { onClose } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar ficha' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Anterior/Próximo chamam o handler quando ligados', () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    renderPanel({ onPrev, onNext });

    const anterior = screen.getByRole('button', { name: 'Ver contato anterior' });
    const proximo = screen.getByRole('button', { name: 'Ver próximo contato' });
    expect(anterior).toBeEnabled();
    expect(proximo).toBeEnabled();

    fireEvent.click(anterior);
    fireEvent.click(proximo);
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('sem handler de navegação, Anterior/Próximo ficam desabilitados', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Ver contato anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ver próximo contato' })).toBeDisabled();
  });

  it('ao fechar, o foco volta ao elemento que abriu a ficha', async () => {
    render(<Harness />);

    const abrir = screen.getByRole('button', { name: 'Abrir ficha' });
    abrir.focus();
    fireEvent.click(abrir);

    const fechar = await screen.findByRole('button', { name: 'Fechar ficha' });
    fireEvent.click(fechar);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(abrir));
  });

  it('mantém todo o conteúdo atual dentro da nova casca', () => {
    renderPanel();

    expect(screen.getByRole('button', { name: /Conversar/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Editar/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enviar produto/ })).toBeInTheDocument();
    expect(screen.getByText('Informações')).toBeInTheDocument();
    expect(screen.getByText('Atividade')).toBeInTheDocument();
    expect(screen.getByTestId('timeline')).toBeInTheDocument();
    expect(screen.getByTestId('notes')).toBeInTheDocument();
    expect(screen.getByTestId('purchases')).toBeInTheDocument();
    expect(screen.getByTestId('send-history-empty')).toBeInTheDocument();
  });
});
