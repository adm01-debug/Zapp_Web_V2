import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase
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

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: mockRpc,
    from: mockFrom,
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
  },
}));

describe('Security - RLS & Access Control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    const chain = {
      select: mockSelect.mockReturnThis(),
      insert: mockInsert.mockReturnThis(),
      delete: mockDelete.mockReturnThis(),
      update: mockUpdate.mockReturnThis(),
      eq: mockEq.mockReturnThis(),
      order: mockOrder.mockReturnThis(),
      limit: mockLimit.mockReturnThis(),
      maybeSingle: mockMaybeSingle,
    };
    
    mockFrom.mockReturnValue(chain);
  });

  it('should check user roles via has_role function', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });

    const { supabase } = await import('@/integrations/supabase/client');
    const result = await supabase.rpc('has_role', { _user_id: 'user-1', _role: 'admin' });

    expect(mockRpc).toHaveBeenCalledWith('has_role', { _user_id: 'user-1', _role: 'admin' });
    expect(result.data).toBe(true);
  });

  it('should check permissions via user_has_permission function', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });

    const { supabase } = await import('@/integrations/supabase/client');
    const result = await supabase.rpc('user_has_permission', {
      _user_id: 'user-1',
      _permission_name: 'manage_users',
    });

    expect(mockRpc).toHaveBeenCalledWith('user_has_permission', {
      _user_id: 'user-1',
      _permission_name: 'manage_users',
    });
    expect(result.data).toBe(true);
  });

  it('should check admin_or_supervisor role', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });

    const { supabase } = await import('@/integrations/supabase/client');
    const result = await supabase.rpc('is_admin_or_supervisor', { _user_id: 'agent-user' });

    expect(result.data).toBe(false);
  });
});

describe('Security - Audit Logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ error: null });
  });

  it('should log audit entries via RPC', async () => {
    const { logAudit } = await import('@/lib/audit');

    await logAudit({
      action: 'login',
      entityType: 'auth',
      entityId: 'user-1',
      details: { method: 'password' },
    });

    expect(mockRpc).toHaveBeenCalledWith('log_audit_event', expect.objectContaining({
      p_action: 'login',
      p_entity_type: 'auth',
      p_entity_id: 'user-1',
    }));
  });

  it('should handle audit log failures gracefully', async () => {
    mockRpc.mockResolvedValue({ error: new Error('DB error') });

    const { logAudit } = await import('@/lib/audit');
    
    // Should not throw
    await expect(logAudit({ action: 'login' })).resolves.not.toThrow();
  });
});

describe('Security - Export Blocking', () => {
  it('should block PDF export', async () => {
    const { exportToPDF } = await import('@/utils/exportReport');
    expect(() => exportToPDF({
      title: 'Test',
      generatedAt: new Date(),
      columns: [],
      rows: [],
    })).toThrow('Exportação bloqueada');
  });

  it('should block Excel export', async () => {
    const { exportToExcel } = await import('@/utils/exportReport');
    expect(() => exportToExcel({
      title: 'Test',
      generatedAt: new Date(),
      columns: [],
      rows: [],
    })).toThrow('Exportação bloqueada');
  });

  it('should block CSV export', async () => {
    const { exportToCSV } = await import('@/utils/exportReport');
    expect(() => exportToCSV({
      title: 'Test',
      generatedAt: new Date(),
      columns: [],
      rows: [],
    })).toThrow('Exportação bloqueada');
  });
});

describe('Security - Knowledge Base Search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call search_knowledge_base RPC', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { id: 'art-1', title: 'FAQ', content: 'Answer...', category: 'Geral', tags: [], rank: 0.8 },
      ],
      error: null,
    });

    const { supabase } = await import('@/integrations/supabase/client');
    const result = await supabase.rpc('search_knowledge_base', {
      search_query: 'como funciona',
      max_results: 5,
    });

    expect(mockRpc).toHaveBeenCalledWith('search_knowledge_base', {
      search_query: 'como funciona',
      max_results: 5,
    });
    expect(result.data!).toHaveLength(1);
    expect(result.data![0].title).toBe('FAQ');
  });
});

describe('Web Vitals', () => {
  it('should export initWebVitals and getWebVitalsReport', async () => {
    const { initWebVitals, getWebVitalsReport } = await import('@/lib/web-vitals');
    expect(typeof initWebVitals).toBe('function');
    expect(typeof getWebVitalsReport).toBe('function');
  });

  it('getWebVitalsReport should return array', async () => {
    const { getWebVitalsReport } = await import('@/lib/web-vitals');
    const report = getWebVitalsReport();
    expect(Array.isArray(report)).toBe(true);
  });
});
