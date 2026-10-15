/**
 * RD-071 (refazer 1) — a ficha abre a partir das listas e vira janela.
 *
 * A recusa apontou que o acionador que abre a ficha era uma `div` com
 * `onClick` (fora da ordem de tabulação) e que o teste anterior montava só
 * a janela isolada. Aqui a árvore é real: item da lista + card da grade →
 * `ContactDetailPanel` → `Dialog` do sistema. O que se prova:
 *  - os acionadores entram na ordem de tabulação (`tabindex="0"`);
 *  - `Enter`/`Espaço` com o acionador focado abre a ficha;
 *  - o foco entra na janela e os controles seguem a ordem
 *    anterior → próximo → fechar;
 *  - ao fechar, o foco volta ao acionador que abriu;
 *  - tecla dentro de controle aninhado (checkbox) não reabre a ficha.
 *
 * Sem a correção (acionador `div` sem `tabindex`/teclado) o primeiro teste
 * já quebra: não há `button` acessível para achar.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useState, type ReactNode } from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContactListItem } from '../ContactListItem';
import { ContactCard } from '../ContactCard';
import { ContactKanbanView } from '../ContactKanbanView';
import { ContactsTable } from '../ContactsTable';
import { ContactDetailPanel } from '../ContactDetailPanel';
import { baseContact, noop } from './contactDeleteFixtures';

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

const ANA = baseContact();
const BRUNO = baseContact({ id: '30000000-0000-0000-0000-000000000002', name: 'Bruno Lima' });

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/** Reproduz a tela de Contatos: lista + grade reais, a ficha monta ao abrir. */
function Harness() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = [ANA, BRUNO].find((c) => c.id === selectedId) ?? null;
  return (
    <QueryClientProvider client={newClient()}>
      <ContactListItem
        contact={ANA}
        isSelected={false}
        onToggleSelect={noop}
        onOpenDetails={setSelectedId}
        onOpenChat={noop}
        onEdit={noop}
        onDelete={noop}
        index={0}
      />
      <ContactCard
        contact={BRUNO}
        isSelected={false}
        onToggleSelect={noop}
        onOpenDetails={setSelectedId}
        onOpenChat={noop}
        onEdit={noop}
        onDelete={noop}
        index={1}
      />
      {selected && (
        <ContactDetailPanel
          contact={selected}
          onClose={() => setSelectedId(null)}
          onOpenChat={noop}
          onEdit={noop}
        />
      )}
    </QueryClientProvider>
  );
}

afterEach(() => cleanup());

describe('RD-071 — da lista à janela: acionador focável e ordem de tabulação', () => {
  it('os acionadores da lista e da grade entram na ordem de tabulação', () => {
    render(<Harness />);

    const linha = screen.getByRole('button', { name: 'Abrir ficha de Ana Souza' });
    const card = screen.getByRole('button', { name: 'Abrir ficha de Bruno Lima' });
    expect(linha).toHaveAttribute('tabindex', '0');
    expect(card).toHaveAttribute('tabindex', '0');

    linha.focus();
    expect(document.activeElement).toBe(linha);
    card.focus();
    expect(document.activeElement).toBe(card);
  });

  it('Enter no acionador da lista abre a ficha e o foco entra na janela', async () => {
    render(<Harness />);

    const linha = screen.getByRole('button', { name: 'Abrir ficha de Ana Souza' });
    linha.focus();
    fireEvent.keyDown(linha, { key: 'Enter' });

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  });

  it('Espaço no acionador da grade abre a ficha', async () => {
    render(<Harness />);

    const card = screen.getByRole('button', { name: 'Abrir ficha de Bruno Lima' });
    card.focus();
    fireEvent.keyDown(card, { key: ' ' });

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Contatos / Ficha completa')).toBeInTheDocument();
  });

  it('os controles da janela seguem a ordem anterior → próximo → fechar', async () => {
    render(<Harness />);

    const linha = screen.getByRole('button', { name: 'Abrir ficha de Ana Souza' });
    linha.focus();
    fireEvent.keyDown(linha, { key: 'Enter' });
    await screen.findByRole('dialog');

    const ordem = ['Ver contato anterior', 'Ver próximo contato', 'Fechar ficha'].map(
      (name) => screen.getByRole('button', { name }),
    );
    for (let i = 0; i < ordem.length - 1; i += 1) {
      expect(ordem[i].compareDocumentPosition(ordem[i + 1])).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }
  });

  it('ao fechar, o foco volta ao acionador que abriu a ficha', async () => {
    render(<Harness />);

    const linha = screen.getByRole('button', { name: 'Abrir ficha de Ana Souza' });
    linha.focus();
    fireEvent.keyDown(linha, { key: 'Enter' });

    const fechar = await screen.findByRole('button', { name: 'Fechar ficha' });
    fireEvent.click(fechar);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(linha));
  });

  it('tecla dentro de controle aninhado não abre a ficha', () => {
    render(<Harness />);

    const checkbox = screen.getByRole('checkbox', { name: 'Selecionar Ana Souza' });
    checkbox.focus();
    fireEvent.keyDown(checkbox, { key: ' ' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Enter na linha da tabela abre a ficha (a linha continua sendo row)', async () => {
    function TableHarness() {
      const [selectedId, setSelectedId] = useState<string | null>(null);
      const selected = selectedId === ANA.id ? ANA : null;
      return (
        <QueryClientProvider client={newClient()}>
          <ContactsTable
            contacts={[ANA]}
            selectedIds={[]}
            onSelectIds={noop}
            onOpenDetails={setSelectedId}
            onOpenChat={noop}
            onEdit={noop}
            onDelete={noop}
          />
          {selected && (
            <ContactDetailPanel
              contact={selected}
              onClose={() => setSelectedId(null)}
              onOpenChat={noop}
              onEdit={noop}
            />
          )}
        </QueryClientProvider>
      );
    }
    render(<TableHarness />);

    const row = screen.getByRole('row', { name: /Ana Souza/ });
    expect(row).toHaveAttribute('tabindex', '0');
    row.focus();
    fireEvent.keyDown(row, { key: 'Enter' });

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('Enter no card do kanban abre a ficha', async () => {
    function KanbanHarness() {
      const [selectedId, setSelectedId] = useState<string | null>(null);
      const selected = selectedId === BRUNO.id ? BRUNO : null;
      return (
        <QueryClientProvider client={newClient()}>
          <ContactKanbanView contacts={[BRUNO]} onContactClick={setSelectedId} />
          {selected && (
            <ContactDetailPanel
              contact={selected}
              onClose={() => setSelectedId(null)}
              onOpenChat={noop}
              onEdit={noop}
            />
          )}
        </QueryClientProvider>
      );
    }
    render(<KanbanHarness />);

    const card = screen.getByRole('button', { name: 'Abrir ficha de Bruno Lima' });
    card.focus();
    fireEvent.keyDown(card, { key: 'Enter' });

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });
});
