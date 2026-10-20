/**
 * Regras da carteira do cliente — `useClientWallet`.
 *
 * O sujeito é o hook REAL; a dublagem é só a fronteira de rede: cada
 * `from(tabela)` grava a operação (select/insert/update/delete), o payload e os
 * filtros, e devolve o que o teste mandar — inclusive erro de RLS. Assim se
 * prova o que o hook pede ao banco e o que ele faz com a recusa.
 *
 * Fixtures coerentes: todo `agent_id` existe em `profiles` e todo
 * `whatsapp_connection_id` existe em `whatsapp_connections`.
 *
 * Dois defeitos encontrados ficam travados como `it.fails` (não corrigidos
 * aqui): a corrida de duas alternâncias simultâneas (a primeira volta ao estado
 * anterior) e a exclusão negada pelo RLS, que não dá nenhum retorno ao usuário.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  ops: [] as Array<{ table: string; op: string; payload?: unknown; filters: unknown[][] }>,
  tables: {} as Record<string, { data: unknown; error: unknown }>,
  writes: {} as Record<string, { error: unknown }>,
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const entry: { table: string; op: string; payload?: unknown; filters: unknown[][] } = {
        table,
        op: 'select',
        filters: [],
      };
      h.ops.push(entry);

      const builder: Record<string, unknown> = {};
      const mesmo = () => builder;
      builder.select = () => mesmo();
      builder.order = (...a: unknown[]) => {
        entry.filters.push(['order', ...a]);
        return mesmo();
      };
      builder.in = (...a: unknown[]) => {
        entry.filters.push(['in', ...a]);
        return mesmo();
      };
      builder.eq = (...a: unknown[]) => {
        entry.filters.push(['eq', ...a]);
        return mesmo();
      };
      builder.insert = (payload: unknown) => {
        entry.op = 'insert';
        entry.payload = payload;
        return mesmo();
      };
      builder.update = (payload: unknown) => {
        entry.op = 'update';
        entry.payload = payload;
        return mesmo();
      };
      builder.delete = () => {
        entry.op = 'delete';
        return mesmo();
      };
      builder.then = (ok?: (v: unknown) => unknown, falhou?: (e: unknown) => unknown) => {
        const base =
          entry.op === 'select'
            ? (h.tables[table] ?? { data: [], error: null })
            : { data: null, error: (h.writes[entry.op] ?? { error: null }).error };
        return Promise.resolve(base).then(ok, falhou);
      };
      return builder;
    },
  },
}));

import { useClientWallet } from '../useClientWallet';
import { toast } from '@/hooks/ui/use-toast';

const toastMock = toast as unknown as ReturnType<typeof vi.fn>;

const AGENTES = [
  { id: 'ag1', name: 'Ana' },
  { id: 'ag2', name: 'Bia' },
];
const CONEXOES = [
  { id: 'conn1', name: 'Whats 1', phone_number: '5511999' },
  { id: 'conn2', name: 'Whats 2', phone_number: '5521888' },
];

function regra(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: `Regra ${id}`,
    agent_id: 'ag1',
    whatsapp_connection_id: 'conn1',
    priority: 1,
    is_active: true,
    ...extra,
  };
}

const selectsDe = (table: string) => h.ops.filter((o) => o.table === table && o.op === 'select');
const opsDe = (op: string) => h.ops.filter((o) => o.op === op);

beforeEach(() => {
  h.ops = [];
  h.tables = { profiles: { data: AGENTES, error: null }, whatsapp_connections: { data: CONEXOES, error: null } };
  h.writes = {};
  vi.clearAllMocks();
});

async function carregado(result: { current: { loading: boolean } }) {
  await waitFor(() => expect(result.current.loading).toBe(false));
}

describe('useClientWallet — carga das regras', () => {
  it('ordena por prioridade decrescente e resolve agente e conexão por id', async () => {
    h.tables.client_wallet_rules = {
      data: [
        regra('r1', { priority: 10 }),
        regra('r2', { agent_id: 'ag2', whatsapp_connection_id: null, priority: 5 }),
      ],
      error: null,
    };

    const { result } = renderHook(() => useClientWallet());
    await carregado(result);

    expect(result.current.rules).toHaveLength(2);
    expect(result.current.rules[0].agent).toEqual({ id: 'ag1', name: 'Ana' });
    expect(result.current.rules[1].agent).toEqual({ id: 'ag2', name: 'Bia' });
    expect(result.current.rules[0].connection).toEqual(CONEXOES[0]);
    expect(result.current.rules[1].connection).toBeUndefined();
    expect(result.current.agents).toEqual(AGENTES);
    expect(result.current.connections).toEqual(CONEXOES);

    expect(selectsDe('client_wallet_rules')[0].filters).toContainEqual([
      'order',
      'priority',
      { ascending: false },
    ]);
    // Os joins pedem só os ids usados, sem repetir (ag1 aparece em uma regra só).
    const joinAgentes = h.ops.find((o) => o.table === 'profiles' && o.filters.some((f) => f[0] === 'in'));
    expect(joinAgentes?.filters).toContainEqual(['in', 'id', ['ag1', 'ag2']]);
    const joinConexoes = h.ops.find(
      (o) => o.table === 'whatsapp_connections' && o.filters.some((f) => f[0] === 'in'),
    );
    expect(joinConexoes?.filters).toContainEqual(['in', 'id', ['conn1']]);
  });

  it('regra sem conexão não consulta a tabela de conexões para o join', async () => {
    h.tables.client_wallet_rules = {
      data: [regra('r1', { whatsapp_connection_id: null })],
      error: null,
    };

    const { result } = renderHook(() => useClientWallet());
    await carregado(result);

    expect(h.ops.some((o) => o.table === 'whatsapp_connections' && o.filters.some((f) => f[0] === 'in'))).toBe(
      false,
    );
    expect(result.current.rules[0].connection).toBeUndefined();
    expect(result.current.rules[0].whatsapp_connection_id).toBeNull();
  });

  it('erro de RLS na primeira leitura não derruba a tela: lista vazia e o resto carrega', async () => {
    h.tables.client_wallet_rules = {
      data: null,
      error: { message: 'permission denied for table client_wallet_rules', code: '42501' },
    };

    const { result } = renderHook(() => useClientWallet());
    await carregado(result);

    expect(result.current.rules).toEqual([]);
    expect(result.current.agents).toEqual(AGENTES);
    expect(result.current.connections).toEqual(CONEXOES);
  });

  it('RLS negando as listas auxiliares não derruba a tela: agentes e conexões ficam vazios', async () => {
    h.tables.client_wallet_rules = { data: [regra('r1')], error: null };
    h.tables.profiles = { data: null, error: { message: 'permission denied', code: '42501' } };
    h.tables.whatsapp_connections = { data: null, error: { message: 'permission denied', code: '42501' } };

    const { result } = renderHook(() => useClientWallet());
    await carregado(result);

    expect(result.current.rules).toHaveLength(1);
    expect(result.current.rules[0].agent).toBeUndefined();
    expect(result.current.agents).toEqual([]);
    expect(result.current.connections).toEqual([]);
  });

  it('recarga que falha depois de uma carga boa preserva a lista que já estava na tela', async () => {
    h.tables.client_wallet_rules = { data: [regra('r1')], error: null };

    const { result } = renderHook(() => useClientWallet());
    await carregado(result);
    expect(result.current.rules).toHaveLength(1);

    // A regra é criada com sucesso, mas a recarga da lista cai (RLS).
    h.tables.client_wallet_rules = {
      data: null,
      error: { message: 'permission denied for table client_wallet_rules', code: '42501' },
    };
    act(() =>
      result.current.setNewRule({ name: 'Fila VIP', agent_id: 'ag1', whatsapp_connection_id: '', priority: 0 }),
    );
    await act(async () => {
      await result.current.handleAddRule();
    });

    expect(opsDe('insert')).toHaveLength(1);
    expect(result.current.rules).toHaveLength(1);
    expect(result.current.rules[0].id).toBe('r1');
  });
});

describe('useClientWallet — criação de regra', () => {
  it('sem nome ou sem vendedor não vai ao banco e avisa em erro', async () => {
    const { result } = renderHook(() => useClientWallet());
    await carregado(result);

    await act(async () => {
      await result.current.handleAddRule();
    });
    expect(opsDe('insert')).toHaveLength(0);
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Erro',
      description: 'Preencha o nome e selecione um vendedor.',
      variant: 'destructive',
    });

    act(() =>
      result.current.setNewRule({ name: 'Fila VIP', agent_id: '', whatsapp_connection_id: '', priority: 0 }),
    );
    await act(async () => {
      await result.current.handleAddRule();
    });
    expect(opsDe('insert')).toHaveLength(0);
    expect(toastMock).toHaveBeenCalledTimes(2);
  });

  it('cria a regra, normaliza conexão vazia em nulo, fecha o diálogo, limpa o formulário e recarrega', async () => {
    h.tables.client_wallet_rules = { data: [], error: null };
    const { result } = renderHook(() => useClientWallet());
    await carregado(result);

    act(() => result.current.setIsAddDialogOpen(true));
    act(() =>
      result.current.setNewRule({ name: 'Fila VIP', agent_id: 'ag1', whatsapp_connection_id: '', priority: 3 }),
    );
    await act(async () => {
      await result.current.handleAddRule();
    });

    expect(opsDe('insert')[0].table).toBe('client_wallet_rules');
    expect(opsDe('insert')[0].payload).toEqual({
      name: 'Fila VIP',
      agent_id: 'ag1',
      whatsapp_connection_id: null,
      priority: 3,
    });
    expect(result.current.isAddDialogOpen).toBe(false);
    expect(result.current.newRule).toEqual({
      name: '',
      agent_id: '',
      whatsapp_connection_id: '',
      priority: 0,
    });
    expect(selectsDe('client_wallet_rules').length).toBeGreaterThanOrEqual(2);
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Regra criada!',
      description: 'A regra de carteira foi adicionada.',
    });

    // Conexão escolhida de verdade passa inteira (o `|| null` não engole id válido).
    act(() =>
      result.current.setNewRule({
        name: 'Fila Comercial',
        agent_id: 'ag2',
        whatsapp_connection_id: 'conn2',
        priority: 1,
      }),
    );
    await act(async () => {
      await result.current.handleAddRule();
    });
    expect(opsDe('insert')[1].payload).toEqual({
      name: 'Fila Comercial',
      agent_id: 'ag2',
      whatsapp_connection_id: 'conn2',
      priority: 1,
    });
  });

  it('RLS no insert: mostra o motivo, mantém o diálogo aberto e o formulário preenchido, sem recarregar', async () => {
    h.tables.client_wallet_rules = { data: [], error: null };
    h.writes.insert = {
      error: {
        message: 'new row violates row-level security policy for table "client_wallet_rules"',
        code: '42501',
      },
    };
    const { result } = renderHook(() => useClientWallet());
    await carregado(result);

    act(() => result.current.setIsAddDialogOpen(true));
    act(() =>
      result.current.setNewRule({ name: 'Fila VIP', agent_id: 'ag1', whatsapp_connection_id: '', priority: 3 }),
    );
    await act(async () => {
      await result.current.handleAddRule();
    });

    expect(toastMock).toHaveBeenCalledWith({
      title: 'Erro ao criar regra',
      description: 'new row violates row-level security policy for table "client_wallet_rules"',
      variant: 'destructive',
    });
    expect(result.current.isAddDialogOpen).toBe(true);
    expect(result.current.newRule.name).toBe('Fila VIP');
    expect(selectsDe('client_wallet_rules')).toHaveLength(1);
  });
});

describe('useClientWallet — alternar ativa', () => {
  it('grava is_active no banco e reflete na lista', async () => {
    h.tables.client_wallet_rules = { data: [regra('r1')], error: null };
    const { result } = renderHook(() => useClientWallet());
    await carregado(result);

    await act(async () => {
      await result.current.handleToggleActive('r1', false);
    });

    expect(opsDe('update')[0].payload).toEqual({ is_active: false });
    expect(opsDe('update')[0].filters).toContainEqual(['eq', 'id', 'r1']);
    expect(result.current.rules[0].is_active).toBe(false);
  });

  it('alternância negada pelo RLS não muda a lista na tela', async () => {
    h.tables.client_wallet_rules = { data: [regra('r1')], error: null };
    const { result } = renderHook(() => useClientWallet());
    await carregado(result);

    h.writes.update = { error: { message: 'permission denied', code: '42501' } };
    await act(async () => {
      await result.current.handleToggleActive('r1', false);
    });

    expect(result.current.rules[0].is_active).toBe(true);
  });

  it.fails('duas alternâncias simultâneas preservam as DUAS mudanças (hoje a primeira volta atrás)', async () => {
    h.tables.client_wallet_rules = { data: [regra('r1'), regra('r2')], error: null };
    const { result } = renderHook(() => useClientWallet());
    await carregado(result);

    await act(async () => {
      const p1 = result.current.handleToggleActive('r1', false);
      const p2 = result.current.handleToggleActive('r2', false);
      await Promise.all([p1, p2]);
    });

    expect(result.current.rules.map((r) => [r.id, r.is_active])).toEqual([
      ['r1', false],
      ['r2', false],
    ]);
  });
});

describe('useClientWallet — exclusão', () => {
  it('exclui no banco, tira da lista e avisa', async () => {
    h.tables.client_wallet_rules = { data: [regra('r1'), regra('r2')], error: null };
    const { result } = renderHook(() => useClientWallet());
    await carregado(result);

    await act(async () => {
      await result.current.handleDeleteRule('r1');
    });

    expect(opsDe('delete')[0].table).toBe('client_wallet_rules');
    expect(opsDe('delete')[0].filters).toContainEqual(['eq', 'id', 'r1']);
    expect(result.current.rules.map((r) => r.id)).toEqual(['r2']);
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Regra excluída',
      description: 'A regra foi removida com sucesso.',
    });
  });

  it('exclusão negada pelo RLS mantém a lista intacta', async () => {
    h.tables.client_wallet_rules = { data: [regra('r1'), regra('r2')], error: null };
    h.writes.delete = { error: { message: 'permission denied', code: '42501' } };

    const { result } = renderHook(() => useClientWallet());
    await carregado(result);

    await act(async () => {
      await result.current.handleDeleteRule('r1');
    });

    expect(result.current.rules.map((r) => r.id)).toEqual(['r1', 'r2']);
  });

  it.fails('exclusão negada pelo RLS avisa o usuário (hoje falha em silêncio)', async () => {
    h.tables.client_wallet_rules = { data: [regra('r1')], error: null };
    h.writes.delete = { error: { message: 'permission denied', code: '42501' } };

    const { result } = renderHook(() => useClientWallet());
    await carregado(result);
    vi.clearAllMocks();

    await act(async () => {
      await result.current.handleDeleteRule('r1');
    });

    expect(toastMock).toHaveBeenCalled();
  });
});
