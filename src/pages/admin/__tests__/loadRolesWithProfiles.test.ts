import { describe, it, expect, vi, beforeEach } from 'vitest';

// R2-AUTH-033: `user_roles.user_id` referencia `auth.users`, então o embed
// `profiles!user_roles_user_id_fkey` NÃO existe no PostgREST (o tipo gerado
// declara `Relationships: []`). O carregador consulta as duas tabelas
// separadamente, junta por `user_id` e propaga erro em vez de devolver [].
//
// O teste substitui só o cliente Supabase (a fronteira de rede) e chama o
// carregador REAL, conferindo as duas consultas emitidas, a junção e os
// caminhos de erro.
const h = vi.hoisted(() => {
  interface QueryResult {
    data: unknown;
    error: unknown;
  }
  interface RecordedCall {
    table: string;
    select: string | null;
    order: string | null;
    inValues: string[] | null;
  }

  const results: Record<string, QueryResult> = {
    user_roles: { data: [], error: null },
    profiles: { data: [], error: null },
  };
  const calls: RecordedCall[] = [];

  const from = vi.fn((table: string) => {
    const call: RecordedCall = { table, select: null, order: null, inValues: null };
    calls.push(call);
    const builder: {
      select: ReturnType<typeof vi.fn>;
      order: ReturnType<typeof vi.fn>;
      in: ReturnType<typeof vi.fn>;
    } = {
      select: vi.fn((columns: string) => {
        call.select = columns;
        return builder;
      }),
      order: vi.fn((column: string) => {
        call.order = column;
        return Promise.resolve(results[table]);
      }),
      in: vi.fn((_column: string, values: string[]) => {
        call.inValues = values;
        return Promise.resolve(results[table]);
      }),
    };
    return builder;
  });

  return { results, calls, from };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: h.from },
}));

import { loadRolesWithProfiles } from '@/pages/admin/loadRolesWithProfiles';

describe('loadRolesWithProfiles — R2-AUTH-033', () => {
  beforeEach(() => {
    h.calls.length = 0;
    h.from.mockClear();
    h.results.user_roles = { data: [], error: null };
    h.results.profiles = { data: [], error: null };
  });

  it('consulta user_roles sem embed e profiles por user_id, juntando por user_id', async () => {
    h.results.user_roles = {
      data: [
        { id: 'r1', user_id: 'u1', role: 'admin' },
        { id: 'r2', user_id: 'u2', role: 'agent' },
      ],
      error: null,
    };
    h.results.profiles = {
      data: [
        { user_id: 'u1', name: 'Ana', email: 'ana@x.com', avatar_url: null },
        { user_id: 'u2', name: 'Bia', email: 'bia@x.com', avatar_url: 'https://x/a.png' },
      ],
      error: null,
    };

    const rows = await loadRolesWithProfiles();

    // Duas consultas, na ordem: user_roles e depois profiles.
    expect(h.calls).toHaveLength(2);
    expect(h.calls.map((c) => c.table)).toEqual(['user_roles', 'profiles']);

    // A consulta de roles não carrega o embed inexistente.
    expect(h.calls[0].select).not.toContain('profiles');
    expect(h.calls[0].select).toContain('user_id');
    expect(h.calls[0].select).toContain('role');

    // A consulta de perfis filtra por `user_id` (a lista distinta de roles).
    expect(h.calls[1].select).toContain('user_id');
    expect(h.calls[1].select).toContain('name');
    expect(h.calls[1].select).toContain('email');
    expect(h.calls[1].select).toContain('avatar_url');
    expect(h.calls[1].inValues).toEqual(['u1', 'u2']);

    // Junção por user_id preservando cada role.
    expect(rows).toEqual([
      {
        id: 'r1',
        user_id: 'u1',
        role: 'admin',
        profile: { name: 'Ana', email: 'ana@x.com', avatar_url: null },
      },
      {
        id: 'r2',
        user_id: 'u2',
        role: 'agent',
        profile: { name: 'Bia', email: 'bia@x.com', avatar_url: 'https://x/a.png' },
      },
    ]);
  });

  it('busca cada user_id uma única vez quando o usuário tem mais de uma role', async () => {
    h.results.user_roles = {
      data: [
        { id: 'r1', user_id: 'u1', role: 'admin' },
        { id: 'r2', user_id: 'u1', role: 'supervisor' },
      ],
      error: null,
    };
    h.results.profiles = {
      data: [{ user_id: 'u1', name: 'Ana', email: 'ana@x.com', avatar_url: null }],
      error: null,
    };

    const rows = await loadRolesWithProfiles();

    expect(h.calls[1].inValues).toEqual(['u1']);
    expect(rows).toHaveLength(2);
    expect(rows[0].profile?.name).toBe('Ana');
    expect(rows[1].profile?.name).toBe('Ana');
  });

  it('devolve a role sem profile quando não existe perfil com aquele user_id', async () => {
    h.results.user_roles = {
      data: [{ id: 'r1', user_id: 'u1', role: 'agent' }],
      error: null,
    };
    h.results.profiles = { data: [], error: null };

    const rows = await loadRolesWithProfiles();

    expect(rows).toEqual([{ id: 'r1', user_id: 'u1', role: 'agent' }]);
    expect(rows[0].profile).toBeUndefined();
  });

  it('propaga o erro de user_roles como falha e não consulta profiles', async () => {
    const boom = { message: 'permission denied for table user_roles', code: '42501' };
    h.results.user_roles = { data: null, error: boom };

    await expect(loadRolesWithProfiles()).rejects.toBe(boom);
    // Não converte a falha em resultado vazio...
    expect(h.calls.map((c) => c.table)).toEqual(['user_roles']);
  });

  it('propaga o erro de profiles como falha em vez de devolver roles sem perfil', async () => {
    const boom = { message: 'permission denied for table profiles', code: '42501' };
    h.results.user_roles = {
      data: [{ id: 'r1', user_id: 'u1', role: 'admin' }],
      error: null,
    };
    h.results.profiles = { data: null, error: boom };

    await expect(loadRolesWithProfiles()).rejects.toBe(boom);
  });

  it('sem roles cadastradas devolve lista vazia sem consultar profiles', async () => {
    h.results.user_roles = { data: [], error: null };

    await expect(loadRolesWithProfiles()).resolves.toEqual([]);
    expect(h.calls.map((c) => c.table)).toEqual(['user_roles']);
  });
});
