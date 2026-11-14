import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

import { transferConversation, transferErrorMessage, TRANSFER_CONFLICT_MESSAGE } from '../transferConversation';

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: 'evt-1', error: null });
});

describe('transferConversation — compare-and-set do dono visto na tela', () => {
  it('dono conhecido vai como p_expected_agent_id', async () => {
    await transferConversation({ contactId: 'c1', toQueueId: 'q1', expectedAgentId: 'p1' });
    expect(rpc).toHaveBeenCalledWith('transfer_conversation', expect.objectContaining({ p_expected_agent_id: 'p1' }));
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('p_expect_unassigned');
  });

  it('sem dono vai como p_expect_unassigned=true', async () => {
    await transferConversation({ contactId: 'c1', toAgentId: 'p2', expectedAgentId: null });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_expect_unassigned: true });
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('p_expected_agent_id');
  });

  it('banco ainda sem o parâmetro (PGRST202) repete UMA vez sem ele', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } });
    const r = await transferConversation({ contactId: 'c1', toAgentId: 'p2', expectedAgentId: null });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1][1]).not.toHaveProperty('p_expect_unassigned');
    expect(r.data).toBe('evt-1');
  });

  it('40001 não repete e vira a mensagem de conflito', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '40001' } });
    const r = await transferConversation({ contactId: 'c1', toAgentId: 'p2', expectedAgentId: null });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(transferErrorMessage(r.error, 'Erro')).toBe(TRANSFER_CONFLICT_MESSAGE);
    expect(transferErrorMessage({ code: '42501' }, 'Erro')).toBe('Erro');
  });

  it('dono desconhecido: sem compare-and-set', async () => {
    await transferConversation({ contactId: 'c1', toAgentId: 'p2' });
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('p_expected_agent_id');
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('p_expect_unassigned');
  });
});
