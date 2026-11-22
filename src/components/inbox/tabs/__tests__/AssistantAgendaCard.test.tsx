import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Fase 2 do assistente pessoal — ENTREGA VERIFICÁVEL do plano:
 * "uma mensagem contendo uma data gera uma oferta de lembrete; aceitar cria a
 * linha em `conversation_tasks`; o teste cobre os dois caminhos."
 *
 * O stub de PostgREST responde o select/insert da agenda e grava as linhas
 * inseridas, para o assert ser sobre o BANCO (o que foi realmente gravado) e
 * não sobre estado de UI.
 */
type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  rows: [] as Row[],
  inserted: [] as Row[],
  insertError: null as { code?: string; message: string } | null,
  selectError: null as { message: string } | null,
  perfilId: 'perfil-1',
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: h.perfilId }, user: { id: 'user-1' } }),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => {
  type Cadeia = {
    select: (cols?: unknown, opts?: unknown) => Cadeia;
    insert: (row: Row) => Cadeia;
    eq: (c: string, v: unknown) => Cadeia;
    not: (c: string, op: string, v: unknown) => Cadeia;
    gte: (c: string, v: unknown) => Cadeia;
    lte: (c: string, v: unknown) => Cadeia;
    order: (...a: unknown[]) => Cadeia;
    limit: (n: number) => Cadeia;
    single: () => Promise<{ data: unknown; error: unknown }>;
    then: (resolve: (v: unknown) => unknown) => unknown;
  };

  const fabricar = (): Cadeia => {
    let pendente: Row | null = null;
    const cadeia: Cadeia = {
      select: () => cadeia,
      insert: (row: Row) => { pendente = row; return cadeia; },
      eq: () => cadeia,
      not: () => cadeia,
      gte: () => cadeia,
      lte: () => cadeia,
      order: () => cadeia,
      limit: () => cadeia,
      single: () => {
        if (pendente) {
          if (h.insertError) return Promise.resolve({ data: null, error: h.insertError });
          h.inserted.push(pendente);
          return Promise.resolve({ data: { id: `tarefa-${h.inserted.length}` }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      then: (resolve) => {
        if (h.selectError) return Promise.resolve(resolve({ data: null, error: h.selectError, count: null }));
        return Promise.resolve(resolve({ data: h.rows, error: null, count: h.rows.length }));
      },
    };
    return cadeia;
  };

  return { supabase: { from: () => fabricar() } };
});

import { AssistantAgendaCard } from '../AssistantAgendaCard';

function renderCard(props: Parameters<typeof AssistantAgendaCard>[0]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AssistantAgendaCard {...props} />
    </QueryClientProvider>
  );
}

/** Quarta-feira de referência para a data da mensagem não virar flake. */
const MENSAGEM = 'me liga na quinta às 14h';

beforeEach(() => {
  h.rows = [];
  h.inserted = [];
  h.insertError = null;
  h.selectError = null;
});

describe('AssistantAgendaCard — Fase 2 (memória/agenda)', () => {
  it('caminho 1: mensagem com data gera a oferta de lembrete', async () => {
    renderCard({ contactId: "contato-1", contactName: "Maria", lastContactMessage: MENSAGEM });

    const oferta = await screen.findByTestId('reminder-offer');
    expect(oferta).toBeTruthy();
    expect((screen.getByTestId('reminder-offer-title') as HTMLInputElement).value).toContain('Maria');
    // Nada é gravado só por oferecer: o banco continua intacto até o aceite.
    expect(h.inserted).toHaveLength(0);
  });

  it('caminho 2: aceitar a oferta grava a linha com contato, dono e data resolvida', async () => {
    const onCreated = vi.fn();
    renderCard({
      contactId: 'contato-1',
      contactName: 'Maria',
      lastContactMessage: MENSAGEM,
      onCreated,
    });

    await screen.findByTestId('reminder-offer');
    fireEvent.click(screen.getByTestId('reminder-offer-accept'));

    await waitFor(() => expect(h.inserted).toHaveLength(1));
    const linha = h.inserted[0];
    expect(linha.contact_id).toBe('contato-1');
    expect(linha.created_by).toBe('perfil-1');
    expect(linha.assigned_to).toBe('perfil-1');
    expect(linha.status).toBe('todo');
    expect(typeof linha.remind_at).toBe('string');
    expect(new Date(linha.remind_at as string).getDay()).toBe(4); // quinta
    expect(linha.client_task_id).toBeTruthy();
    await waitFor(() => expect(onCreated).toHaveBeenCalled());

    // A oferta sai da tela depois do aceite — não pede a mesma coisa duas vezes.
    await waitFor(() => expect(screen.queryByTestId('reminder-offer')).toBeNull());
  });

  it('dispensar a oferta não grava nada', async () => {
    renderCard({ contactId: "contato-1", contactName: "Maria", lastContactMessage: MENSAGEM });

    await screen.findByTestId('reminder-offer');
    fireEvent.click(screen.getByTestId('reminder-offer-dismiss'));

    await waitFor(() => expect(screen.queryByTestId('reminder-offer')).toBeNull());
    expect(h.inserted).toHaveLength(0);
  });

  it('mostra os compromissos futuros já marcados com o contato (leitura da agenda)', async () => {
    h.rows = [
      { id: 't1', title: 'Enviar orçamento', remind_at: new Date(Date.now() + 86_400_000).toISOString(), status: 'todo' },
    ];
    renderCard({ contactId: "contato-1", contactName: "Maria", lastContactMessage: "qual o preço?" });

    const lista = await screen.findByTestId('agenda-list');
    expect(lista.textContent).toContain('Enviar orçamento');
    // Mensagem sem data não gera oferta.
    expect(screen.queryByTestId('reminder-offer')).toBeNull();
  });

  it('falha de leitura aparece como erro explícito, não como agenda vazia', async () => {
    h.selectError = { message: 'boom' };
    renderCard({ contactId: "contato-1", contactName: "Maria", lastContactMessage: "qual o preço?" });

    const erro = await screen.findByTestId('agenda-error');
    expect(erro.getAttribute('role')).toBe('alert');
    expect(screen.queryByTestId('agenda-empty')).toBeNull();
  });
});