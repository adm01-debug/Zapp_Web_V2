/**
 * Hooks de escopo de SLA — `useSLAScopeNames`, `useSLAScopeOptions` e `useSLARulesCounts`.
 *
 * O sujeito é o hook REAL; a dublagem é a fronteira de rede (`supabase.from`), que
 * registra operação/filtros e responde o que o teste manda. Fica provado que: id
 * corrompido NUNCA vira filtro `.in` (id que não é UUID faz o PostgREST recusar a
 * consulta INTEIRA e a lista de regras fica vazia), id válido vira filtro, o gate de
 * escopo/abertura não dispara consulta fora de hora, a contagem por escopo respeita a
 * precedência da hierarquia (contato > empresa > cargo > tipo > fila > agente) e o
 * `staleTime` declarado faz a remontagem ler o cache em vez de refazer a consulta.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  ops: [] as Array<{ table: string; filters: unknown[][] }>,
  tables: {} as Record<string, { data: unknown; error: unknown }>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const entry: { table: string; filters: unknown[][] } = { table, filters: [] };
      h.ops.push(entry);
      const builder: Record<string, unknown> = {};
      const mesmo = () => builder;
      builder.select = (...a: unknown[]) => {
        entry.filters.push(['select', ...a]);
        return mesmo();
      };
      builder.in = (...a: unknown[]) => {
        entry.filters.push(['in', ...a]);
        return mesmo();
      };
      builder.not = (...a: unknown[]) => {
        entry.filters.push(['not', ...a]);
        return mesmo();
      };
      builder.or = (...a: unknown[]) => {
        entry.filters.push(['or', ...a]);
        return mesmo();
      };
      builder.eq = (...a: unknown[]) => {
        entry.filters.push(['eq', ...a]);
        return mesmo();
      };
      builder.limit = (...a: unknown[]) => {
        entry.filters.push(['limit', ...a]);
        return mesmo();
      };
      builder.then = (ok?: (v: unknown) => unknown, falhou?: (e: unknown) => unknown) =>
        Promise.resolve(h.tables[table] ?? { data: [], error: null }).then(ok, falhou);
      return builder;
    },
  },
}));

import { useSLAScopeNames } from '../useSLAScopeNames';
import { useSLAScopeOptions } from '../useSLAScopeOptions';
import { useSLARulesCounts } from '../useSLARulesCounts';

const CONTATO = '11111111-1111-4111-8111-111111111111';
const FILA = '22222222-2222-4222-8222-222222222222';
const AGENTE = '33333333-3333-4333-8333-333333333333';

/** `staleTime: 0` no cliente: quem prova o TTL é o `staleTime` do PRÓPRIO hook. */
const cliente = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 0 } } });

const wrapperDe = (queryClient: QueryClient) =>
  ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

const consultasA = (table: string) => h.ops.filter((o) => o.table === table);
const filtrosDe = (table: string) => consultasA(table)[0]?.filters ?? [];

beforeEach(() => {
  h.ops = [];
  h.tables = {};
  vi.clearAllMocks();
});

describe('useSLAScopeNames — id corrompido não derruba a consulta', () => {
  it('id que não é UUID nunca vai para o `.in` (nenhuma consulta é montada)', async () => {
    h.tables.contacts = { data: [], error: null };
    const { result } = renderHook(
      () => useSLAScopeNames('contact', ['nao-e-uuid', '123'], [], []),
      { wrapper: wrapperDe(cliente()) },
    );

    await waitFor(() => expect(result.current.contactNames).toEqual({}));
    expect(consultasA('contacts')).toHaveLength(0);
  });

  it('id válido vira filtro `.in` e o mapa monta "nome (telefone)"', async () => {
    h.tables.contacts = { data: [{ id: CONTATO, name: 'Ana', phone: '1199' }], error: null };
    const { result } = renderHook(() => useSLAScopeNames('contact', [CONTATO], [], []), {
      wrapper: wrapperDe(cliente()),
    });

    await waitFor(() => expect(result.current.contactNames).toEqual({ [CONTATO]: 'Ana (1199)' }));
    expect(filtrosDe('contacts')).toContainEqual(['in', 'id', [CONTATO]]);
  });

  it('junta só os válidos e descarta o corrompido do filtro', async () => {
    h.tables.contacts = { data: [{ id: CONTATO, name: 'Ana', phone: '1199' }], error: null };
    const { result } = renderHook(
      () => useSLAScopeNames('contact', ['corrompido', CONTATO], [], []),
      { wrapper: wrapperDe(cliente()) },
    );

    await waitFor(() => expect(result.current.contactNames).toHaveProperty(CONTATO));
    expect(filtrosDe('contacts')).toContainEqual(['in', 'id', [CONTATO]]);
  });

  it('escopo de fila só consulta `queues` (o gate de escopo fecha as outras tabelas)', async () => {
    h.tables.queues = { data: [{ id: FILA, name: 'Suporte' }], error: null };
    const { result } = renderHook(() => useSLAScopeNames('queue', [CONTATO], [FILA], [AGENTE]), {
      wrapper: wrapperDe(cliente()),
    });

    await waitFor(() => expect(result.current.queueNames).toEqual({ [FILA]: 'Suporte' }));
    expect(consultasA('contacts')).toHaveLength(0);
    expect(consultasA('profiles')).toHaveLength(0);
  });

  it('escopo de agente resolve o nome em `profiles`', async () => {
    h.tables.profiles = { data: [{ id: AGENTE, name: 'Bruno' }], error: null };
    const { result } = renderHook(() => useSLAScopeNames('agent', [], [], [AGENTE]), {
      wrapper: wrapperDe(cliente()),
    });

    await waitFor(() => expect(result.current.agentNames).toEqual({ [AGENTE]: 'Bruno' }));
    expect(filtrosDe('profiles')).toContainEqual(['in', 'id', [AGENTE]]);
  });

  it('sem ids (lista vazia) o gate desliga a consulta', async () => {
    renderHook(() => useSLAScopeNames('contact', [], [], []), { wrapper: wrapperDe(cliente()) });
    await waitFor(() => expect(h.ops).toHaveLength(0));
  });
});

