import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * Estados da tela de Administração (usuários e auditoria).
 *
 * O que este arquivo prova, no componente REAL e com o hook mockado:
 *  - erro de consulta aparece na tela (com "Tentar novamente"), não como lista vazia;
 *  - vazio tem texto próprio (lista sem busca x busca sem resultado x período sem log);
 *  - a busca só existe nas abas em que o termo filtra a lista (fora delas era controle decorativo);
 *  - o filtro de data e a paginação da auditoria chegam ao hook (o estado vive no AdminView);
 *  - o campo de senha do diálogo usa a régua da Edge (`MIN_PASSWORD_LENGTH`) e o medidor.
 */
const h = vi.hoisted(() => {
  const fetchData = vi.fn();
  const estado: {
    users: unknown[];
    auditLogs: unknown[];
    auditTotal: number;
    loading: boolean;
    error: string | null;
    filtro: { from?: string; to?: string; page?: number; pageSize?: number } | null;
  } = { users: [], auditLogs: [], auditTotal: 0, loading: false, error: null, filtro: null };
  return { fetchData, estado };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }),
    }),
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
  },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ isAdmin: true, isSupervisor: true, loading: false }),
}));
vi.mock('../useAdminData', async (importOriginal) => {
  const real = await importOriginal<typeof import('../useAdminData')>();
  return {
    // Só o hook é substituído: `MIN_PASSWORD_LENGTH`, `AUDIT_PAGE_SIZE` e
    // `accessLevelConfig` vêm do módulo REAL, para o teste não passar com um
    // número copiado à mão.
    ...real,
    useAdminData: (_aba: string, filtro: unknown) => {
      h.estado.filtro = filtro as typeof h.estado.filtro;
      return {
        users: h.estado.users,
        auditLogs: h.estado.auditLogs,
        auditTotal: h.estado.auditTotal,
        loading: h.estado.loading,
        error: h.estado.error,
        fetchData: h.fetchData,
        handleRoleChange: vi.fn(),
        handleToggleActive: vi.fn(),
        handleSaveUser: vi.fn(),
        handleCreateUser: vi.fn(),
      };
    },
  };
});

import { AdminView } from '../AdminView';

beforeEach(() => {
  vi.clearAllMocks();
  h.estado.users = [];
  h.estado.auditLogs = [];
  h.estado.auditTotal = 0;
  h.estado.loading = false;
  h.estado.error = null;
  h.estado.filtro = null;
});

afterEach(() => {
  // O medidor de senha consulta a API do Pwned Passwords 500 ms depois da
  // digitação; sem o stub, o teste poderia bater na rede.
  vi.unstubAllGlobals();
});

function abrirAuditoria() {
  render(<AdminView />);
  fireEvent.click(screen.getByRole('tab', { name: /Auditoria/ }));
}

describe('AdminView — estados das listas (usuários e auditoria)', () => {
  it('erro de consulta vira estado na tela, com opção de tentar de novo', () => {
    h.estado.error = 'Não foi possível carregar a auditoria.';
    render(<AdminView />);

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar a auditoria.');
    const antes = h.fetchData.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/i }));
    expect(h.fetchData.mock.calls.length).toBe(antes + 1);
  });

  it('enquanto carrega não mostra tabela nem estado vazio', () => {
    h.estado.loading = true;
    render(<AdminView />);

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText('Nenhum usuário cadastrado.')).toBeNull();
    // A página continua montada (a aba está lá); o que falta é o conteúdo.
    expect(screen.getByRole('tab', { name: /Usuários/ })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('lista de usuários vazia tem texto próprio', () => {
    render(<AdminView />);
    expect(screen.getByText('Nenhum usuário cadastrado.')).toBeInTheDocument();
  });

  it('busca de usuário sem resultado explica que foi a busca', () => {
    render(<AdminView />);
    fireEvent.change(screen.getByPlaceholderText('Buscar usuários...'), { target: { value: 'zzz' } });

    expect(screen.getByText('Nenhum usuário encontrado para "zzz".')).toBeInTheDocument();
  });

  it('auditoria vazia e auditoria filtrada por período têm textos diferentes', () => {
    abrirAuditoria();
    expect(screen.getByText('Nenhum log de auditoria registrado.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Data inicial'), { target: { value: '2026-10-01' } });
    expect(screen.getByText('Nenhum log de auditoria no período selecionado.')).toBeInTheDocument();
  });

  it('a busca não aparece nas abas em que não filtra nada', () => {
    render(<AdminView />);
    expect(screen.getByPlaceholderText('Buscar usuários...')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /CRM 360/ }));
    expect(screen.queryByPlaceholderText('Buscar usuários...')).toBeNull();
    expect(screen.queryByPlaceholderText('Buscar logs...')).toBeNull();
  });

  it('o período escolhido chega ao hook como filtro', () => {
    abrirAuditoria();
    expect(h.estado.filtro).toMatchObject({ page: 1, pageSize: 50 });
    expect(h.estado.filtro?.from).toBeUndefined();

    fireEvent.change(screen.getByLabelText('Data inicial'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Data final'), { target: { value: '2026-10-12' } });

    expect(h.estado.filtro).toMatchObject({ from: '2026-10-01', to: '2026-10-12', page: 1 });

    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtro' }));
    expect(h.estado.filtro?.from).toBeUndefined();
    expect(h.estado.filtro?.to).toBeUndefined();
  });

  it('a paginação anda para frente e para trás e volta à página 1 ao trocar o período', () => {
    h.estado.auditTotal = 137;
    abrirAuditoria();

    expect(screen.getByText(/137 registro\(s\) — página 1 de 3/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Anterior/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Próxima/i }));
    expect(h.estado.filtro?.page).toBe(2);
    expect(screen.getByText(/137 registro\(s\) — página 2 de 3/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Anterior/i }));
    expect(h.estado.filtro?.page).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: /Próxima/i }));
    fireEvent.change(screen.getByLabelText('Data inicial'), { target: { value: '2026-10-01' } });
    expect(h.estado.filtro).toMatchObject({ page: 1, from: '2026-10-01' });
  });

  it('o campo de senha usa a régua da Edge e o medidor de força', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, text: async () => '' }));
    render(<AdminView />);
    fireEvent.click(screen.getByRole('button', { name: /Adicionar Usuário/i }));

    const senha = screen.getByPlaceholderText('Mínimo 8 caracteres');
    expect(screen.queryByPlaceholderText('Mínimo 6 caracteres')).toBeNull();

    fireEvent.change(senha, { target: { value: '12345678' } });
    expect(screen.getByText('Mínimo 8 caracteres')).toBeInTheDocument();
  });

  it('o nível de acesso se apresenta como informativo, não como permissão', () => {
    h.estado.users = [
      {
        id: 'p1',
        user_id: 'u1',
        name: 'Ana Silva',
        email: 'ana@test.local',
        avatar_url: null,
        nickname: null,
        signature: null,
        role: 'agent',
        job_title: null,
        department: null,
        phone: null,
        access_level: 'full',
        max_chats: null,
        can_download: false,
        is_active: true,
        created_at: '2026-10-01T00:00:00.000Z',
      },
    ];
    render(<AdminView />);

    expect(screen.getByRole('columnheader', { name: 'Acesso (informativo)' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Editar Ana Silva/i }));
    expect(screen.getByLabelText('Nível de acesso (informativo)')).toBeInTheDocument();
    expect(
      screen.getByText('Informativo: este nível não libera nada hoje — quem dá acesso é o papel (Role).'),
    ).toBeInTheDocument();
  });
});
