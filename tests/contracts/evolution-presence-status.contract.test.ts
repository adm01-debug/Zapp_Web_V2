import { beforeEach, describe, expect, it, vi } from 'vitest';

const helperMocks = vi.hoisted(() => ({
  getConnectionByInstance: vi.fn(),
  getContactByPhone: vi.fn(),
}));

vi.mock('../../supabase/functions/_shared/evolution-helpers.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../supabase/functions/_shared/evolution-helpers.ts')>();
  return {
    ...actual,
    getConnectionByInstance: helperMocks.getConnectionByInstance,
    getContactByPhone: helperMocks.getContactByPhone,
  };
});

const { handlePresenceUpdate } = await import('../../supabase/functions/_shared/evolution-webhook-handlers.ts');

const JID = '551188887777@s.whatsapp.net';

interface Sim {
  client: {
    from: (table: string) => Record<string, unknown>;
    channel: (name: string) => { send: (msg: Record<string, unknown>) => Promise<void> };
    removeChannel: () => void;
  };
  updates: Array<{ table: string; payload: Record<string, unknown> }>;
  broadcasts: Array<Record<string, unknown>>;
}

// Stub mínimo do cliente Supabase: só o que handlePresenceUpdate usa — uma
// leitura de `contacts.presence_status`, o update em `contacts` e o broadcast.
function createSim(presencaAtual: string | null = null): Sim {
  const updates: Sim['updates'] = [];
  const broadcasts: Sim['broadcasts'] = [];
  let selected = '';

  const client: Sim['client'] = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      const resolve = () => {
        if (selected.includes('presence_status')) {
          return Promise.resolve({ data: { presence_status: presencaAtual }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      };
      chain.select = (cols: string) => { selected = cols; return chain; };
      chain.update = (payload: Record<string, unknown>) => { updates.push({ table, payload }); return chain; };
      for (const metodo of ['eq', 'neq', 'in', 'order', 'limit']) chain[metodo] = () => chain;
      chain.maybeSingle = () => resolve();
      chain.single = () => resolve();
      chain.then = (onFulfilled: (v: unknown) => unknown) => resolve().then(onFulfilled);
      return chain;
    },
    channel(name: string) {
      return {
        send: async (msg: Record<string, unknown>) => { broadcasts.push({ name, ...msg }); },
      };
    },
    removeChannel: () => {},
  };

  return { client, updates, broadcasts };
}

function atualizacaoDeContato(sim: Sim): Record<string, unknown> | undefined {
  return sim.updates.find((u) => u.table === 'contacts')?.payload;
}

describe('Presença online/offline do contato (presence.update)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    helperMocks.getConnectionByInstance.mockResolvedValue({ id: 'connection-1' });
    helperMocks.getContactByPhone.mockResolvedValue({
      id: 'contact-1', avatar_url: null, assigned_to: null, name: 'Maria',
    });
  });

  it('online grava presence_status e presence_updated_at e não toca last_seen_at', async () => {
    const sim = createSim(null);
    await handlePresenceUpdate(sim.client, 'instance-1', { id: JID, status: 'online' });

    const payload = atualizacaoDeContato(sim);
    expect(payload?.presence_status).toBe('online');
    expect(typeof payload?.presence_updated_at).toBe('string');
    expect(payload).not.toHaveProperty('last_seen_at');
  });

  it("'available' conta como online", async () => {
    const sim = createSim(null);
    await handlePresenceUpdate(sim.client, 'instance-1', { id: JID, status: 'available' });

    expect(atualizacaoDeContato(sim)?.presence_status).toBe('online');
  });

  it('offline depois de online grava offline e marca last_seen_at (transição)', async () => {
    const sim = createSim('online');
    await handlePresenceUpdate(sim.client, 'instance-1', { id: JID, status: 'offline' });

    const payload = atualizacaoDeContato(sim);
    expect(payload?.presence_status).toBe('offline');
    expect(typeof payload?.last_seen_at).toBe('string');
  });

  it('offline quando já estava offline NÃO reescreve last_seen_at', async () => {
    const sim = createSim(null);
    await handlePresenceUpdate(sim.client, 'instance-1', { id: JID, status: 'offline' });

    const payload = atualizacaoDeContato(sim);
    expect(payload?.presence_status).toBe('offline');
    expect(payload).not.toHaveProperty('last_seen_at');
  });

  it('composing inalterado: avisa digitando e não grava presença', async () => {
    const sim = createSim(null);
    await handlePresenceUpdate(sim.client, 'instance-1', {
      id: JID, presences: { [JID]: { lastKnownPresence: 'composing' } },
    });

    expect(sim.updates).toHaveLength(0);
    const broadcast = sim.broadcasts[0]?.payload as { isTyping?: boolean } | undefined;
    expect(broadcast?.isTyping).toBe(true);
  });

  it('paused inalterado: desliga digitando e não grava presença', async () => {
    const sim = createSim(null);
    await handlePresenceUpdate(sim.client, 'instance-1', {
      id: JID, presences: { [JID]: { lastKnownPresence: 'paused' } },
    });

    expect(sim.updates).toHaveLength(0);
    const broadcast = sim.broadcasts[0]?.payload as { isTyping?: boolean } | undefined;
    expect(broadcast?.isTyping).toBe(false);
  });

  it('grupo (@g.us) não grava presença de contato', async () => {
    const sim = createSim(null);
    await handlePresenceUpdate(sim.client, 'instance-1', { id: '12345@g.us', status: 'online' });

    expect(sim.updates).toHaveLength(0);
    expect(sim.broadcasts).toHaveLength(0);
  });
});
