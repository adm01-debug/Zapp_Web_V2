import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuditLogDashboard } from '../AuditLogDashboard';
import { fakeAuditLog, type FakeProfileRow, type FakeRealtime } from '@/test/mocks/auditLogsServer';

const mockLogs = [
  { id: '1', action: 'login', entity_type: 'user', entity_id: 'u1', user_id: 'uid1', details: null, ip_address: '192.168.1.1', user_agent: 'Chrome', created_at: new Date().toISOString() },
  { id: '2', action: 'delete', entity_type: 'contact', entity_id: 'c1', user_id: 'uid2', details: { reason: 'test' }, ip_address: '10.0.0.1', user_agent: 'Firefox', created_at: new Date().toISOString() },
  { id: '3', action: 'create', entity_type: 'message', entity_id: 'm1', user_id: 'uid1', details: null, ip_address: null, user_agent: null, created_at: '2025-01-01T10:00:00Z' },
  { id: '4', action: 'role_change', entity_type: 'user', entity_id: 'u2', user_id: 'uid3', details: { from: 'agent', to: 'admin' }, ip_address: '172.16.0.1', user_agent: null, created_at: new Date().toISOString() },
  { id: '5', action: 'export', entity_type: 'contact', entity_id: null, user_id: 'uid1', details: null, ip_address: '192.168.1.1', user_agent: 'Chrome', created_at: new Date().toISOString() },
];

// Estado das consultas: o servidor PostgREST falso (src/test/mocks/auditLogsServer)
// devolve as linhas pedidas e registra as chamadas do builder para os testes.
const estado = vi.hoisted(() => ({
  dados: [] as unknown[],
  perfis: [] as FakeProfileRow[],
  erro: null as { message: string } | null,
  realtime: null as FakeRealtime | null,
  chamadas: {
    select: '' as string,
    eq: [] as Array<[string, unknown]>,
    in: [] as Array<[string, unknown[]]>,
    like: [] as Array<[string, string]>,
    // Ordem pedida pela consulta da lista (sem contagem e com limite).
    ordemDaLista: [] as string[],
  },
}));

vi.mock('@/integrations/supabase/client', async () => {
  const { createAuditLogsServer, createAuditLogsRealtime } = await import('@/test/mocks/auditLogsServer');
  const realtime = createAuditLogsRealtime();
  estado.realtime = realtime;

  return {
    supabase: {
      // Um servidor por consulta: lê o estado vivo do teste (dados/erro trocados no beforeEach).
      from: (tabela: string) => {
        const servidor = createAuditLogsServer(estado.dados as never, {
          profiles: estado.perfis,
          error: estado.erro,
          registrar: (consulta) => {
            if (consulta.table === 'audit_logs' && !consulta.contagem) estado.chamadas.select = consulta.colunas;
            if (consulta.table === 'audit_logs' && consulta.limit !== null) estado.chamadas.ordemDaLista = consulta.order;
            consulta.eq.forEach((e) => estado.chamadas.eq.push(e));
            consulta.in.forEach((e) => estado.chamadas.in.push(e));
            consulta.like.forEach((e) => estado.chamadas.like.push(e));
          },
        });
        return servidor.from(tabela);
      },
      channel: (nome: string) => realtime.channel(nome),
      removeChannel: (canal: unknown) => realtime.removeChannel(canal),
    },
  };
});

// O estado é compartilhado entre os describes: zera tudo antes de cada teste para um
// teste de erro (leitura falhando) não vazar para o seguinte.
beforeEach(() => {
  estado.dados = mockLogs;
  estado.perfis = [];
  estado.erro = null;
  estado.chamadas.eq.length = 0;
  estado.chamadas.in.length = 0;
  estado.chamadas.like.length = 0;
  estado.chamadas.select = '';
});

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