describe('useSLAScopeOptions — catálogos do formulário', () => {
  it('diálogo fechado não consulta nenhum catálogo', async () => {
    renderHook(() => useSLAScopeOptions(false, 'company', ''), { wrapper: wrapperDe(cliente()) });
    await waitFor(() => expect(h.ops).toHaveLength(0));
  });

  it('empresas: deduplica e descarta o vazio', async () => {
    h.tables.contacts = {
      data: [{ company: 'Acme' }, { company: 'Acme' }, { company: null }, { company: 'Globex' }],
      error: null,
    };
    const { result } = renderHook(() => useSLAScopeOptions(true, 'company', ''), {
      wrapper: wrapperDe(cliente()),
    });

    await waitFor(() => expect(result.current.companies).toEqual(['Acme', 'Globex']));
    expect(filtrosDe('contacts')).toContainEqual(['not', 'company', 'is', null]);
  });

  it('busca de contato com menos de 2 letras não consulta; com 2+ escapa o termo e limita em 20', async () => {
    const queryClient = cliente();
    const { result, rerender } = renderHook(
      ({ termo }: { termo: string }) => useSLAScopeOptions(true, 'contact', termo),
      { wrapper: wrapperDe(queryClient), initialProps: { termo: 'a' } },
    );
    await waitFor(() => expect(h.ops).toHaveLength(0));

    rerender({ termo: 'ana' });
    await waitFor(() => expect(consultasA('contacts')).toHaveLength(1));
    // O termo vai entre aspas (escapado) — vírgula/parêntese do usuário não injeta condição.
    expect(filtrosDe('contacts')).toContainEqual([
      'or',
      'name.ilike."%ana%",phone.ilike."%ana%"',
    ]);
    expect(filtrosDe('contacts')).toContainEqual(['limit', 20]);
    expect(result.current.contacts).toEqual([]);
  });

  it('staleTime: remontar dentro do TTL lê o cache e NÃO refaz a consulta', async () => {
    h.tables.queues = { data: [{ id: FILA, name: 'Suporte' }], error: null };
    const queryClient = cliente();
    const wrapper = wrapperDe(queryClient);

    const um = renderHook(() => useSLAScopeOptions(true, 'queue', ''), { wrapper });
    await waitFor(() => expect(um.result.current.queues).toHaveLength(1));
    um.unmount();

    const dois = renderHook(() => useSLAScopeOptions(true, 'queue', ''), { wrapper });
    await waitFor(() => expect(dois.result.current.queues).toHaveLength(1));

    expect(consultasA('queues')).toHaveLength(1);
  });
});

describe('useSLARulesCounts — contagem por escopo', () => {
  const linha = (extra: Record<string, unknown>) => ({
    contact_id: null,
    company: null,
    job_title: null,
    contact_type: null,
    queue_id: null,
    agent_id: null,
    ...extra,
  });

  it('conta cada escopo e respeita a precedência da hierarquia', async () => {
    h.tables.sla_rules = {
      data: [
        // A linha do contato também tem empresa/cargo: conta UMA vez, no escopo mais específico.
        linha({ contact_id: CONTATO, company: 'Acme', job_title: 'Diretor' }),
        linha({ company: 'Acme' }),
        linha({ job_title: 'Analista' }),
        linha({ contact_type: 'lead' }),
        linha({ queue_id: FILA }),
        linha({ agent_id: AGENTE }),
      ],
      error: null,
    };
    const { result } = renderHook(() => useSLARulesCounts(), { wrapper: wrapperDe(cliente()) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      contact: 1,
      company: 1,
      job_title: 1,
      contact_type: 1,
      queue: 1,
      agent: 1,
    });
  });

  it('leitura vazia zera todos os escopos', async () => {
    h.tables.sla_rules = { data: null, error: null };
    const { result } = renderHook(() => useSLARulesCounts(), { wrapper: wrapperDe(cliente()) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      contact: 0,
      company: 0,
      job_title: 0,
      contact_type: 0,
      queue: 0,
      agent: 0,
    });
  });

  it('staleTime: remontar dentro do TTL lê o cache e NÃO refaz a consulta', async () => {
    h.tables.sla_rules = { data: [linha({ queue_id: FILA })], error: null };
    const queryClient = cliente();
    const wrapper = wrapperDe(queryClient);

    const um = renderHook(() => useSLARulesCounts(), { wrapper });
    await waitFor(() => expect(um.result.current.data?.queue).toBe(1));
    um.unmount();

    const dois = renderHook(() => useSLARulesCounts(), { wrapper });
    await waitFor(() => expect(dois.result.current.data?.queue).toBe(1));

    expect(consultasA('sla_rules')).toHaveLength(1);
  });
});
