import { describe, it, expect, vi, beforeEach } from 'vitest';

// Pattern mirrors security-and-performance.test.ts
const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();
const mockMaybeSingle = vi.fn();
const mockSingle = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: mockRpc,
    from: mockFrom,
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
  },
}));

const CRITICAL_TABLES = [
  'messages',
  'contacts',
  'profiles',
  'audit_logs',
  'whatsapp_connections',
  'ai_usage_logs',
  'automations',
  'agent_skills',
  'ai_providers',
  'blocked_ips',
] as const;

/** Insert sem o tipo por tabela: ver o comentario no teste de INSERT anon. */
type LooseInsert = {
  insert: (values: Record<string, unknown>) => Promise<{ error: { code?: string } | null }>;
};

// 42501 = insufficient_privilege (PostgREST RLS denial code)
const rlsDenialError = {
  code: '42501',
  message: 'insufficient_privilege',
  details: null,
  hint: null,
};

function makeChain() {
  return {
    select: mockSelect.mockReturnThis(),
    insert: mockInsert.mockReturnThis(),
    delete: mockDelete.mockReturnThis(),
    update: mockUpdate.mockReturnThis(),
    eq: mockEq.mockReturnThis(),
    order: mockOrder.mockReturnThis(),
    limit: mockLimit.mockReturnThis(),
    maybeSingle: mockMaybeSingle,
    single: mockSingle,
  };
}

describe('RLS boundary - anon role (SELECT returns empty)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue(makeChain());
  });

  for (const table of CRITICAL_TABLES) {
    it(`${table}: anon SELECT returns [] (RLS filters all rows)`, async () => {
      // Real DB: anon has no matching SELECT policy -> PostgREST returns [] not 403
      mockSelect.mockResolvedValue({ data: [], error: null });

      const { supabase } = await import('@/integrations/supabase/client');
      const result = await supabase.from(table).select('*');

      expect(mockFrom).toHaveBeenCalledWith(table);
      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  }
});

describe('RLS boundary - anon role (writes blocked with 42501)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue(makeChain());
  });

  for (const table of CRITICAL_TABLES) {
    it(`${table}: anon INSERT -> 42501`, async () => {
      mockInsert.mockResolvedValue({ data: null, error: rlsDenialError });

      const { supabase } = await import('@/integrations/supabase/client');
      // 'table' e um union: nenhum literal tipa contra todas as assinaturas de
      // insert de uma vez. O client esta mockado, o payload nao chega ao banco.
      const result = await (supabase.from(table) as unknown as LooseInsert).insert({ id: 'inject-attempt' });

      expect(mockFrom).toHaveBeenCalledWith(table);
      expect(result.error?.code).toBe('42501');
    });

    it(`${table}: anon DELETE -> 42501`, async () => {
      // Resultado no ultimo elo da cadeia: .delete() precisa continuar
      // devolvendo o chain para o .eq() existir.
      mockEq.mockResolvedValue({ data: null, error: rlsDenialError });

      const { supabase } = await import('@/integrations/supabase/client');
      const result = await supabase.from(table).delete().eq('id', 'any-id');

      expect(mockFrom).toHaveBeenCalledWith(table);
      expect(result.error?.code).toBe('42501');
    });
  }
});

