/**
 * ContactChangeHistory — a seção "Histórico" da ficha do contato.
 *
 * O cartão pede que quem vê o contato veja QUEM alterou, QUANDO e QUAIS campos,
 * com estado vazio próprio e estado de erro próprio. A prova aqui:
 *
 *  A) COMPONENTE REAL (e o hook REAL): o mock fica na BORDA de dados
 *     (`@/integrations/supabase/client`), não no hook — o mesmo padrão de
 *     `src/hooks/crm/__tests__/useContactChangeLog.test.tsx`, que já prova a
 *     tradução dos campos e a resolução do ator. Assim a tela é exercitada
 *     ponta a ponta: linha do banco → hook → o que aparece no painel.
 *  B) VAZIO ≠ CARREGANDO: sem alteração a tela diz "Nenhuma alteração
 *     registrada", não um esqueleto eterno.
 *  C) ERRO: mensagem própria + botão "Tentar novamente" que refaz a leitura
 *     (elemento `<button>` nativo, alcançável por teclado).
 *  D) MONTAGEM: o painel REAL (`ContactDetailPanel`) renderiza a seção — a
 *     trilha não fica só no arquivo do componente.
 *
 * Dados sintéticos: sem nome, telefone ou e-mail reais.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { axe } from 'vitest-axe';

const h = vi.hoisted(() => {
  const state = {
    mode: 'ok' as 'ok' | 'empty' | 'error',
    rows: [] as Array<Record<string, unknown>>,
    profiles: [] as Array<{ id: string; name: string | null }>,
    /** Quantas vezes o PostgREST de `contact_change_log` foi consultado. */
    logReads: 0,
  };

  function builder(table: string) {
    let from: number | null = null;
    let to: number | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = {
      select: () => q,
      eq: () => q,
      in: () => q,
      order: () => q,
      range: (f: number, t: number) => {
        from = f;
        to = t;
        return q;
      },
      then: (resolve: (value: unknown) => unknown) => {
        if (table === 'profiles') {
          return Promise.resolve(resolve({ data: state.profiles, error: null }));
        }
        state.logReads += 1;
        if (state.mode === 'error') {
          return Promise.resolve(resolve({ data: null, error: { message: 'sem permissão de leitura' } }));
        }
        if (state.mode === 'empty') {
          return Promise.resolve(resolve({ data: null, error: null }));
        }
        const data = from === null ? state.rows : state.rows.slice(from, (to ?? 0) + 1);
        return Promise.resolve(resolve({ data, error: null }));
      },
    };
    return q;
  }

  return { builder, state };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (table: string) => h.builder(table) },
}));

// Filhos do painel que falam direto com a rede / animações pesadas: fora do
// escopo deste teste (mesmo recorte de `ContactDetailPanel.activity.test.tsx`).
vi.mock('@/services/contact.service', () => ({
  ContactService: {
    fetchStats: vi.fn().mockResolvedValue({
      totalMessages: 0,
      avgResponseTimeMinutes: null,
      totalConversations: 0,
      messagesChangePercent: null,
      conversationsChangePercent: null,
      csatAverage: null,
      csatCount: 0,
    }),
    getLastMessageDates: vi.fn().mockResolvedValue({ data: [], error: null }),
  },
}));
vi.mock('../ContactActivityTimeline', () => ({ ContactActivityTimeline: () => <div data-testid="timeline" /> }));
vi.mock('../ContactNotes', () => ({ ContactNotes: () => <div data-testid="notes" /> }));
vi.mock('../ContactPurchaseHistory', () => ({ ContactPurchaseHistory: () => <div data-testid="purchases" /> }));
vi.mock('@/hooks/integrations/useCatalogSendHistory', () => ({
  useCatalogSendHistory: () => ({ rows: [], isLoading: false, error: null }),
}));
vi.mock('@/components/catalog/ExternalProductCatalog', () => ({
  ExternalProductCatalog: ({ trigger }: { trigger?: React.ReactNode }) => <div>{trigger}</div>,
}));
vi.mock('../ContactEngagementScore', () => ({ ContactEngagementScore: () => <div data-testid="engagement-score" /> }));

import { ContactChangeHistory } from '../ContactChangeHistory';
import { ContactDetailPanel } from '../ContactDetailPanel';

