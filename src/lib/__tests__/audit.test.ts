import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRpc = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { logAudit, normalizeEntityId } from '@/lib/audit';

const UUID = '11111111-2222-4333-8444-555555555555';

describe('audit logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ error: null });
  });

  it('calls log_audit_event RPC', async () => {
    await logAudit({
      action: 'login',
      entityType: 'auth',
      entityId: UUID,
      details: { method: 'password' },
    });

    expect(mockRpc).toHaveBeenCalledWith('log_audit_event', expect.objectContaining({
      p_action: 'login',
      p_entity_type: 'auth',
      p_entity_id: UUID,
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
      entityId: UUID,
      details: { contactName: 'John' },
    });

    expect(mockRpc).toHaveBeenCalledWith('log_audit_event', expect.objectContaining({
      p_action: 'contact_created',
      p_entity_type: 'contact',
      p_entity_id: UUID,
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

  // R2 (acesso negado): a rota tentada NAO e UUID. O entityId ia cru para a coluna
  // uuid e o INSERT inteiro morria com 400 "invalid input syntax for type uuid",
  // perdendo o registro. Agora o texto vai para details.entity_id_text.
  it('rota nao-UUID nao vai para a coluna uuid e segue registrada nos detalhes', async () => {
    await logAudit({
      action: 'unauthorized_access',
      entityType: 'route',
      entityId: '/painel',
      details: { required: ['admin'], method: 'NAVIGATE' },
    });

    expect(mockRpc).toHaveBeenCalledWith('log_audit_event', expect.objectContaining({
      p_action: 'unauthorized_access',
      p_entity_type: 'route',
      p_entity_id: undefined,
      p_details: {
        required: ['admin'],
        method: 'NAVIGATE',
        entity_id_text: '/painel',
      },
    }));
  });

  it('rota nao-UUID sem detalhes ainda leva o texto para os detalhes', async () => {
    await logAudit({ action: 'unauthorized_access', entityType: 'route', entityId: '/config' });

    expect(mockRpc).toHaveBeenCalledWith('log_audit_event', expect.objectContaining({
      p_entity_id: undefined,
      p_details: { entity_id_text: '/config' },
    }));
  });

  it('rota com espacos nas bordas e aparada antes de ir para os detalhes', async () => {
    await logAudit({ action: 'unauthorized_access', entityType: 'route', entityId: '  /painel ' });

    expect(mockRpc).toHaveBeenCalledWith('log_audit_event', expect.objectContaining({
      p_details: { entity_id_text: '/painel' },
    }));
  });

  it('entityId vazio nao polui os detalhes', async () => {
    await logAudit({ action: 'login', entityId: '   ' });

    expect(mockRpc).toHaveBeenCalledWith('log_audit_event', expect.objectContaining({
      p_entity_id: undefined,
      p_details: null,
    }));
  });
});

describe('normalizeEntityId', () => {
  it('UUID valido passa para a coluna e mantem os detalhes', () => {
    expect(normalizeEntityId(UUID, { a: 1 })).toEqual({
      entityId: UUID,
      details: { a: 1 },
    });
  });

  it('UUID em caixa alta tambem e aceito', () => {
    const upper = UUID.toUpperCase();
    expect(normalizeEntityId(upper)).toEqual({ entityId: upper, details: null });
  });

  it('nao-UUID vira null na coluna e texto nos detalhes', () => {
    expect(normalizeEntityId('/painel')).toEqual({
      entityId: null,
      details: { entity_id_text: '/painel' },
    });
  });

  it('JID do WhatsApp (telefone) nao e UUID', () => {
    expect(normalizeEntityId('551146375517@s.whatsapp.net')).toEqual({
      entityId: null,
      details: { entity_id_text: '551146375517@s.whatsapp.net' },
    });
  });

  it('vazio/ausente devolve null sem detalhes inventados', () => {
    expect(normalizeEntityId(undefined)).toEqual({ entityId: null, details: null });
    expect(normalizeEntityId('   ')).toEqual({ entityId: null, details: null });
  });
});
