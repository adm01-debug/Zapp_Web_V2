import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appDayEndOfLocalDate, appDayStartOfLocalDate, parseDayKey } from '@/lib/localDay';
import { AuditLogDashboard } from '../AuditLogDashboard';

const linha = (id: string, resto: Record<string, unknown> = {}) => ({
  id,
  action: 'login',
  entity_type: 'user',
  entity_id: null,
  user_id: 'uid1',
  details: null,
  ip_address: '10.0.0.1',
  user_agent: null,
  created_at: '2026-10-10T12:00:00.000Z',
  ...resto,
});

// Estado da consulta falsa: a primeira página devolve `logs`; depois do
// cursor (.or) devolve `pagina2`. `erroLista` simula falha do banco.
const estado = vi.hoisted(() => ({
  logs: [] as unknown[],
  pagina2: [] as unknown[],
  perfis: [] as unknown[],
  erroLista: null as null | { message: string },
  proximaResposta: null as null | unknown[],
  manual: false,
  pendentes: [] as Array<() => void>,
  chamadas: {
    from: [] as string[],
    gte: [] as Array<[string, string]>,
    lte: [] as Array<[string, string]>,
    or: [] as string[],
  },
}));

type Pagina = PromiseLike<{ data: unknown; error: unknown }> & {
  eq: (c: string, v: unknown) => Pagina;
  in: (c: string, v: unknown[]) => Pagina;
  like: (c: string, v: string) => Pagina;
  gte: (c: string, v: string) => Pagina;
  lte: (c: string, v: string) => Pagina;
  or: (v: string) => Pagina;
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((tabela: string) => {
      estado.chamadas.from.push(tabela);
      if (tabela === 'profiles') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => Promise.resolve({ data: estado.perfis, error: null })),
          })),
        };
      }
      const pagina = (): Pagina => {
        const self = {
          eq: vi.fn(() => self),
          in: vi.fn(() => self),
          like: vi.fn(() => self),
          gte: vi.fn((_c: string, _v: string) => {
            estado.chamadas.gte.push([_c, _v]);
            return self;
          }),
          lte: vi.fn((_c: string, _v: string) => {
            estado.chamadas.lte.push([_c, _v]);
            return self;
          }),
          or: vi.fn((v: string) => {
            estado.chamadas.or.push(v);
            return self;
          }),
          then: (res: (v: { data: unknown; error: unknown }) => unknown, rej?: (e: unknown) => unknown) => {
            const usouCursor = estado.chamadas.or.length > 0;
            const resposta = {
              data: usouCursor ? estado.pagina2 : (estado.proximaResposta ?? estado.logs),
              error: usouCursor ? null : estado.erroLista,
            };
            if (estado.manual) {
              // Resposta pendente sob controle do teste (prova de corrida).
              return new Promise<{ data: unknown; error: unknown }>((liberar) => {
                estado.pendentes.push(() => liberar(resposta));
              }).then(res, rej);
            }
            return Promise.resolve(resposta).then(res, rej);
          },
        } as unknown as Pagina;
        return self;
      };
      return {
        select: vi.fn(() => ({
          order: vi.fn(() => ({ limit: vi.fn(() => pagina()) })),
        })),
      };
    }),
  },
}));

