import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { appDayStart, appDayStartOfLocalDate, parseDayKey } from '@/lib/localDay';

// ---------------------------------------------------------------- massa
const log = (over: Record<string, unknown>) => ({
  id: '1', action: 'login', entity_type: 'user', entity_id: 'u1', user_id: 'uid1',
  actor_name: 'Ana Agente', details: null, ip_address: '192.168.1.1', user_agent: 'Chrome',
  created_at: new Date().toISOString(), ...over,
});

const mockLogs = [
  log({ id: '1', action: 'login', actor_name: 'Ana Agente' }),
  log({ id: '2', action: 'delete', entity_type: 'contact', user_id: 'uid2', actor_name: 'Bruno Lima', details: { reason: 'test' }, ip_address: '10.0.0.1' }),
  log({ id: '3', action: 'create', entity_type: 'message', user_id: 'uid1', actor_name: 'Ana Agente' }),
  log({ id: '4', action: 'role_change', entity_type: 'user', user_id: 'uid3', actor_name: 'Carla Souza', details: { from: 'agent', to: 'admin' }, ip_address: '172.16.0.1' }),
  log({ id: '5', action: 'export', entity_type: 'contact', user_id: 'uid1', actor_name: 'Ana Agente' }),
];

const RESUMO = {
  total_logs: 5, sensitive_actions: 3, unique_users: 3,
  denied_24h: 2, permission_changes_24h: 1, admin_logins_7d: 4, rls_failures_24h: 0,
};

// Estado da RPC falsa + papel do usuário logado.
const estado = vi.hoisted(() => ({
  dados: [] as unknown[],
  resumo: { total_logs: 0, sensitive_actions: 0, unique_users: 0, denied_24h: 0, permission_changes_24h: 0, admin_logins_7d: 0, rls_failures_24h: 0 },
  hojeTotal: 0,
  hojeFromISO: '',
  erro: null as string | null,
  chamadas: [] as Array<{ nome: string; args: Record<string, unknown> }>,
  papel: { isAdmin: true, loading: false },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn((nome: string, args: Record<string, unknown> = {}) => {
      estado.chamadas.push({ nome, args });
      if (estado.erro) return Promise.resolve({ data: null, error: { message: estado.erro } });
      if (nome === 'audit_log_summary') {
        const ehHoje = estado.hojeFromISO !== '' && args.p_from === estado.hojeFromISO;
        return Promise.resolve({ data: [{ ...estado.resumo, total_logs: ehHoje ? estado.hojeTotal : estado.resumo.total_logs }], error: null });
      }
      return Promise.resolve({ data: estado.dados, error: null });
    }),
  },
}));

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({
    hasRole: (r: string) => (r === 'admin' ? estado.papel.isAdmin : false),
    loading: estado.papel.loading,
  }),
}));

