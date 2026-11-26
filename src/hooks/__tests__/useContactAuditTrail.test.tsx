/**
 * Trilha de contatos — `fetchContactAuditPage` / `useContactAuditTrail`.
 *
 * O sujeito é o hook REAL; a dublagem é a fronteira de rede (`supabase.from`). Regras provadas:
 * operação fora do contrato do tipo descartada, filtros (operação/período/ids de contato) chegando
 * ao PostgREST, teto da página provado pela linha extra, contato e autor resolvidos em consulta
 * única, busca sem resultado que não consulta a trilha, e a união das páginas no hook.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  ops: [] as Array<{ table: string; filtros: unknown[][] }>,
  fila: {} as Record<string, Array<{ data: unknown; error?: unknown }>>,
  usados: {} as Record<string, number>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const entrada: { table: string; filtros: unknown[][] } = { table, filtros: [] };
      h.ops.push(entrada);
      const builder: Record<string, unknown> = {};
      const mesmo = () => builder;
      builder.select = () => mesmo();
      builder.order = (...a: unknown[]) => {
        entrada.filtros.push(['order', ...a]);
        return mesmo();
      };
      builder.limit = (...a: unknown[]) => {
        entrada.filtros.push(['limit', ...a]);
        return mesmo();
      };
      builder.range = (...a: unknown[]) => {
        entrada.filtros.push(['range', ...a]);
        return mesmo();
      };
      builder.eq = (...a: unknown[]) => {
        entrada.filtros.push(['eq', ...a]);
        return mesmo();
      };
      builder.gte = (...a: unknown[]) => {
        entrada.filtros.push(['gte', ...a]);
        return mesmo();
      };
      builder.in = (...a: unknown[]) => {
        entrada.filtros.push(['in', ...a]);
        return mesmo();
      };
      builder.or = (...a: unknown[]) => {
        entrada.filtros.push(['or', ...a]);
        return mesmo();
      };
      builder.then = (ok?: (v: unknown) => unknown, falhou?: (e: unknown) => unknown) => {
        const indice = h.usados[table] ?? 0;
        h.usados[table] = indice + 1;
        const respostas = h.fila[table] ?? [];
        const resposta = respostas[indice] ?? respostas[respostas.length - 1] ?? {
          data: [],
          error: null,
        };
        return Promise.resolve({ data: resposta.data, error: resposta.error ?? null }).then(
          ok,
          falhou,
        );
      };
      return builder;
    },
  },
}));

import {
  CONTACT_AUDIT_PAGE,
  DEFAULT_CONTACT_AUDIT_FILTERS,
  contactAuditSince,
  fetchContactAuditPage,
  isContactAuditOperation,
  useContactAuditTrail,
  type ContactAuditFilters,
} from '../security/useContactAuditTrail';

const linha = (over: Record<string, unknown> = {}) => ({
  id: 1,
  contact_id: 'c-1',
  operation: 'delete',
  deleted_at_from: null,
  deleted_at_to: '2026-11-20T10:00:00.000Z',
  performed_by: 'u-1',
  performed_by_profile: 'p-1',
  performed_by_db_role: 'authenticated',
  performed_at: '2026-11-20T10:00:00.000Z',
  ...over,
});

const filtros = (over: Partial<ContactAuditFilters> = {}): ContactAuditFilters => ({
  ...DEFAULT_CONTACT_AUDIT_FILTERS,
  ...over,
});

beforeEach(() => {
  h.ops = [];
  h.fila = {};
  h.usados = {};
});

describe('contrato da trilha de contatos', () => {
  it('recusa operação que não pertence ao tipo da trilha', () => {
    expect(isContactAuditOperation('delete', 'block')).toBe(false);
    expect(isContactAuditOperation('block', 'deletion')).toBe(false);
    expect(isContactAuditOperation('unblock', 'block')).toBe(true);
    expect(isContactAuditOperation('purge', 'deletion')).toBe(true);
  });

  it('a janela do período termina no instante pedido', () => {
    const agora = Date.parse('2026-11-26T12:00:00.000Z');
    expect(contactAuditSince(0, agora)).toBeNull();
    expect(contactAuditSince(7, agora)).toBe('2026-11-19T12:00:00.000Z');
    expect(contactAuditSince(30, agora)).toBe('2026-10-27T12:00:00.000Z');
  });
});

describe('fetchContactAuditPage', () => {
  it('resolve contato e autor de cada evento', async () => {
    h.fila = {
      contact_deletion_audit: [{ data: [linha()] }],
      contacts: [
        {
          data: [
            {
              id: 'c-1',
              name: 'Maria Souza',
              phone: '+5511999999999',
              deleted_at: '2026-11-20T10:00:00.000Z',
              blocked_at: null,
            },
          ],
        },
      ],
      profiles: [{ data: [{ id: 'p-1', user_id: 'u-1', name: 'Ana Supervisora' }] }],
    };

    const pagina = await fetchContactAuditPage(filtros());

    expect(pagina.eventos).toHaveLength(1);
    expect(pagina.eventos[0]).toMatchObject({
      contactId: 'c-1',
      operation: 'delete',
      markerFrom: null,
      markerTo: '2026-11-20T10:00:00.000Z',
      contact: { name: 'Maria Souza' },
      authorName: 'Ana Supervisora',
    });
    expect(pagina.hasMore).toBe(false);
  });

  it('mantém a linha quando o autor não existe mais em profiles', async () => {
    h.fila = {
      contact_deletion_audit: [{ data: [linha({ performed_by: 'servico', performed_by_profile: null })] }],
      contacts: [{ data: [] }],
      profiles: [{ data: [] }],
    };

    const pagina = await fetchContactAuditPage(filtros());

    expect(pagina.eventos).toHaveLength(1);
    expect(pagina.eventos[0].authorName).toBeNull();
    expect(pagina.eventos[0].contact).toBeNull();
    expect(pagina.eventos[0].performedByDbRole).toBe('authenticated');
  });

  it('descarta operação fora do contrato do tipo (bloqueio com "delete")', async () => {
    h.fila = {
      contact_block_audit: [
        {
          data: [
            linha({ id: 9, operation: 'delete', blocked_at_from: null, blocked_at_to: null }),
            linha({ id: 10, operation: 'block', blocked_at_to: '2026-11-20T10:00:00.000Z' }),
          ],
        },
      ],
      contacts: [{ data: [] }],
      profiles: [{ data: [] }],
    };

    const pagina = await fetchContactAuditPage(filtros({ kind: 'block' }));

    expect(pagina.eventos.map((e) => e.id)).toEqual(['10']);
  });

  it('prova que existe mais pedindo uma linha além da página', async () => {
    const muitas = Array.from({ length: CONTACT_AUDIT_PAGE + 1 }, (_, i) =>
      linha({ id: i + 1, contact_id: `c-${i + 1}` }),
    );
    h.fila = {
      contact_deletion_audit: [{ data: muitas }],
      contacts: [{ data: [] }],
      profiles: [{ data: [] }],
    };

    const pagina = await fetchContactAuditPage(filtros(), 400);

    expect(pagina.eventos).toHaveLength(CONTACT_AUDIT_PAGE);
    expect(pagina.hasMore).toBe(true);
    expect(pagina.proximoOffset).toBe(400 + CONTACT_AUDIT_PAGE);
    const consulta = h.ops.find((o) => o.table === 'contact_deletion_audit');
    expect(consulta?.filtros).toContainEqual(['range', 400, 400 + CONTACT_AUDIT_PAGE]);
  });

  it('leva operação, período e ids da busca para o servidor', async () => {
    h.fila = {
      contacts: [{ data: [{ id: 'c-1' }, { id: 'c-2' }] }, { data: [] }],
      contact_deletion_audit: [{ data: [] }],
      profiles: [{ data: [] }],
    };

    await fetchContactAuditPage(
      filtros({ operation: 'restore', period: 7, search: 'maria' }),
    );

    const busca = h.ops.find((o) => o.table === 'contacts');
    expect(busca?.filtros).toContainEqual(['or', 'name.ilike.%maria%,phone.ilike.%maria%']);

    const consulta = h.ops.find((o) => o.table === 'contact_deletion_audit');
    expect(consulta?.filtros).toContainEqual(['eq', 'operation', 'restore']);
    expect(consulta?.filtros).toContainEqual(['in', 'contact_id', ['c-1', 'c-2']]);
    const janela = consulta?.filtros.find((f) => f[0] === 'gte');
    expect(janela?.[1]).toBe('performed_at');
    expect(typeof janela?.[2]).toBe('string');
  });

  it('busca sem contato correspondente não consulta a trilha', async () => {
    h.fila = { contacts: [{ data: [] }] };

    const pagina = await fetchContactAuditPage(filtros({ search: 'inexistente' }));

    expect(pagina.eventos).toEqual([]);
    expect(pagina.hasMore).toBe(false);
    expect(h.ops.some((o) => o.table === 'contact_deletion_audit')).toBe(false);
  });

  it('sem filtro de operação não manda "eq" de operação', async () => {
    h.fila = { contact_deletion_audit: [{ data: [] }] };

    await fetchContactAuditPage(filtros({ operation: 'todas', period: 0 }));

    const consulta = h.ops.find((o) => o.table === 'contact_deletion_audit');
    expect(consulta?.filtros.some((f) => f[0] === 'eq')).toBe(false);
    expect(consulta?.filtros.some((f) => f[0] === 'gte')).toBe(false);
  });
});

describe('useContactAuditTrail', () => {
  const criarWrapper = () => {
    const cliente = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const Wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: cliente }, children);
    return Wrapper;
  };

  it('expõe os eventos da página e o estado de carregamento', async () => {
    h.fila = {
      contact_deletion_audit: [{ data: [linha({ id: 5, contact_id: 'c-5' })] }],
      contacts: [{ data: [{ id: 'c-5', name: 'João', phone: null, deleted_at: null, blocked_at: null }] }],
      profiles: [{ data: [] }],
    };

    const { result } = renderHook(() => useContactAuditTrail(filtros()), {
      wrapper: criarWrapper(),
    });

    await waitFor(() => expect(result.current.eventos).toHaveLength(1));
    expect(result.current.eventos[0].contact?.name).toBe('João');
    expect(result.current.isError).toBe(false);
    expect(result.current.hasMore).toBe(false);
  });

  it('vira erro quando o PostgREST recusa a leitura (RLS)', async () => {
    h.fila = {
      contact_deletion_audit: [{ data: null, error: { message: 'permission denied' } }],
    };

    const { result } = renderHook(() => useContactAuditTrail(filtros()), {
      wrapper: criarWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.eventos).toEqual([]);
  });
});
