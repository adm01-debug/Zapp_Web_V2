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

const f = vi.hoisted(() => {
  const arestas: Aresta[] = [];

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

  return { arestas, cadeia };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => f.cadeia(table),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
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
function dividirTopo(select: string): string[] {
  const partes: string[] = [];
  let atual = '';
  let profundidade = 0;
  for (const caractere of select) {
    if (caractere === '(') profundidade += 1;
    if (caractere === ')') profundidade -= 1;
    if (caractere === ',' && profundidade === 0) {
      partes.push(atual);
      atual = '';
      continue;
    }
    atual += caractere;
  }
  partes.push(atual);
  return partes.map((parte) => parte.trim()).filter((parte) => parte.length > 0);
}

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

  it('useCreateDepartmentInvite grava so colunas que existem em department_invites', async () => {
    const { result } = renderHook(() => useCreateDepartmentInvite('dep-1'), { wrapper: TestQueryWrapper });

    await act(async () => {
      await result.current.mutateAsync('Ana');
    });

    const chaves = chavesDe(ultimaAresta('department_invites', 'insert').payload);
    expect(chaves.length).toBeGreaterThan(0);
    expect(chaves.filter((chave) => !colunasReais('department_invites').includes(chave))).toEqual([]);
  });

  it('a leitura de team_messages pede colunas e relacao que existem no banco', async () => {
    renderHook(() => useTeamMessages('conv-1'), { wrapper: TestQueryWrapper });

    await waitFor(() => expect(f.arestas.some((a) => a.table === 'team_messages' && a.op === 'select')).toBe(true));
    const select = String(ultimaAresta('team_messages', 'select').payload);

    const colunasPedidas: string[] = [];
    const relacoesPedidas: string[] = [];

    for (const parte of dividirTopo(select)) {
      if (parte === '*') continue;
      if (parte.includes('!')) {
        // "sender:profiles!team_messages_sender_id_fkey(id, name)" — embed do PostgREST:
        // a FK e declarada na tabela consultada (team_messages) e tem de existir
        // no banco, senao a query falha em runtime.
        const alvo = parte.slice(parte.indexOf(':') + 1);
        const [, resto] = alvo.split('!');
        const fk = (resto ?? '').split('(')[0].trim();
        relacoesPedidas.push(fk);
        continue;
      }
      colunasPedidas.push(parte);
    }

    expect(colunasPedidas.length).toBeGreaterThan(0);
    expect(relacoesPedidas.length).toBeGreaterThan(0);
    expect(colunasPedidas.filter((coluna) => !colunasReais('team_messages').includes(coluna))).toEqual([]);
    expect(
      relacoesPedidas.filter((fk) => !(`relation:team_messages.${fk}` in manifesto.constraints)),
    ).toEqual([]);
  });

  it.todo(
    'RLS de verdade (papeis e policies contra Postgres descartavel) — provar em scripts/db-audit/*.test.sh, com papel real',
  );
});