// Padrao do repo para Radix Select em jsdom (ver ContactToolbar.test.tsx): as
// opcoes ficam no DOM e o clique dispara o onValueChange do Select pai via contexto.
vi.mock('@/components/ui/select', async () => {
  const React = await import('react');
  const Contexto = React.createContext<(valor: string) => void>(() => {});
  const Select = ({ children, onValueChange }: { children?: ReactNode; onValueChange?: (v: string) => void }) => (
    <Contexto.Provider value={onValueChange ?? (() => {})}>{children}</Contexto.Provider>
  );
  const SelectTrigger = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const SelectValue = () => null;
  const SelectContent = ({ children }: { children?: ReactNode }) => <ul>{children}</ul>;
  const SelectItem = ({ children, value }: { children?: ReactNode; value: string }) => {
    const aoEscolher = React.useContext(Contexto);
    return (
      <li data-value={value} onClick={() => aoEscolher(value)}>
        {children}
      </li>
    );
  };
  return { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
});

import { AuditLogDashboard } from '../AuditLogDashboard';

const valorDoCartao = (rotulo: string) => screen.getByText(rotulo).previousElementSibling?.textContent;
const chamadasDe = (nome: string) => estado.chamadas.filter((c) => c.nome === nome);

describe('AuditLogDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estado.dados = mockLogs;
    estado.resumo = { ...RESUMO };
    estado.hojeTotal = 0;
    estado.hojeFromISO = appDayStart(0).toISOString();
    estado.erro = null;
    estado.chamadas.length = 0;
    estado.papel = { isAdmin: true, loading: false };
  });

  // ===== RENDERING =====
  it('renderiza os cards de resumo com números que vieram do banco', async () => {
    render(<AuditLogDashboard />);
    await waitFor(() => expect(valorDoCartao('Total de Logs')).toBe('5'));
    expect(valorDoCartao('Ações Sensíveis')).toBe('3');
    expect(valorDoCartao('Usuários Únicos')).toBe('3');
    expect(valorDoCartao('Acessos negados (24h)')).toBe('2');
    expect(screen.getByText('Filtros')).toBeInTheDocument();
    expect(screen.getByText(/Logs de Auditoria/)).toBeInTheDocument();
  });

  it('mostra o NOME do autor do log (não o user_id)', async () => {
    render(<AuditLogDashboard />);
    expect((await screen.findAllByText('Ana Agente')).length).toBeGreaterThan(0);
    expect(screen.getByText('Bruno Lima')).toBeInTheDocument();
  });

  it('mostra skeletons enquanto carrega', () => {
    const { container } = render(<AuditLogDashboard />);
    expect(container.querySelectorAll('[data-testid="audit-skeleton"]').length).toBeGreaterThan(0);
  });

  // ===== ERRO EXPLÍCITO (antes engolido: erro virava 0) =====
  it('em falha mostra o erro e "Tentar de novo" — nunca zeros silenciosos', async () => {
    estado.erro = 'permission denied';
    render(<AuditLogDashboard />);
    expect(await screen.findByText('Não foi possível carregar a auditoria.')).toBeInTheDocument();
    expect(screen.queryByText('Total de Logs')).toBeNull();
    expect(screen.queryByText('Logs de Auditoria (0)')).toBeNull();
  });

  it('"Tentar de novo" refaz a leitura e mostra os números', async () => {
    estado.erro = 'offline';
    render(<AuditLogDashboard />);
    await screen.findByText('Não foi possível carregar a auditoria.');

    estado.erro = null;
    fireEvent.click(screen.getByRole('button', { name: /Tentar de novo/ }));

    await waitFor(() => expect(valorDoCartao('Total de Logs')).toBe('5'));
  });

  // ===== PERMISSÃO =====
  it('sem papel admin diz que não tem permissão e não consulta o banco', async () => {
    estado.papel.isAdmin = false;
    render(<AuditLogDashboard />);
    expect(await screen.findByText('Você não tem permissão para ver a auditoria')).toBeInTheDocument();
    expect(estado.chamadas).toHaveLength(0);
    expect(screen.queryByText('Total de Logs')).toBeNull();
  });

  // ===== FILTRO DE DATA =====
  it('o filtro de data recorta a janela enviada às RPCs', async () => {
    render(<AuditLogDashboard />);
    await waitFor(() => expect(valorDoCartao('Total de Logs')).toBe('5'));

    fireEvent.change(screen.getByLabelText('Data inicial'), { target: { value: '2026-10-01' } });

    const esperado = appDayStartOfLocalDate(parseDayKey('2026-10-01')!).toISOString();
    await waitFor(() => expect(chamadasDe('audit_log_list').some((c) => c.args.p_from === esperado)).toBe(true));
    expect(chamadasDe('audit_log_summary').some((c) => c.args.p_from === esperado)).toBe(true);
  });

  // ===== PAGINAÇÃO POR CURSOR =====
  it('"Carregar mais" busca a próxima página pelo cursor do último log', async () => {
    const pagina = Array.from({ length: 50 }, (_, i) =>
      log({ id: `p${i}`, created_at: new Date(2026, 9, 10, 12, 0, i).toISOString(), actor_name: 'Página Um' }),
    );
    estado.dados = pagina;
    render(<AuditLogDashboard />);
    await waitFor(() => expect(screen.getAllByText('Página Um').length).toBeGreaterThan(0));

    estado.dados = [log({ id: 'proximo', actor_name: 'Página Dois' })];
    fireEvent.click(screen.getByRole('button', { name: /Carregar mais/ }));

    await waitFor(() => expect(screen.getByText('Página Dois')).toBeInTheDocument());
    const lista = chamadasDe('audit_log_list');
    const ultima = lista[lista.length - 1]!;
    expect(ultima.args.p_cursor).toBe(pagina[49].created_at);
    expect(ultima.args.p_cursor_id).toBe('p49');
  });

  // ===== +detalhes (t_638c8a1a) =====
  it('"+detalhes" abre e recolhe o JSON de details', async () => {
    render(<AuditLogDashboard />);
    await waitFor(() => expect(valorDoCartao('Total de Logs')).toBe('5'));

    const botoes = await screen.findAllByRole('button', { name: '+detalhes' });
    expect(botoes).toHaveLength(2);
    expect(botoes[0]).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(botoes[0]);
    const aberto = screen.getByRole('button', { name: '−detalhes' });
    expect(aberto).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/"reason": "test"/)).toBeInTheDocument();

    fireEvent.click(aberto);
    expect(screen.queryByText(/"reason": "test"/)).toBeNull();
  });
});

