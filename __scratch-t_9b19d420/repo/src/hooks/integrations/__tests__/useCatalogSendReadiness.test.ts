import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fetchCatalogSendReadiness,
  normalizeCatalogPhone,
  useCatalogSendReadiness,
  READINESS_UNAVAILABLE_REASON,
} from '../useCatalogSendReadiness';

type QueryResult = { data: unknown; error: unknown };

/** Builder encadeável mínimo do PostgREST: qualquer método volta no próprio
 * thenable, então `.select().eq().limit()` resolve no resultado configurado. */
function mockQuery(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  ['select', 'eq', 'or', 'limit', 'maybeSingle'].forEach((method) => { builder[method] = vi.fn(self); });
  builder.then = (onFulfilled: (value: QueryResult) => unknown) => Promise.resolve(result).then(onFulfilled);
  return builder;
}

const mockFrom = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

const CONTACT = { id: 'c1', phone: '+55 (41) 9 9999-8888' };
const CONNECTED = { data: [{ id: 'conn-1' }], error: null };
const NOTHING_BLOCKED = { data: [], error: null };

function respond(connections: QueryResult, blacklist: QueryResult) {
  const connectionsBuilder = mockQuery(connections);
  const blacklistBuilder = mockQuery(blacklist);
  mockFrom.mockImplementation((table: string) =>
    table === 'whatsapp_connections' ? connectionsBuilder : blacklistBuilder);
  return { connectionsBuilder, blacklistBuilder };
}

describe('fetchCatalogSendReadiness (CT-08)', () => {
  beforeEach(() => { mockFrom.mockReset(); });

  it('bloqueia quando nenhuma conexão de WhatsApp está conectada', async () => {
    respond({ data: [], error: null }, NOTHING_BLOCKED);

    const readiness = await fetchCatalogSendReadiness(CONTACT);

    expect(readiness.blocked).toBe(true);
    expect(readiness.reason).toMatch(/conexão de WhatsApp/i);
    // Sem conexão não há o que perguntar sobre supressão.
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('bloqueia quando o contato está suprimido, buscando pelo telefone só com dígitos', async () => {
    const { blacklistBuilder } = respond(CONNECTED, { data: [{ id: 'b1', reason_code: 'opt_out' }], error: null });

    const readiness = await fetchCatalogSendReadiness(CONTACT);

    expect(readiness.blocked).toBe(true);
    expect(readiness.reason).toMatch(/supressão/i);
    const orFilter = (blacklistBuilder.or as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(orFilter).toContain('contact_id.eq.c1');
    expect(orFilter).toContain('phone.eq.5541999998888');
    expect(orFilter).toContain('expires_at.is.null');
    expect(orFilter).toContain('expires_at.gt.');
  });

  it('libera o envio com conexão conectada e contato fora da supressão', async () => {
    const { connectionsBuilder } = respond(CONNECTED, NOTHING_BLOCKED);

    const readiness = await fetchCatalogSendReadiness(CONTACT);

    expect(readiness).toEqual({ blocked: false, reason: null });
    expect((connectionsBuilder.eq as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual(['status', 'connected']);
  });

  it('normaliza o telefone mantendo só os dígitos', () => {
    expect(normalizeCatalogPhone('+55 (41) 9 9999-8888')).toBe('5541999998888');
    expect(normalizeCatalogPhone('')).toBe('');
  });
});

/**
 * R2-MOD-008 — o estado devolvido pelo hook diferencia "indisponível" de
 * "liberado". Antes, uma consulta rejeitada terminava com `checking: false`,
 * `blocked: false` e `reason: null`: a pré-validação falhava ABERTA e o envio
 * seguia sem nunca ter conferido conexão nem supressão.
 */
describe('useCatalogSendReadiness (CT-08 / R2-MOD-008)', () => {
  let client: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);

  beforeEach(() => {
    mockFrom.mockReset();
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
    });
  });

  it('enquanto consulta, marca checking e não libera', async () => {
    respond(CONNECTED, NOTHING_BLOCKED);

    const { result } = renderHook(() => useCatalogSendReadiness(CONTACT), { wrapper });

    expect(result.current.checking).toBe(true);
    expect(result.current.blocked).toBe(false);

    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.blocked).toBe(false);
    expect(result.current.unavailable).toBe(false);
  });

  it('falha da consulta impede prosseguir, com motivo do retry disponível', async () => {
    respond({ data: null, error: { message: 'rede fora' } }, NOTHING_BLOCKED);

    const { result } = renderHook(() => useCatalogSendReadiness(CONTACT), { wrapper });

    await waitFor(() => expect(result.current.unavailable).toBe(true));

    // O defeito: aqui antes vinha blocked=false/reason=null (permissivo).
    expect(result.current.blocked).toBe(true);
    expect(result.current.reason).toBe(READINESS_UNAVAILABLE_REASON);
    expect(result.current.reason).toMatch(/não foi possível verificar/i);
    expect(result.current.reason).toMatch(/tente de novo/i);
    expect(result.current.checking).toBe(false);
  });

  it('retry refaz a consulta e libera quando a verificação volta a responder', async () => {
    respond({ data: null, error: { message: 'rede fora' } }, NOTHING_BLOCKED);

    const { result } = renderHook(() => useCatalogSendReadiness(CONTACT), { wrapper });
    await waitFor(() => expect(result.current.unavailable).toBe(true));

    mockFrom.mockReset();
    respond(CONNECTED, NOTHING_BLOCKED);

    act(() => { result.current.retry(); });

    await waitFor(() => expect(result.current.unavailable).toBe(false));
    expect(mockFrom).toHaveBeenCalled();
    expect(result.current.blocked).toBe(false);
    expect(result.current.reason).toBeNull();
  });

  it('sem contato escolhido não consulta nada', () => {
    const { result } = renderHook(() => useCatalogSendReadiness(null), { wrapper });

    expect(mockFrom).not.toHaveBeenCalled();
    expect(result.current.checking).toBe(false);
    expect(result.current.blocked).toBe(false);
    expect(result.current.unavailable).toBe(false);
  });
});
