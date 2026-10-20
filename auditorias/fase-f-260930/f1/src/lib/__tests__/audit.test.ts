import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRpc = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { logAudit } from '@/lib/audit';

describe('audit logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ error: null });
  });

  it('calls log_audit_event RPC', async () => {
    await logAudit({
      action: 'login',
      entityType: 'auth',
      entityId: 'u1',
      details: { method: 'password' },
    });

    expect(mockRpc).toHaveBeenCalledWith('log_audit_event', expect.objectContaining({
      p_action: 'login',
      p_entity_type: 'auth',
      p_entity_id: 'u1',
    }));
  });

  it('handles RPC error without throwing', async () => {
    mockRpc.mockResolvedValue({ error: new Error('DB error') });

    await expect(logAudit({ action: 'login' })).resolves.not.toThrow();
  });

  it('includes details and user_agent', async () => {
    await logAudit({
      action: 'contact_created',
      entityType: 'contact',
      entityId: 'c1',
      details: { contactName: 'John' },
    });

    expect(mockRpc).toHaveBeenCalledWith('log_audit_event', expect.objectContaining({
      p_action: 'contact_created',
      p_entity_type: 'contact',
      p_entity_id: 'c1',
      p_details: { contactName: 'John' },
      p_user_agent: expect.any(String),
    }));
  });

  it('omite os campos opcionais nao informados (DEFAULT NULL no SQL)', async () => {
    await logAudit({ action: 'logout' });

    expect(mockRpc).toHaveBeenCalledWith('log_audit_event', expect.objectContaining({
      p_action: 'logout',
      p_entity_type: undefined,
      p_entity_id: undefined,
      p_details: null,
    }));
  });
});
