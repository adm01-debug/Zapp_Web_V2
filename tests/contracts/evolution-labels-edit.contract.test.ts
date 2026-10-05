import { beforeEach, describe, expect, it, vi } from 'vitest';

const helperMocks = vi.hoisted(() => ({
  getConnectionByInstance: vi.fn(),
}));

vi.mock('../../supabase/functions/_shared/evolution-helpers.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../supabase/functions/_shared/evolution-helpers.ts')>();
  return {
    ...actual,
    getConnectionByInstance: helperMocks.getConnectionByInstance,
  };
});

const { handleLabelsEdit } = await import('../../supabase/functions/_shared/evolution-webhook-handlers.ts');

interface SupabaseSimulation {
  client: {
    rpc: (name: string, params: Record<string, unknown>) => Promise<{ error: null }>;
  };
  rpcCalls: Array<{ name: string; params: Record<string, unknown> }>;
}

function createSupabaseSimulation(): SupabaseSimulation {
  const rpcCalls: Array<{ name: string; params: Record<string, unknown> }> = [];
  return {
    rpcCalls,
    client: {
      async rpc(name: string, params: Record<string, unknown>) {
        rpcCalls.push({ name, params });
        return { error: null };
      },
    },
  };
}

describe('Evolution labels.edit handler contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    helperMocks.getConnectionByInstance.mockResolvedValue({ id: 'connection-a' });
  });

  it('renomeia o label escopado pela conexão da instância (p_connection_id)', async () => {
    const simulation = createSupabaseSimulation();

    await handleLabelsEdit(simulation.client, 'instancia-a', {
      id: '5',
      name: 'VIP',
      deleted: false,
    });

    expect(helperMocks.getConnectionByInstance).toHaveBeenCalledWith(expect.anything(), 'instancia-a');
    expect(simulation.rpcCalls).toEqual([
      {
        name: 'rename_wa_label_on_all_contacts',
        params: {
          p_connection_id: 'connection-a',
          p_label_prefix: 'wa:5:',
          p_new_tag: 'wa:5:VIP',
        },
      },
    ]);
  });

  it('apaga o label escopado pela conexão da instância (p_connection_id)', async () => {
    const simulation = createSupabaseSimulation();

    await handleLabelsEdit(simulation.client, 'instancia-a', {
      id: '5',
      name: 'VIP',
      deleted: true,
    });

    expect(simulation.rpcCalls).toEqual([
      {
        name: 'remove_wa_label_from_all_contacts',
        params: {
          p_connection_id: 'connection-a',
          p_label_prefix: 'wa:5:',
        },
      },
    ]);
  });

  it('não toca em contato algum quando a instância não corresponde a conexão', async () => {
    const simulation = createSupabaseSimulation();
    helperMocks.getConnectionByInstance.mockResolvedValue(null);

    await handleLabelsEdit(simulation.client, 'instancia-fantasma', {
      id: '5',
      name: 'VIP',
      deleted: false,
    });

    expect(simulation.rpcCalls).toHaveLength(0);
  });

  it('ignora evento sem labelId (sem chamada de RPC)', async () => {
    const simulation = createSupabaseSimulation();

    await handleLabelsEdit(simulation.client, 'instancia-a', { name: 'VIP', deleted: false });

    expect(helperMocks.getConnectionByInstance).not.toHaveBeenCalled();
    expect(simulation.rpcCalls).toHaveLength(0);
  });
});
