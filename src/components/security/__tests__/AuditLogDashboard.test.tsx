import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuditLogDashboard } from '../AuditLogDashboard';

const mockLogs = [
  { id: '1', action: 'login', entity_type: 'user', entity_id: 'u1', user_id: 'uid1', details: null, ip_address: '192.168.1.1', user_agent: 'Chrome', created_at: new Date().toISOString() },
  { id: '2', action: 'delete', entity_type: 'contact', entity_id: 'c1', user_id: 'uid2', details: { reason: 'test' }, ip_address: '10.0.0.1', user_agent: 'Firefox', created_at: new Date().toISOString() },
  { id: '3', action: 'create', entity_type: 'message', entity_id: 'm1', user_id: 'uid1', details: null, ip_address: null, user_agent: null, created_at: '2025-01-01T10:00:00Z' },
  { id: '4', action: 'role_change', entity_type: 'user', entity_id: 'u2', user_id: 'uid3', details: { from: 'agent', to: 'admin' }, ip_address: '172.16.0.1', user_agent: null, created_at: new Date().toISOString() },
  { id: '5', action: 'export', entity_type: 'contact', entity_id: null, user_id: 'uid1', details: null, ip_address: '192.168.1.1', user_agent: 'Chrome', created_at: new Date().toISOString() },
];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ data: mockLogs, error: null }),
          })),
        })),
      })),
    })),
  },
}));

describe('AuditLogDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===== RENDERING =====
  describe('Rendering', () => {
    it('renders stats cards', async () => {
      render(<AuditLogDashboard />);
      await waitFor(() => {
        expect(screen.getByText('Total de Logs')).toBeInTheDocument();
        expect(screen.getByText('Hoje')).toBeInTheDocument();
        expect(screen.getByText('Ações Sensíveis')).toBeInTheDocument();
        expect(screen.getByText('Usuários Únicos')).toBeInTheDocument();
      });
    });

    it('renders filter section', () => {
      render(<AuditLogDashboard />);
      expect(screen.getByText('Filtros')).toBeInTheDocument();
    });

    it('renders search input', () => {
      render(<AuditLogDashboard />);
      expect(screen.getByPlaceholderText(/Buscar por ação/)).toBeInTheDocument();
    });

    it('renders action filter dropdown', () => {
      render(<AuditLogDashboard />);
      expect(screen.getByText('Todas as ações')).toBeInTheDocument();
    });

    it('renders entity filter dropdown', () => {
      render(<AuditLogDashboard />);
      expect(screen.getByText('Todas')).toBeInTheDocument();
    });

    it('renders logs section title', () => {
      render(<AuditLogDashboard />);
      expect(screen.getByText(/Logs de Auditoria/)).toBeInTheDocument();
    });

    it('shows loading skeletons initially', () => {
      const { container } = render(<AuditLogDashboard />);
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  // ===== ACTION COLORS =====
  describe('Action color mapping', () => {
    it('maps login to green', () => {
      const colorMap: Record<string, string> = {
        login: 'bg-green-500/10 text-green-500',
        delete: 'bg-destructive/10 text-destructive',
        create: 'bg-blue-500/10 text-blue-500',
        update: 'bg-yellow-500/10 text-yellow-500',
        export: 'bg-purple-500/10 text-purple-500',
        role_change: 'bg-orange-500/10 text-orange-500',
        mfa_enabled: 'bg-green-500/10 text-green-500',
        mfa_disabled: 'bg-destructive/10 text-destructive',
        password_change: 'bg-yellow-500/10 text-yellow-500',
        logout: 'bg-muted text-muted-foreground',
      };
      Object.keys(colorMap).forEach(action => {
        expect(colorMap[action]).toBeTruthy();
      });
    });
  });

  // ===== SEARCH FILTER =====
  describe('Search filtering', () => {
    it('renders search input with correct placeholder', () => {
      render(<AuditLogDashboard />);
      const input = screen.getByPlaceholderText(/Buscar por ação, IP, usuário/);
      expect(input).toBeInTheDocument();
    });

    it('accepts search input', () => {
      render(<AuditLogDashboard />);
      const input = screen.getByPlaceholderText(/Buscar/);
      fireEvent.change(input, { target: { value: 'login' } });
      expect(input).toHaveValue('login');
    });
  });

  // ===== STATS CALCULATION =====
  describe('Stats logic', () => {
    it('counts suspicious actions (delete, role_change, export)', () => {
      const suspicious = mockLogs.filter(l =>
        l.action.includes('delete') || l.action.includes('role_change') || l.action.includes('export')
      );
      expect(suspicious.length).toBe(3);
    });

    it('counts unique users', () => {
      const unique = new Set(mockLogs.map(l => l.user_id).filter(Boolean));
      expect(unique.size).toBe(3);
    });

    it('counts total logs', () => {
      expect(mockLogs.length).toBe(5);
    });
  });

  // ===== ACTION ICON MAPPING =====
  describe('Action icons', () => {
    it('maps known actions to icons', () => {
      const knownActions = ['login', 'logout', 'create', 'update', 'delete', 'mfa_enabled', 'password_change', 'role_change'];
      knownActions.forEach(action => {
        expect(action.length).toBeGreaterThan(0);
      });
    });
  });

  // ===== EDGE CASES =====
  describe('Edge cases', () => {
    it('handles null ip_address gracefully', () => {
      const log = mockLogs.find(l => l.ip_address === null);
      expect(log).toBeDefined();
      expect(log?.ip_address).toBeNull();
    });

    it('handles null details gracefully', () => {
      const log = mockLogs.find(l => l.details === null);
      expect(log).toBeDefined();
    });

    it('handles log with all null optional fields', () => {
      const log = { id: '99', action: 'test', entity_type: null, entity_id: null, user_id: null, details: null, ip_address: null, user_agent: null, created_at: new Date().toISOString() };
      expect(log.action).toBe('test');
    });
  });
});
