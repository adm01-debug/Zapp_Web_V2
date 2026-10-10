import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TestQueryWrapper } from '@/test/mocks/queryClient';

/**
 * Contrato de schema REAL do Team Chat — TC-011 / item 166 (#166).
 *
 * O teste anterior (E94/E95) afirmava um schema inventado DENTRO do proprio
 * arquivo: `team_messages.type` e `department_invites.invitee_id / invited_by /
 * token / status`. Nenhuma dessas colunas existe no banco. As reais sao
 * `message_type` (team_messages) e `code` / `created_by` (department_invites).
 *
 * Fixture que se confere contra ela mesma passa com o codigo de producao usando
 * nome errado de coluna — por isso o cartao mandou reescrever: o esperado tem
 * de vir de uma fonte que o teste NAO controla.
 *
 * Aqui:
 *  - o ESPERADO vem de `supabase/schema-manifest.json`, o snapshot do banco de
 *    producao gerado por `scripts/db-audit/manifest.sql` e mantido fresco por
 *    `scripts/db-audit/check-manifest-fresh.mjs` / workflow `types-sync`;
 *  - o ATUAL vem de CHAMAR os hooks de producao com a fronteira Supabase
 *    dublada (o que o app manda de verdade pelo cliente).
 *
 * Se a producao passar a gravar/ler uma coluna que o banco nao tem, o teste
 * fica vermelho. Se o banco perder a coluna, o manifesto muda e o teste tambem
 * fica vermelho.
 */

type Aresta = { table: string; op: string; payload?: unknown };
type ChamadaRpc = { nome: string; args?: unknown };

const f = vi.hoisted(() => {
  const arestas: Aresta[] = [];
  const rpcs: ChamadaRpc[] = [];

  // Cadeia minima do PostgREST: registra a operacao e devolve a si mesma, para
  // que `insert().select().single()` e `update().eq()` funcionem. Cadeia sem
  // `then` resolve para ela mesma em `await`.
  function cadeia(table: string) {
    const registrar = (op: string, payload?: unknown) => {
      arestas.push({ table, op, payload });
    };
    const no: Record<string, unknown> = {};
    no.insert = (payload: unknown) => { registrar('insert', payload); return no; };
    no.upsert = (payload: unknown) => { registrar('upsert', payload); return Promise.resolve({ data: null, error: null }); };
    no.update = (payload: unknown) => { registrar('update', payload); return no; };
    no.delete = () => { registrar('delete'); return no; };
    no.select = (columns?: string) => { registrar('select', columns); return no; };
    no.eq = () => no;
    no.gt = () => no;
    no.order = () => no;
    no.limit = () => no;
    no.single = () => Promise.resolve({ data: { id: 'msg-1' }, error: null });
    return no;
  }

  return { arestas, cadeia, rpcs };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => f.cadeia(table),
    rpc: (nome: string, args?: unknown) => {
      f.rpcs.push({ nome, args });
      return Promise.resolve({ data: [], error: null });
    },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
    rpc: (nome: string, args?: Record<string, unknown>) => {
      f.arestas.push({ table: `rpc:${nome}`, op: 'rpc', payload: args });
      return Promise.resolve({ data: { ok: true, invite_id: 'inv-1', code: 'SRV000000001' }, error: null });
    },
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } } }) },
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1', role: 'admin' } }),
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));

import { useCreateDepartmentInvite } from '@/hooks/team-chat/useDepartmentManagement';
import { useSendTeamMessage } from '@/hooks/team-chat/useTeamChatMutations';
import { useTeamMessages } from '@/hooks/team-chat/useTeamMessages';

type Manifesto = {
  columns: Record<string, string>;
  constraints: Record<string, string>;
  functions: Record<string, string>;
};

const manifesto = JSON.parse(
  readFileSync(join(process.cwd(), 'supabase', 'schema-manifest.json'), 'utf-8'),
) as Manifesto;