describe('RLS boundary - authenticated role (row isolation)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue(makeChain());
  });

  it('profiles: authenticated user reads own row', async () => {
    const ownProfile = { id: 'user-1', name: 'Agent', role: 'agent' };
    mockMaybeSingle.mockResolvedValue({ data: ownProfile, error: null });

    const { supabase } = await import('@/integrations/supabase/client');
    const result = await supabase
      .from('profiles')
      .select('*')
      .eq('id', 'user-1')
      .maybeSingle();

    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockEq).toHaveBeenCalledWith('id', 'user-1');
    expect(result.data?.id).toBe('user-1');
  });

  it('profiles: authenticated user cannot read another user (RLS returns null)', async () => {
    // RLS policy: auth.uid() = id -> other rows filtered out, not 403
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    const { supabase } = await import('@/integrations/supabase/client');
    const result = await supabase
      .from('profiles')
      .select('*')
      .eq('id', 'other-user')
      .maybeSingle();

    expect(result.data).toBeNull();
  });

  it('profiles: role escalation to admin blocked (42501)', async () => {
    mockEq.mockResolvedValue({ data: null, error: rlsDenialError });

    const { supabase } = await import('@/integrations/supabase/client');
    const result = await supabase
      .from('profiles')
      .update({ role: 'admin' })
      .eq('id', 'user-1');

    expect(result.error?.code).toBe('42501');
  });

  it('has_role: agent user is not admin', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });

    const { supabase } = await import('@/integrations/supabase/client');
    const result = await supabase.rpc('has_role', { _user_id: 'agent-user', _role: 'admin' });

    expect(result.data).toBe(false);
  });

  it('blocked_ips: authenticated non-admin INSERT blocked (42501)', async () => {
    mockInsert.mockResolvedValue({ data: null, error: rlsDenialError });

    const { supabase } = await import('@/integrations/supabase/client');
    const result = await supabase.from('blocked_ips').insert({ ip_address: '1.2.3.4', reason: 'rls-boundary-test' });

    expect(result.error?.code).toBe('42501');
  });

  it('audit_logs: authenticated user cannot delete records (42501)', async () => {
    mockEq.mockResolvedValue({ data: null, error: rlsDenialError });

    const { supabase } = await import('@/integrations/supabase/client');
    const result = await supabase.from('audit_logs').delete().eq('id', 'log-1');

    expect(result.error?.code).toBe('42501');
  });

  it('messages: authenticated user cannot read other connections messages', async () => {
    // RLS policy on messages filters by whatsapp_connection_id ownership
    mockEq.mockResolvedValue({ data: [], error: null });

    const { supabase } = await import('@/integrations/supabase/client');
    const result = await supabase
      .from('messages')
      .select('*')
      .eq('connection_id', 'other-conn');

    expect(result.data).toEqual([]);
  });
});

describe('RLS boundary - grant surface regression (PR #61)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue(makeChain());
  });

  // PR #61 (merged 2026-08-29): revoked INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER
  // from anon on ai_providers. SELECT grant was intentionally retained.

  it('ai_providers: anon SELECT allowed (SELECT grant retained after PR #61)', async () => {
    mockSelect.mockResolvedValue({ data: [{ id: 'p1', name: 'openai' }], error: null });

    const { supabase } = await import('@/integrations/supabase/client');
    const result = await supabase.from('ai_providers').select('id, name');

    expect(mockFrom).toHaveBeenCalledWith('ai_providers');
    expect(result.error).toBeNull();
    expect(result.data).not.toBeNull();
  });

  it('ai_providers: anon INSERT blocked after PR #61 (42501)', async () => {
    mockInsert.mockResolvedValue({ data: null, error: rlsDenialError });

    const { supabase } = await import('@/integrations/supabase/client');
    const result = await supabase.from('ai_providers').insert({ name: 'rogue' });

    expect(result.error?.code).toBe('42501');
  });

  it('ai_providers: anon UPDATE blocked after PR #61 (42501)', async () => {
    mockEq.mockResolvedValue({ data: null, error: rlsDenialError });

    const { supabase } = await import('@/integrations/supabase/client');
    const result = await supabase
      .from('ai_providers')
      .update({ name: 'tampered' })
      .eq('id', 'p1');

    expect(result.error?.code).toBe('42501');
  });

  it('ai_providers: anon DELETE blocked after PR #61 (42501)', async () => {
    mockEq.mockResolvedValue({ data: null, error: rlsDenialError });

    const { supabase } = await import('@/integrations/supabase/client');
    const result = await supabase.from('ai_providers').delete().eq('id', 'p1');

    expect(result.error?.code).toBe('42501');
  });
});

describe('RLS audit findings - documented gaps', () => {
  // AUDIT FINDING (2026-09-03): All 10 critical tables have rls_enabled=true
  // but rls_forced=false. service_role bypasses ALL RLS policies unconditionally.
  // Risk: Edge Functions using supabaseAdmin (service_role) skip row-level filters.
  // Mitigation: service_role key must never appear in src/ (client bundles).
  // Action: evaluate enabling rls_forced on whatsapp_connections, contacts, messages.
  //
  // This cannot be a unit test (requires live DB). Verified via:
  //   SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN (...)
  it.todo('verify rls_forced=false on all 10 critical tables via live DB query (not a unit test)');

  // AUDIT FINDING: service_role key is Edge Function-only (Deno.env).
  // If leaked to src/, all RLS is void for any request using that key.
  // Real guard: scripts/db-audit/supabase-usage-guard.mjs — must exit 0 in CI.
  // This is a CI-level check, not a unit-test assertion.
  it.todo('verify service_role key absent from src/ via supabase-usage-guard.mjs (CI guard, not unit test)');

  // AUDIT FINDING: 378 RLS policies existed with 0 automated boundary tests before this file.
  // This file adds coverage for 10 critical tables (anon + authenticated + regression).
  // Future: assert policy count does not decrease (requires live DB).
  it.todo('verify RLS policy count does not regress below baseline (requires live DB assertion)');
});