vi.mock('framer-motion', () => ({
  motion: { div: ({ children }: { children?: ReactNode }) => <div>{children}</div> },
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

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

describe('AuditLogDashboard — refazer 1 (totais reais, filtro de data, autor, cursor)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estado.logs = [linha('1'), linha('2', { user_id: 'uid2' })];
    estado.pagina2 = [];
    estado.perfis = [
      { user_id: 'uid1', name: 'Maria Silva' },
      { user_id: 'uid2', name: 'João Souza' },
    ];
    estado.erroLista = null;
    estado.proximaResposta = null;
    estado.manual = false;
    estado.pendentes.length = 0;
    estado.chamadas.from.length = 0;
    estado.chamadas.gte.length = 0;
    estado.chamadas.lte.length = 0;
    estado.chamadas.or.length = 0;
  });

  it('mostra o nome do autor em cada linha em vez do id', async () => {
    render(<AuditLogDashboard />);
    await waitFor(() => expect(screen.getByText('Maria Silva')).toBeInTheDocument());
    expect(screen.getByText('João Souza')).toBeInTheDocument();
  });

  it('aplica o filtro de data como gte/lte no fuso do app', async () => {
    render(<AuditLogDashboard />);
    await waitFor(() => expect(screen.getByText('Total de Logs')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-10-09' } });
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-10-10' } });

    const inicio = appDayStartOfLocalDate(parseDayKey('2026-10-09')!).toISOString();
    const fim = appDayEndOfLocalDate(parseDayKey('2026-10-10')!).toISOString();
    await waitFor(() => {
      expect(estado.chamadas.gte).toContainEqual(['created_at', inicio]);
      expect(estado.chamadas.lte).toContainEqual(['created_at', fim]);
    });
  });

  it('página por cursor: "Carregar mais" busca a próxima página sem repetir', async () => {
    estado.logs = Array.from({ length: 50 }, (_, i) =>
      linha(`p1-${i}`, { created_at: `2026-10-10T12:00:${String(i).padStart(2, '0')}.000Z` }),
    );
    estado.pagina2 = [linha('p2-0', { created_at: '2026-10-09T10:00:00.000Z' })];
    render(<AuditLogDashboard />);
    await waitFor(() => expect(screen.getByText('Carregar mais')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Carregar mais'));

    await waitFor(() => {
      expect(estado.chamadas.or.length).toBeGreaterThan(0);
      // O cursor carrega o id e o instante do último item da página atual.
      expect(estado.chamadas.or[0]).toContain('p1-49');
      expect(estado.chamadas.or[0]).toContain('2026-10-10');
    });
    await waitFor(() => expect(screen.getByText('Total de Logs').previousElementSibling).toHaveTextContent('51'));
  });

  it('falha do banco vira erro explícito com nova tentativa, sem zeros silenciosos', async () => {
    estado.erroLista = { message: 'policy' };
    render(<AuditLogDashboard />);
    await waitFor(() =>
      expect(screen.getByText('Não foi possível carregar a auditoria.')).toBeInTheDocument(),
    );
    expect(screen.getByText('Tentar de novo')).toBeInTheDocument();

    // O banco volta: a nova tentativa mostra a lista de verdade.
    estado.erroLista = null;
    fireEvent.click(screen.getByText('Tentar de novo'));
    await waitFor(() => expect(screen.getByText('Maria Silva')).toBeInTheDocument());
  });

  it('período inválido (início após o fim) avisa sem consultar o banco', async () => {
    render(<AuditLogDashboard />);
    await waitFor(() => expect(screen.getByText('Total de Logs')).toBeInTheDocument());
    const consultasAntes = estado.chamadas.from.filter((t) => t === 'audit_logs').length;

    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-10-11' } });
    await waitFor(() => expect(estado.chamadas.from.filter((t) => t === 'audit_logs').length).toBeGreaterThan(consultasAntes));
    const consultasComInicio = estado.chamadas.from.filter((t) => t === 'audit_logs').length;

    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-10-10' } });

    await waitFor(() => expect(screen.getByText(/Período inválido/)).toBeInTheDocument());
    expect(estado.chamadas.from.filter((t) => t === 'audit_logs').length).toBe(consultasComInicio);
  });

  it('resposta antiga resolvida depois da nova é descartada, sem loading preso', async () => {
    estado.manual = true;
    estado.proximaResposta = [linha('A', { action: 'login' })];
    render(<AuditLogDashboard />);
    await waitFor(() => expect(estado.pendentes.length).toBe(1));

    // Troca de filtro dispara a consulta nova (B) com a antiga (A) ainda no ar.
    estado.proximaResposta = [linha('B', { action: 'logout' })];
    fireEvent.click(screen.getByText('Papéis (concessões e revogações)'));
    await waitFor(() => expect(estado.pendentes.length).toBe(2));

    // A nova resolve primeiro...
    await act(async () => {
      estado.pendentes[1]();
    });
    await waitFor(() => expect(screen.getByText('logout')).toBeInTheDocument());

    // ...e a antiga, chegando atrasada, não sobrescreve nem trava a tela.
    await act(async () => {
      estado.pendentes[0]();
    });
    await act(async () => {});
    expect(screen.getByText('logout')).toBeInTheDocument();
    expect(screen.queryByText('login')).toBeNull();
    expect(screen.queryByText('Carregando...')).toBeNull();
  });
});