/** Colunas reais de uma tabela, lidas do snapshot do banco (nao do teste). */
function colunasReais(tabela: string): string[] {
  const prefixo = `${tabela}.`;
  return Object.keys(manifesto.columns)
    .filter((chave) => chave.startsWith(prefixo))
    .map((chave) => chave.slice(prefixo.length));
}

/** "a, b(c, d), e" -> ["a", "b(c, d)", "e"] (virgula interna nao separa). */
function ultimaAresta(table: string, op: string): Aresta {
  const aresta = [...f.arestas].reverse().find((a) => a.table === table && a.op === op);
  if (!aresta) throw new Error(`nenhuma operacao ${op} em ${table} foi registrada`);
  return aresta;
}

function chavesDe(payload: unknown): string[] {
  return Object.keys((payload ?? {}) as Record<string, unknown>).sort();
}

describe('Contrato de schema real do Team Chat (TC-011 / #166)', () => {
  beforeEach(() => {
    f.arestas.length = 0;
    f.rpcs.length = 0;
  });

  it('o snapshot do banco enxerga as tabelas do Team Chat (nao passa por vacuidade)', () => {
    expect(colunasReais('team_messages')).toContain('message_type');
    expect(colunasReais('department_invites')).toContain('code');
  });

  it('useSendTeamMessage grava so colunas que existem em team_messages', async () => {
    const { result } = renderHook(() => useSendTeamMessage(), { wrapper: TestQueryWrapper });

    await act(async () => {
      await result.current.mutateAsync({ conversationId: 'conv-1', content: 'oi' });
    });

    const chaves = chavesDe(ultimaAresta('team_messages', 'insert').payload);
    expect(chaves.length).toBeGreaterThan(0);
    expect(chaves.filter((chave) => !colunasReais('team_messages').includes(chave))).toEqual([]);
  });

  // SL-069/F76: o convite deixou de ser INSERT direto em `department_invites` (tabela
  // aposentada) e passou a ser a RPC `create_department_invite`. O esperado continua
  // vindo do snapshot do banco: a funcao tem de existir la e a chamada do hook so pode
  // levar os parametros que a assinatura declara.
  it('useCreateDepartmentInvite chama so a RPC que existe no banco, com os parametros declarados e sem INSERT direto', async () => {
    const { result } = renderHook(() => useCreateDepartmentInvite('dep-1'), { wrapper: TestQueryWrapper });

    await act(async () => {
      await result.current.mutateAsync('Ana');
    });

    const assinatura = Object.keys(manifesto.functions).find((chave) => chave.startsWith('f:create_department_invite('));
    expect(assinatura).toBeDefined();
    const parametrosReais = String(assinatura)
      .slice(String(assinatura).indexOf('(') + 1, -1)
      .split(',')
      .map((parametro) => parametro.trim().split(' ')[0])
      .sort();

    const chamada = ultimaAresta('rpc:create_department_invite', 'rpc');
    expect(chavesDe(chamada.payload)).toEqual(parametrosReais);
    expect(f.arestas.some((a) => a.op === 'insert' && a.table.startsWith('department_invit'))).toBe(false);
  });

  it('a leitura de mensagens passa por RPC que existe no snapshot do banco', async () => {
    renderHook(() => useTeamMessages('conv-1'), { wrapper: TestQueryWrapper });

    await waitFor(() =>
      expect(f.rpcs.some((chamada) => chamada.nome === 'get_team_messages_page')).toBe(true),
    );

    // O esperado vem do snapshot do banco (fonte que o teste NAO controla): todo
    // nome de RPC que o front chama tem de existir em `functions`, e nao passa
    // por vacuidade porque a chamada observada acima ja foi exigida.
    expect(f.rpcs.length).toBeGreaterThan(0);
    const semCorrespondente = f.rpcs
      .map((chamada) => chamada.nome)
      .filter((nome) => !Object.keys(manifesto.functions).some((chave) => chave.startsWith(`f:${nome}(`)));
    expect(semCorrespondente).toEqual([]);
  });

  it.todo(
    'RLS de verdade (papeis e policies contra Postgres descartavel) — provar em scripts/db-audit/*.test.sh, com papel real',
  );
});
