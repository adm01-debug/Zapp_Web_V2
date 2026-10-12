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

const { handleLabelsEdit, handleLabelsAssociation } = await import(
  '../../supabase/functions/_shared/evolution-webhook-handlers.ts'
);

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

describe('Evolution labels.* handlers: evento recebido e ignorado (etiquetas de contato removidas)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    helperMocks.getConnectionByInstance.mockResolvedValue({ id: 'connection-a' });
    helperMocks.getContactByPhone.mockResolvedValue({ id: 'contact-a' });
  });

  it('labels.edit não espelha etiqueta em contacts.tags (nenhuma RPC de label)', async () => {
    const simulation = createSupabaseSimulation();

    await handleLabelsEdit(simulation.client, 'instancia-a', {
      id: '5',
      name: 'VIP',
      deleted: false,
    });

    expect(simulation.rpcCalls).toHaveLength(0);
    expect(helperMocks.getConnectionByInstance).not.toHaveBeenCalled();
  });

  it('labels.edit com label apagado também não toca contato algum', async () => {
    const simulation = createSupabaseSimulation();

    await handleLabelsEdit(simulation.client, 'instancia-a', { id: '5', name: 'VIP', deleted: true });

    expect(simulation.rpcCalls).toHaveLength(0);
    expect(helperMocks.getConnectionByInstance).not.toHaveBeenCalled();
  });

  it('labels.association não toca contato algum (nenhuma RPC de tag)', async () => {
    const simulation = createSupabaseSimulation();

    await handleLabelsAssociation(simulation.client, 'instancia-a', {
      labelId: '5',
      chatId: '5511999999999@s.whatsapp.net',
      type: 'add',
      label: { id: '5', name: 'VIP' },
    });

    expect(simulation.rpcCalls).toHaveLength(0);
    expect(helperMocks.getConnectionByInstance).not.toHaveBeenCalled();
    expect(helperMocks.getContactByPhone).not.toHaveBeenCalled();
  });

  it('labels.association de remoção também não toca contato algum', async () => {
    const simulation = createSupabaseSimulation();

    await handleLabelsAssociation(simulation.client, 'instancia-a', {
      labelId: '5',
      chatId: '5511999999999@s.whatsapp.net',
      type: 'remove',
    });

    expect(simulation.rpcCalls).toHaveLength(0);
    expect(helperMocks.getConnectionByInstance).not.toHaveBeenCalled();
    expect(helperMocks.getContactByPhone).not.toHaveBeenCalled();
  });
});