/** Três linhas da trilha: alteração (Ana), exclusão sem perfil e criação. */
const LINHAS = [
  {
    id: 3,
    contact_id: 'c1',
    operation: 'update',
    campos: ['phone', 'assigned_to'],
    performed_by: 'user-1',
    performed_by_profile: 'prof-1',
    performed_by_db_role: 'authenticated',
    performed_at: '2026-03-01T12:00:00.000Z',
  },
  {
    id: 2,
    contact_id: 'c1',
    operation: 'soft_delete',
    campos: [],
    performed_by: null,
    performed_by_profile: null,
    performed_by_db_role: 'service_role',
    performed_at: '2026-02-28T12:00:00.000Z',
  },
  {
    id: 1,
    contact_id: 'c1',
    operation: 'insert',
    campos: ['name'],
    performed_by: 'user-1',
    performed_by_profile: 'prof-1',
    performed_by_db_role: 'authenticated',
    performed_at: '2026-02-27T12:00:00.000Z',
  },
];

function renderHistory(contactId = 'c1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <ContactChangeHistory contactId={contactId} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.state.mode = 'ok';
  h.state.rows = LINHAS;
  h.state.profiles = [{ id: 'prof-1', name: 'Ana' }];
  h.state.logReads = 0;
});

afterEach(() => cleanup());

describe('ContactChangeHistory — quem, quando e quais campos', () => {
  it('mostra as três alterações com ator, data e os campos em pt-BR', async () => {
    const { container } = renderHistory();

    const lista = await screen.findByTestId('change-history-list');
    // Só as entradas da trilha: os `li` dos campos são netos (lista interna).
    const itens = lista.querySelectorAll(':scope > li');
    expect(itens.length).toBe(3);

    // QUEM: o nome do perfil resolvido no banco; sem perfil, a tela é honesta.
    expect(lista).toHaveTextContent('Ana');
    expect(lista).toHaveTextContent('Autor não identificado');

    // QUANDO: data em pt-BR, dd/MM/aaaa às HH:mm.
    expect(lista.textContent).toMatch(/\d{2}\/03\/2026 às \d{2}:\d{2}/);

    // QUAIS CAMPOS: rótulo em pt-BR (e o nome cru da coluna não aparece).
    expect(lista).toHaveTextContent('Telefone');
    expect(lista).toHaveTextContent('Responsável');
    expect(lista).toHaveTextContent('Nome');
    expect(lista).not.toHaveTextContent('assigned_to');
    expect(lista).not.toHaveTextContent('phone');

    // O que a operação significa, não o código do banco.
    expect(lista).toHaveTextContent('Alterado');
    expect(lista).toHaveTextContent('Excluído');
    expect(lista).toHaveTextContent('Criado');

    // Estrutura: listas de verdade e cabeçalho nomeando a seção (a11y estrutural).
    expect(await axe(container)).toHaveNoViolations();
  });

  it('contato sem alteração: mensagem de vazio, não esqueleto nem lista', async () => {
    h.state.mode = 'empty';

    const { container } = renderHistory();

    expect(await screen.findByTestId('change-history-empty')).toHaveTextContent(
      'Nenhuma alteração registrada para este contato',
    );
    expect(screen.queryByTestId('change-history-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('change-history-loading')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('falha de leitura: mensagem própria e "Tentar novamente" que refaz a leitura', async () => {
    h.state.mode = 'error';

    renderHistory();

    expect(await screen.findByTestId('change-history-error')).toHaveTextContent(
      'Não foi possível carregar o histórico de alterações.',
    );

    // Teclado: o botão é um <button> nativo (alcançável por Tab) e a ativação recarrega.
    const botao = screen.getByRole('button', { name: 'Tentar novamente' });
    expect(botao.tagName).toBe('BUTTON');
    botao.focus();
    expect(botao).toHaveFocus();

    const leiturasAntes = h.state.logReads;
    h.state.mode = 'ok';
    fireEvent.click(botao);

    const lista = await screen.findByTestId('change-history-list');
    expect(h.state.logReads).toBeGreaterThan(leiturasAntes);
    expect(lista).toHaveTextContent('Telefone');
    expect(screen.queryByTestId('change-history-error')).not.toBeInTheDocument();
  });
});

describe('ContactChangeHistory — aparece para quem vê o contato', () => {
  it('o painel de detalhe do contato monta a seção Histórico', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={client}>
        <ContactDetailPanel
          contact={{ id: 'c1', name: 'Maria Silva', phone: '5541999990000', created_at: '2026-01-01T00:00:00Z' }}
          onClose={vi.fn()}
          onOpenChat={vi.fn()}
          onEdit={vi.fn()}
        />
      </QueryClientProvider>,
    );

    const secao = await screen.findByTestId('change-history');
    expect(secao).toBeInTheDocument();
    // A seção é a MESMA do título "Histórico" (nome acessível vem do cabeçalho).
    expect(secao).toHaveAccessibleName('Histórico');
    expect(await screen.findByTestId('change-history-list')).toHaveTextContent('Ana');
  });
});