// ===== R2-AUTH-032 — concessões/revogações de papel no filtro e no resumo sensível =====
const LOGS_PAPEIS = [
  log({ id: '1', action: 'login', entity_type: 'user', actor_name: 'Ana Agente' }),
  log({ id: '2', action: 'create', entity_type: 'contact', actor_name: 'Ana Agente' }),
  log({ id: '3', action: 'delete', entity_type: 'contact', user_id: 'uid2', actor_name: 'Bruno Lima' }),
  log({ id: '4', action: 'export', entity_type: 'contact', user_id: 'uid2', actor_name: 'Bruno Lima' }),
  log({ id: '5', action: 'role_granted', entity_type: 'user_roles', user_id: 'uid3', actor_name: 'Carla Souza', details: { role: 'admin' } }),
  log({ id: '6', action: 'role_revoked', entity_type: 'user_roles', user_id: 'uid3', actor_name: 'Carla Souza' }),
];

describe('R2-AUTH-032 — papéis no resumo sensível e nos filtros', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estado.dados = LOGS_PAPEIS;
    // O resumo vem do banco: delete + export + role_granted + role_revoked = 4 sensíveis.
    estado.resumo = { ...RESUMO, total_logs: 6, sensitive_actions: 4 };
    estado.hojeFromISO = appDayStart(0).toISOString();
    estado.hojeTotal = 0;
    estado.erro = null;
    estado.chamadas.length = 0;
    estado.papel = { isAdmin: true, loading: false };
  });

  it('"Ações Sensíveis" reflete o resumo sensível do banco', async () => {
    render(<AuditLogDashboard />);
    await waitFor(() => expect(valorDoCartao('Total de Logs')).toBe('6'));
    expect(valorDoCartao('Ações Sensíveis')).toBe('4');
  });

  it('filtro "Papéis (concessões e revogações)" mostra só ações role_*', async () => {
    render(<AuditLogDashboard />);
    await waitFor(() => expect(valorDoCartao('Total de Logs')).toBe('6'));

    fireEvent.click(screen.getByText('Papéis (concessões e revogações)'));

    await waitFor(() => expect(screen.getByText('role_granted')).toBeInTheDocument());
    expect(screen.getByText('role_revoked')).toBeInTheDocument();
    expect(screen.queryByText('login')).toBeNull();
    expect(screen.queryByText('export')).toBeNull();
  });

  it('filtro "Usuários" cobre entity_type user e user_roles', async () => {
    render(<AuditLogDashboard />);
    await waitFor(() => expect(valorDoCartao('Total de Logs')).toBe('6'));

    fireEvent.click(screen.getByText('Usuários'));

    await waitFor(() => expect(screen.getByText('role_granted')).toBeInTheDocument());
    expect(screen.queryByText('delete')).toBeNull();
    expect(screen.queryByText('export')).toBeNull();
  });
});
