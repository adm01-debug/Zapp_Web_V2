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
  // op = 'leitura' quando o filtro saiu de uma corrente de SELECT,
  // 'escrita' quando saiu de uma corrente de UPDATE/DELETE — é o que separa
  // a busca do contato aguardando da guarda repetida no UPDATE.
  filters: [] as Array<{
    table: string;
    op: 'leitura' | 'escrita' | null;
    method: 'eq' | 'is' | 'not';
    column: string;
    operator?: string;
    value: unknown;
  }>,
  orders: [] as Array<{
    table: string;
    op: 'leitura' | 'escrita' | null;
    column: string;
    options: unknown;
  }>,
  toasts: [] as Array<Record<string, unknown>>,
  agentId: 'a1' as string | null,
  waiting: { id: 'c1' } as { id: string } | null,
  // Linhas devolvidas pelo `.select('id')` depois do UPDATE: vazio simula a
  // guarda não batendo (contato já atribuído por outro fluxo).
  updatedRows: [{ id: 'c1' }] as Array<{ id: string }>,
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
    // A corrente vira 'escrita' no primeiro insert/update/delete; antes disso
    // é 'leitura'. No PostgREST real, UPDATE sem .select() volta 204 com
    // data null — aqui também, para provar que a confirmação existe.
    const ctx = { op: null as 'leitura' | 'escrita' | null, selectAposEscrita: false };
    const result = { data: h.rows[table] ?? [], error: null };
    const chain: Record<string, unknown> = {
      select: () => {
        if (ctx.op === 'escrita') ctx.selectAposEscrita = true;
        else ctx.op = 'leitura';
        return chain;
      },
      eq: (column: string, value: unknown) => {
        h.filters.push({ table, op: ctx.op, method: 'eq', column, value });
        return chain;
      },
      is: (column: string, value: unknown) => {
        h.filters.push({ table, op: ctx.op, method: 'is', column, value });
        return chain;
      },
      not: (column: string, operator: string, value: unknown) => {
        h.filters.push({ table, op: ctx.op, method: 'not', column, operator, value });
        return chain;
      },
      order: (column: string, options: unknown) => {
        h.orders.push({ table, op: ctx.op, column, options });
        return chain;
      },
      limit: () => chain,
      maybeSingle: () => Promise.resolve({ data: h.waiting, error: null }),
      delete: () => {
        ctx.op = 'escrita';
        return chain;
      },
      insert: (payload: Record<string, unknown>) => {
        ctx.op = 'escrita';
        h.inserts.push({ table, payload });
        return Promise.resolve({ error: null });
      },
      update: (payload: Record<string, unknown>) => {
        ctx.op = 'escrita';
        h.updates.push({ table, payload });
        return chain;
      },
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(
          ctx.op === 'escrita'
            ? { data: ctx.selectAposEscrita ? h.updatedRows : null, error: null }
            : result,
        ).then(resolve),
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
    h.orders.length = 0;
    h.toasts.length = 0;
    h.agentId = 'a1';
    h.waiting = { id: 'c1' };
    h.updatedRows = [{ id: 'c1' }];
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

  it('busca o contato aguardando com os filtros da contagem da fila, do mais antigo ao mais novo', async () => {
    await selecionarFila();

    fireEvent.click(botaoAtribuir());

    await waitFor(() => expect(h.updates).toHaveLength(1), { timeout: ESPERA_ESTADO_REAL });

    // Mesma definição de "aguardando" de QueueService.fetchWaitingCounts:
    // sem responsável, não apagado, não encerrado.
    const leituraContacts = h.filters.filter(f => f.table === 'contacts' && f.op === 'leitura');
    expect(leituraContacts).toEqual(
      expect.arrayContaining([
        { table: 'contacts', op: 'leitura', method: 'eq', column: 'queue_id', value: 'q1' },
        { table: 'contacts', op: 'leitura', method: 'is', column: 'assigned_to', value: null },
        { table: 'contacts', op: 'leitura', method: 'is', column: 'deleted_at', value: null },
        {
          table: 'contacts',
          op: 'leitura',
          method: 'not',
          column: 'conversation_status',
          operator: 'in',
          value: '(resolved,archived)',
        },
      ]),
    );
    expect(h.orders).toEqual(
      expect.arrayContaining([
        { table: 'contacts', op: 'leitura', column: 'created_at', options: { ascending: true } },
      ]),
    );
  });

  it('repete a guarda de "aguardando" no UPDATE para não sobrescrever atribuição feita entre a leitura e a escrita', async () => {
    await selecionarFila();

    fireEvent.click(botaoAtribuir());

    await waitFor(() => expect(h.updates).toHaveLength(1), { timeout: ESPERA_ESTADO_REAL });

    const escritaContacts = h.filters.filter(f => f.table === 'contacts' && f.op === 'escrita');
    expect(escritaContacts).toEqual(
      expect.arrayContaining([
        { table: 'contacts', op: 'escrita', method: 'eq', column: 'id', value: 'c1' },
        { table: 'contacts', op: 'escrita', method: 'eq', column: 'queue_id', value: 'q1' },
        { table: 'contacts', op: 'escrita', method: 'is', column: 'assigned_to', value: null },
        { table: 'contacts', op: 'escrita', method: 'is', column: 'deleted_at', value: null },
      ]),
    );
  });

  it('não anuncia sucesso quando o UPDATE não altera linha (contato atribuído por outro fluxo)', async () => {
    h.updatedRows = [];
    await selecionarFila();

    fireEvent.click(botaoAtribuir());

    await waitFor(() => expect(h.toasts.length).toBeGreaterThan(0), { timeout: ESPERA_ESTADO_REAL });

    const titulos = h.toasts.map(t => t.title);
    expect(titulos).not.toContain('Contato atribuído ao agente da fila');
    expect(titulos).toContain('Este contato já foi atribuído por outro fluxo');
  });

  it('depois de atribuir de verdade, invalida a lista de contatos e a contagem da fila', async () => {
    const invalidacao = vi.spyOn(queryClient, 'invalidateQueries');
    await selecionarFila();

    fireEvent.click(botaoAtribuir());

    await waitFor(
      () => expect(h.toasts.map(t => t.title)).toContain('Contato atribuído ao agente da fila'),
      { timeout: ESPERA_ESTADO_REAL },
    );
    // Chaves canônicas de invalidateContactsAggregates + a contagem por fila;
    // ['contacts'] é chave morta neste repositório (prefixo não casa com
    // 'contacts-search') e não pode aparecer.
    expect(invalidacao).toHaveBeenCalledWith({ queryKey: ['contacts-kpi'] });
    expect(invalidacao).toHaveBeenCalledWith({ queryKey: ['contacts-type-counts'] });
    expect(invalidacao).toHaveBeenCalledWith({ queryKey: ['contacts-search'] });
    expect(invalidacao).toHaveBeenCalledWith({ queryKey: ['dashboard-contact-counts'] });
    expect(invalidacao).not.toHaveBeenCalledWith({ queryKey: ['contacts'] });
  });
});
