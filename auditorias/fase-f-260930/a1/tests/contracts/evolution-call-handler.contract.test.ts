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

const { handleCallEvent } = await import('../../supabase/functions/_shared/evolution-webhook-handlers.ts');

interface SupabaseSimulation {
  client: {
    from: (table: string) => Record<string, unknown>;
    rpc: (name: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;
  };
  rpcCalls: Array<{ name: string; params: Record<string, unknown> }>;
}

function createSupabaseSimulation(rpcError: Record<string, unknown> | null = null): SupabaseSimulation {
  const rpcCalls: Array<{ name: string; params: Record<string, unknown> }> = [];

  return {
    rpcCalls,
    client: {
      from(table: string) {
        throw new Error(`Unexpected table in call simulation: ${table}`);
      },
      async rpc(name: string, params: Record<string, unknown>) {
        rpcCalls.push({ name, params });
        return { data: rpcError ? null : [{ call_id: 'call-1' }], error: rpcError };
      },
    },
  };
}

describe('Evolution call handler contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    helperMocks.getConnectionByInstance.mockResolvedValue({ id: 'connection-1' });
    helperMocks.getContactByPhone.mockResolvedValue({
      id: 'contact-1',
      avatar_url: null,
      assigned_to: 'profile-1',
      name: 'Maria',
    });
  });

  it('persists and notifies a ringing call once with normalized boolean metadata', async () => {
    const simulation = createSupabaseSimulation();

    await handleCallEvent(simulation.client, 'instance-1', {
      id: 'event-1',
      from: '5511999999999@s.whatsapp.net',
      isVideo: 'false',
      status: ' OFFER ',
    });

    expect(simulation.rpcCalls).toEqual([
      {
        name: 'record_incoming_call_event',
        params: {
          p_contact_id: 'contact-1',
          p_whatsapp_connection_id: 'connection-1',
          p_status: 'ringing',
          p_is_video: false,
          p_provider_event_id: 'event-1',
          p_should_notify: true,
        },
      },
    ]);
  });

  it.each([
    ['answered', 'answered'],
    ['terminate', 'ended'],
    ['reject', 'missed'],
    ['timeout', 'missed'],
    ['busy', 'busy'],
    ['failed', 'failed'],
  ] as const)('persists terminal status %s as %s without creating a ringing notification', async (source, expected) => {
    const simulation = createSupabaseSimulation();

    await handleCallEvent(simulation.client, 'instance-1', {
      from: '5511999999999@s.whatsapp.net',
      status: source,
    });

    expect(simulation.rpcCalls).toHaveLength(1);
    expect(simulation.rpcCalls[0]?.params).toMatchObject({
      p_status: expected,
      p_should_notify: false,
    });
  });

  it('propagates atomic persistence failures so the webhook returns a retryable error', async () => {
    const simulation = createSupabaseSimulation({ code: 'XX001' });
    await expect(handleCallEvent(simulation.client, 'instance-1', {
      from: '5511999999999@s.whatsapp.net',
      status: 'ringing',
      isVideo: true,
    })).rejects.toThrow('Unable to persist incoming call event');
  });

  it('fails closed before persistence when caller identity is absent', async () => {
    const simulation = createSupabaseSimulation();

    await handleCallEvent(simulation.client, 'instance-1', { status: 'offer' });

    expect(helperMocks.getConnectionByInstance).not.toHaveBeenCalled();
    expect(simulation.rpcCalls).toHaveLength(0);
  });
});