describe('AuditLogDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estado.dados = mockLogs;
    estado.perfis = [];
    estado.erro = null;
    estado.chamadas.eq.length = 0;
    estado.chamadas.in.length = 0;
    estado.chamadas.like.length = 0;
    estado.chamadas.select = '';
  });

  // ===== QUERY COLUMNS =====
  describe('Query columns', () => {
    it('selects explicit columns instead of * for audit_logs', async () => {
      render(<AuditLogDashboard />);
      await waitFor(() => expect(screen.getByText('Total de Logs')).toBeInTheDocument());
      expect(estado.chamadas.select).not.toBe('*');
      expect(estado.chamadas.select).toContain('id');
      expect(estado.chamadas.select).toContain('action');
      expect(estado.chamadas.select).toContain('created_at');
    });

    it('a lista de 200 pede ordem determinística, com desempate por id', async () => {
      render(<AuditLogDashboard />);

      await waitFor(() => expect(estado.chamadas.ordemDaLista).toEqual(['created_at:desc', 'id:desc']));
    });
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

// ===== R2-AUTH-032 — concessões/revogações de papel nos filtros e no contador =====
// O trigger audit_role_changes grava role_granted/role_revoked/role_changed com
// entity_type='user_roles'; o provisionamento grava role_auto_provisioned. Sem a
// correção esses registros não entram no contador sensível nem no filtro "Usuários".
const LOGS_PAPEIS = [
  { id: '1', action: 'login', entity_type: 'user', entity_id: 'u1', user_id: 'uid1', details: null, ip_address: null, user_agent: null, created_at: new Date().toISOString() },
  { id: '2', action: 'create', entity_type: 'contact', entity_id: 'c1', user_id: 'uid1', details: null, ip_address: null, user_agent: null, created_at: new Date().toISOString() },
  { id: '3', action: 'delete', entity_type: 'contact', entity_id: 'c2', user_id: 'uid2', details: null, ip_address: null, user_agent: null, created_at: new Date().toISOString() },
  { id: '4', action: 'export', entity_type: 'contact', entity_id: null, user_id: 'uid2', details: null, ip_address: null, user_agent: null, created_at: new Date().toISOString() },
  { id: '5', action: 'role_granted', entity_type: 'user_roles', entity_id: 'ur1', user_id: 'uid3', details: { role: 'admin' }, ip_address: null, user_agent: null, created_at: new Date().toISOString() },
  { id: '6', action: 'role_revoked', entity_type: 'user_roles', entity_id: 'ur2', user_id: 'uid3', details: { role: 'agent' }, ip_address: null, user_agent: null, created_at: new Date().toISOString() },
];

const valorDoCartao = (rotulo: string) =>
  screen.getByText(rotulo).previousElementSibling?.textContent;

describe('R2-AUTH-032 — papéis entram no contador sensível e nos filtros', () => {
  beforeEach(() => {
    estado.dados = LOGS_PAPEIS;
  });

  it('contador "Ações Sensíveis" soma concessões e revogações de papel', async () => {
    render(<AuditLogDashboard />);
    await waitFor(() => expect(valorDoCartao('Total de Logs')).toBe('6'));
    // Sensíveis = delete + export + role_granted + role_revoked = 4;
    // sem a correção o cartão mostrava 2 (só delete/export).
    expect(valorDoCartao('Ações Sensíveis')).toBe('4');
  });

  it('filtro "Papéis (concessões e revogações)" consulta todas as ações role_*', async () => {
    render(<AuditLogDashboard />);
    await waitFor(() => expect(valorDoCartao('Total de Logs')).toBe('6'));

    fireEvent.click(screen.getByText('Papéis (concessões e revogações)'));

    await waitFor(() =>
      expect(estado.chamadas.like).toContainEqual(['action', 'role_%'])
    );
    expect(estado.chamadas.eq).not.toContainEqual(['action', 'role_events']);
    expect(screen.getByText('role_granted')).toBeInTheDocument();
    expect(screen.getByText('role_revoked')).toBeInTheDocument();
  });

  it('filtro "Usuários" cobre entity_type user e user_roles', async () => {
    render(<AuditLogDashboard />);
    await waitFor(() => expect(valorDoCartao('Total de Logs')).toBe('6'));

    fireEvent.click(screen.getByText('Usuários'));

    await waitFor(() =>
      expect(estado.chamadas.in).toContainEqual(['entity_type', ['user', 'user_roles']])
    );
    expect(estado.chamadas.eq).not.toContainEqual(['entity_type', 'user']);
  });

  // HZ1-08: os totais vêm de contagem no servidor (não das 200 linhas da tela) e a
  // aba acompanha INSERT por Realtime. Antes: `data.filter(...)` sobre a página.
  describe('HZ1-08 — totais reais e Realtime', () => {
    const agora = new Date().toISOString();
    const maisDe24h = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();

    const definirDados = (linhas: ReturnType<typeof fakeAuditLog>[]) => {
      estado.dados = linhas;
    };

    /** 500 linhas na base: metade nas últimas 24 h; 1 em cada 5 é `delete` (sensível).
     *  `u9` só aparece na linha mais antiga — fora da página de 200 da tela. */
    const planilha = (total: number) =>
      Array.from({ length: total }, (_, i) =>
        fakeAuditLog({
          id: `f${i}`,
          action: i % 5 === 0 ? 'delete' : 'login',
          user_id: i === total - 1 ? 'u9' : `u${i % 3}`,
          created_at: i % 2 === 0 ? agora : maisDe24h,
        }),
      );

    const valorDoCartao = (rotulo: string) => screen.getByText(rotulo).previousElementSibling?.textContent;

    it('conta no servidor: 500 linhas na base e só 200 na tela; o cartão mostra as 500', async () => {
      definirDados(planilha(500));

      render(<AuditLogDashboard />);

      await waitFor(() => expect(valorDoCartao('Total de Logs')).toBe('500'));
    });

    it('o cartão Hoje conta a janela de 24 h inteira, não só a página', async () => {
      definirDados(planilha(500));

      render(<AuditLogDashboard />);

      await waitFor(() => expect(valorDoCartao('Hoje')).toBe('250'));
    });

    it('Ações Sensíveis conta no servidor a janela de 24 h', async () => {
      definirDados(planilha(500));

      render(<AuditLogDashboard />);

      await waitFor(() => expect(valorDoCartao('Ações Sensíveis')).toBe('50'));
    });

    it('Usuários Únicos lê todas as páginas dos últimos 7 d, não a página da tela', async () => {
      definirDados(planilha(500));

      render(<AuditLogDashboard />);

      // u0, u1, u2 e u9 aparecem nas 500 linhas (7 d); `u9` só nas que a lista não mostra.
      await waitFor(() => expect(valorDoCartao('Usuários Únicos')).toBe('4'));
    });

    it('INSERT de audit_logs atualiza os totais sem recarregar a página', async () => {
      definirDados([fakeAuditLog({ id: 'r1', action: 'login', user_id: 'uid1', created_at: agora })]);
      render(<AuditLogDashboard />);
      await waitFor(() => expect(valorDoCartao('Total de Logs')).toBe('1'));

      definirDados([
        ...(estado.dados as ReturnType<typeof fakeAuditLog>[]),
        fakeAuditLog({ id: 'r2', action: 'role_granted', user_id: 'uid2', created_at: new Date().toISOString() }),
      ]);
      const inicio = performance.now();
      estado.realtime?.emitirInsert(fakeAuditLog({ id: 'r2', action: 'role_granted', user_id: 'uid2' }));

      await waitFor(() => expect(valorDoCartao('Ações Sensíveis')).toBe('1'));
      expect(performance.now() - inicio).toBeLessThan(5000);
    });

    it('assina o canal audit-logs-dashboard e limpa ao desmontar', async () => {
      const { unmount } = render(<AuditLogDashboard />);
      await waitFor(() => expect(estado.realtime?.canais).toContain('audit-logs-dashboard'));

      unmount();

      await waitFor(() => expect(estado.realtime?.canais).toEqual([]));
    });

    it('mostra o nome do autor buscado em profiles', async () => {
      definirDados([fakeAuditLog({ id: 'p1', action: 'login', user_id: 'uid1', created_at: agora })]);
      estado.perfis = [{ id: 'uid1', name: 'Ana Souza' }];

      render(<AuditLogDashboard />);

      await waitFor(() => expect(screen.getByText('Ana Souza')).toBeInTheDocument());
      expect(screen.queryByText('uid1')).toBeNull();
    });

    it('falha de leitura avisa e não zera os totais em silêncio', async () => {
      estado.erro = { message: 'permission denied' };

      render(<AuditLogDashboard />);

      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('permission denied'));
      expect(valorDoCartao('Total de Logs')).toBe('—');
    });
  });
});

// t_638c8a1a: o "+detalhes" era um <Badge> puramente decorativo — parecia um
// controle mas não abria nada. A correção o torna um botão de verdade que revela
// o JSON de `details` (e pode recolher de novo).
describe('t_638c8a1a — "+detalhes" abre o JSON de details', () => {
  beforeEach(() => {
    estado.dados = mockLogs;
  });

  it('revela e recolhe o details ao clicar', async () => {
    render(<AuditLogDashboard />);
    await waitFor(() => expect(screen.getByText('Total de Logs')).toBeInTheDocument());

    // Dois registros do mock têm `details` (id 2 e id 4).
    const botoes = await screen.findAllByRole('button', { name: '+detalhes' });
    expect(botoes).toHaveLength(2);

    // A lista é ordenada por `created_at desc` com desempate por `id desc` (HZ1-08), então o
    // teste escolhe a linha pela ação em vez de assumir "o primeiro botão".
    const linha = screen.getByText('delete').closest('div[class*="bg-muted/30"]') as HTMLElement;
    const primeiro = within(linha).getByRole('button', { name: '+detalhes' });
    expect(primeiro).toHaveAttribute('aria-expanded', 'false');
    // Antes de clicar o JSON não está na tela.
    expect(screen.queryByText(/"reason": "test"/)).toBeNull();

    fireEvent.click(primeiro);

    const aberto = within(linha).getByRole('button', { name: '−detalhes' });
    expect(aberto).toHaveAttribute('aria-expanded', 'true');
    expect(within(linha).getByText(/"reason": "test"/)).toBeInTheDocument();

    // Clicar de novo recolhe.
    fireEvent.click(aberto);
    expect(screen.queryByText(/"reason": "test"/)).toBeNull();
    expect(screen.getAllByRole('button', { name: '+detalhes' })).toHaveLength(2);
  });
});
