import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// SL-192 / item 077-078 (skill_based_assign alcançável) —
// "Atribuir por habilidade" na tela de Roteamento.
//
// Antes: o RPC `skill_based_assign` (skills + menor carga) e a tabela
// `queue_skill_requirements` existiam, e a tela salvava as habilidades, mas
// NENHUMA tela chamava o RPC (o hook `useSkillBasedAssign` não tinha
// consumidor nenhum) — nenhum contato era atribuído por habilidade.
// Depois: o admin escolhe a fila e o botão resolve o agente pelo RPC e
// entrega a ele o contato que aguarda há mais tempo naquela fila.
//
// Os primitivos do Radix são trocados por <select>/<option> nativos que
// repassam o evento do usuário para o `onValueChange` REAL do componente
// (mesmo padrão de SkillBasedRoutingSettings.test.tsx e de
// src/components/contacts/__tests__/ContactToolbar.test.tsx).
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  filters: [] as Array<{ table: string; column: string; value: unknown }>,
  /** Toda chamada de filtro/ordem/retorno, com a operação (select/update) em que ocorreu. */
  calls: [] as Array<{ table: string; op: 'select' | 'update'; method: string; args: unknown[] }>,
  toasts: [] as Array<Record<string, unknown>>,
  agentId: 'a1' as string | null,
  waiting: { id: 'c1' } as { id: string } | null,
  /** Linhas que o UPDATE devolve no `.select('id')` (vazio = nenhuma linha alterada). */
  updated: [{ id: 'c1' }] as Array<{ id: string }>,
  rows: {
    profiles: [{ id: 'p1', name: 'Ana' }],
    queues: [{ id: 'q1', name: 'Suporte', color: '#3B82F6' }],
    agent_skills: [],
    queue_skill_requirements: [],
  } as Record<string, unknown[]>,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    defaultValue,
    onValueChange,
    children,
  }: {
    value?: string;
    defaultValue?: string;
    onValueChange?: (v: string) => void;
    children?: ReactNode;
  }) => (
    <select value={value ?? defaultValue ?? ''} onChange={e => onValueChange?.(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children?: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  toast: (payload: Record<string, unknown>) => {
    h.toasts.push(payload);
  },
}));

vi.mock('@/integrations/supabase/client', () => {
  const chainFor = (table: string) => {
    const result = { data: h.rows[table] ?? [], error: null };
    let op: 'select' | 'update' = 'select';
    const record = (method: string) => (...args: unknown[]) => {
      h.calls.push({ table, op, method, args });
      return chain;
    };
    const chain: Record<string, unknown> = {
      select: record('select'),
      eq: (column: string, value: unknown) => {
        h.filters.push({ table, column, value });
        h.calls.push({ table, op, method: 'eq', args: [column, value] });
        return chain;
      },
      is: record('is'),
      not: record('not'),
      order: record('order'),
      limit: record('limit'),
      maybeSingle: () => Promise.resolve({ data: h.waiting, error: null }),
      delete: () => chain,
      insert: (payload: Record<string, unknown>) => {
        h.inserts.push({ table, payload });
        return Promise.resolve({ error: null });
      },
      update: (payload: Record<string, unknown>) => {
        op = 'update';
        h.updates.push({ table, payload });
        return chain;
      },
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(op === 'update' ? { data: h.updated, error: null } : result).then(resolve),
    };
    return chain;
  };
  return {
    supabase: {
      from: chainFor,
      rpc: (fn: string, args: Record<string, unknown>) => {
        h.rpcCalls.push({ fn, args });
        return Promise.resolve({ data: h.agentId, error: null });
      },
    },
  };
});

import { SkillBasedRoutingSettings } from '../SkillBasedRoutingSettings';

const ESPERA_ESTADO_REAL = 5000;

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/** O <select> que contém a opção pedida (o nome dele vem do conteúdo, não da posição). */
function comboComOpcao(texto: string): HTMLSelectElement {
  const combo = screen
    .getAllByRole('combobox')
    .find(c => within(c).queryByRole('option', { name: texto }));
  if (!combo) throw new Error(`Nenhum seletor com a opção "${texto}"`);
  return combo as HTMLSelectElement;
}

/** Renderiza e seleciona a fila "Suporte" (a opção só aparece depois da query de `queues`). */
async function selecionarFila() {
  render(<SkillBasedRoutingSettings />, { wrapper });
  const seletorFila = await waitFor(() => comboComOpcao('Suporte'), { timeout: ESPERA_ESTADO_REAL });
  fireEvent.change(seletorFila, { target: { value: 'q1' } });
  return seletorFila;
}

const botaoAtribuir = () =>
  screen.getByRole('button', { name: /Atribuir por habilidade/i });

