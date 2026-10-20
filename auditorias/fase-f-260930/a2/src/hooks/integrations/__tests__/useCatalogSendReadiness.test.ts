import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchCatalogSendReadiness, normalizeCatalogPhone } from '../useCatalogSendReadiness';

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
