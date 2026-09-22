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
  client: { from: (table: string) => Record<string, unknown> };
  calls: Array<Record<string, unknown>>;
  notifications: Array<Record<string, unknown>>;
}

function createSupabaseSimulation(profileUserId: string | null = 'user-1'): SupabaseSimulation {
  const calls: Array<Record<string, unknown>> = [];
  const notifications: Array<Record<string, unknown>> = [];

  return {
    calls,
    notifications,
    client: {
      from(table: string) {
        if (table === 'calls') {
          return {
            insert(payload: Record<string, unknown>) {
              calls.push(payload);
              return {
                select: () => ({
                  maybeSingle: async () => ({
                    data: { id: `call-${calls.length}`, started_at: payload.started_at },
                    error: null,
                  }),
                }),
              };
            },
          };
        }

        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: profileUserId ? { user_id: profileUserId, name: 'Agente' } : null,
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === 'notifications') {
          return {
            insert: async (payload: Record<string, unknown>) => {
              notifications.push(payload);
              return { data: null, error: null };
            },
          };
        }

        throw new Error(`Unexpected table in call simulation: ${table}`);
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

    expect(simulation.calls).toHaveLength(1);
    expect(simulation.calls[0]).toMatchObject({
      contact_id: 'contact-1',
      whatsapp_connection_id: 'connection-1',
      agent_id: 'profile-1',
      direction: 'inbound',
      status: 'ringing',
      notes: 'Chamada de voz',
    });
    expect(simulation.notifications).toHaveLength(1);
    expect(simulation.notifications[0]).toMatchObject({
      user_id: 'user-1',
      type: 'incoming_call',
      metadata: {
        contact_id: 'contact-1',
        is_video: false,
        call_status: 'ringing',
        call_id: 'call-1',
        event_id: 'event-1',
      },
    });
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

    expect(simulation.calls).toHaveLength(1);
    expect(simulation.calls[0]?.status).toBe(expected);
    expect(simulation.notifications).toHaveLength(0);
  });

  it('keeps the call history but skips notification when no agent user can be resolved', async () => {
    const simulation = createSupabaseSimulation(null);

    await handleCallEvent(simulation.client, 'instance-1', {
      from: '5511999999999@s.whatsapp.net',
      status: 'ringing',
      isVideo: true,
    });

    expect(simulation.calls).toHaveLength(1);
    expect(simulation.calls[0]?.notes).toBe('Chamada de vídeo');
    expect(simulation.notifications).toHaveLength(0);
  });

  it('fails closed before persistence when caller identity is absent', async () => {
    const simulation = createSupabaseSimulation();

    await handleCallEvent(simulation.client, 'instance-1', { status: 'offer' });

    expect(helperMocks.getConnectionByInstance).not.toHaveBeenCalled();
    expect(simulation.calls).toHaveLength(0);
    expect(simulation.notifications).toHaveLength(0);
  });
});