describe('SkillBasedRoutingSettings — atribuição por habilidade (SL-192)', () => {
  beforeEach(() => {
    h.rpcCalls.length = 0;
    h.updates.length = 0;
    h.inserts.length = 0;
    h.filters.length = 0;
    h.calls.length = 0;
    h.toasts.length = 0;
    h.agentId = 'a1';
    h.waiting = { id: 'c1' };
    h.updated = [{ id: 'c1' }];
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
  });

  it('resolve o agente por habilidade e entrega a ele o contato que aguarda na fila', async () => {
    await selecionarFila();

    fireEvent.click(botaoAtribuir());

    await waitFor(() => expect(h.updates).toHaveLength(1), { timeout: ESPERA_ESTADO_REAL });

    expect(h.rpcCalls).toEqual([{ fn: 'skill_based_assign', args: { p_queue_id: 'q1' } }]);
    expect(h.updates[0]).toEqual({ table: 'contacts', payload: { assigned_to: 'a1' } });
    // A atribuição é no contato que aguardava (o que a consulta devolveu), não em outro.
    expect(
      h.filters.find(f => f.table === 'contacts' && f.column === 'id')?.value,
    ).toBe('c1');
    expect(h.toasts.map(t => t.title)).toContain('Contato atribuído ao agente da fila');
  });

  it('a leitura escolhe o contato que aguarda e a escrita repete a guarda de "aguardando"', async () => {
    await selecionarFila();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    fireEvent.click(botaoAtribuir());

    await waitFor(
      () => expect(h.toasts.map(t => t.title)).toContain('Contato atribuído ao agente da fila'),
      { timeout: ESPERA_ESTADO_REAL },
    );

    const doContato = (op: 'select' | 'update') =>
      h.calls.filter(c => c.table === 'contacts' && c.op === op).map(c => [c.method, ...c.args]);

    // Contato que aguarda: da fila, sem agente, não excluído, conversa aberta, o mais antigo.
    expect(doContato('select')).toEqual([
      ['select', 'id'],
      ['eq', 'queue_id', 'q1'],
      ['is', 'assigned_to', null],
      ['is', 'deleted_at', null],
      ['not', 'conversation_status', 'in', '(resolved,archived)'],
      ['order', 'created_at', { ascending: true }],
      ['limit', 1],
    ]);
    // O UPDATE só toma o contato se ele AINDA aguarda, e devolve a linha alterada.
    expect(doContato('update')).toEqual([
      ['eq', 'id', 'c1'],
      ['eq', 'queue_id', 'q1'],
      ['is', 'assigned_to', null],
      ['is', 'deleted_at', null],
      ['not', 'conversation_status', 'in', '(resolved,archived)'],
      ['select', 'id'],
    ]);
    // Depois do sucesso a fila e as listas de contatos são refeitas.
    const chaves = invalidate.mock.calls.map(([f]) => JSON.stringify((f as { queryKey?: unknown }).queryKey));
    expect(chaves).toEqual(expect.arrayContaining([
      '["contacts-kpi"]', '["contacts-type-counts"]', '["contacts-search"]', '["warroom-queues"]', '["queue-position"]',
    ]));
  });

  it('UPDATE que não altera linha (contato já pego) não anuncia sucesso nem refaz a fila', async () => {
    h.updated = [];
    await selecionarFila();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    fireEvent.click(botaoAtribuir());

    await waitFor(
      () => expect(h.toasts.map(t => t.title)).toContain('O contato já foi atribuído'),
      { timeout: ESPERA_ESTADO_REAL },
    );
    expect(h.updates).toHaveLength(1);
    expect(h.toasts.map(t => t.title)).not.toContain('Contato atribuído ao agente da fila');
    const chaves = invalidate.mock.calls.map(([f]) => JSON.stringify((f as { queryKey?: unknown }).queryKey));
    expect(chaves).not.toContain('["warroom-queues"]');
  });

  it('não altera contato nenhum quando a fila não tem contato aguardando', async () => {
    h.waiting = null;
    await selecionarFila();

    fireEvent.click(botaoAtribuir());

    await waitFor(
      () => expect(h.toasts.map(t => t.title)).toContain('Nenhum contato aguardando nesta fila'),
      { timeout: ESPERA_ESTADO_REAL },
    );
    expect(h.rpcCalls).toHaveLength(1);
    expect(h.updates).toEqual([]);
  });

  it('não consulta nem altera contato quando a fila não tem agente ativo', async () => {
    h.agentId = null;
    await selecionarFila();

    fireEvent.click(botaoAtribuir());

    await waitFor(
      () => expect(h.toasts.map(t => t.title)).toContain('Nenhum agente ativo nesta fila'),
      { timeout: ESPERA_ESTADO_REAL },
    );
    expect(h.updates).toEqual([]);
    expect(h.filters.filter(f => f.table === 'contacts')).toEqual([]);
  });
});
