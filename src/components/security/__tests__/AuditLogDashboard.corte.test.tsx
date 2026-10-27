import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuditLogDashboard } from '../AuditLogDashboard';

const linha = (id: string) => ({
  id, action: 'login', entity_type: 'user', entity_id: 'u', user_id: 'uid',
  details: null, ip_address: null, user_agent: null, created_at: new Date().toISOString(),
});

const estado = vi.hoisted(() => ({ dados: [] as unknown[] }));

// HZ1-08: os cartões vêm de contagem no servidor (hook); a lista traz só a página
// de 200. Aqui o hook é substituído para provar só o comportamento do recorte.
vi.mock('@/hooks/security/useAuditLogDashboard', () => ({
  useAuditLogDashboard: () => ({
    stats: {
      total: 5000, ultimas24h: 10, sensiveis24h: 2, usuariosUnicos7d: 3, usuariosUnicosIncompleto: false,
    },
    logs: estado.dados,
    nomesPorUsuario: {},
    loading: false,
    error: null,
    recarregar: () => {},
  }),
}));

vi.mock('@/components/ui/select', async () => {
  const React = await import('react');
  const Contexto = React.createContext<(v: string) => void>(() => {});
  const Select = ({ children }: { children?: ReactNode }) => (
    <Contexto.Provider value={() => {}}>{children}</Contexto.Provider>
  );
  const SelectTrigger = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const SelectValue = () => null;
  const SelectContent = ({ children }: { children?: ReactNode }) => <ul>{children}</ul>;
  const SelectItem = ({ children }: { children?: ReactNode }) => <li>{children}</li>;
  return { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
});

describe('AuditLogDashboard — recorte de 200 registros', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('com a página cheia (200) avisa o recorte da lista e mantém o total real do servidor', async () => {
    estado.dados = Array.from({ length: 200 }, (_, i) => linha(String(i)));
    render(<AuditLogDashboard />);

    await waitFor(() => expect(screen.getByText('Total de Logs')).toBeInTheDocument());
    expect(screen.getByText('5000')).toBeInTheDocument();
    expect(screen.queryByText('Últimos 200')).not.toBeInTheDocument();
    expect(screen.getByText(/pode haver registros mais antigos fora do recorte/)).toBeInTheDocument();
  });

  it('com menos de 200 registros mantém "Total de Logs" sem aviso', async () => {
    estado.dados = [linha('1'), linha('2')];
    render(<AuditLogDashboard />);

    await waitFor(() => expect(screen.getByText('Total de Logs')).toBeInTheDocument());
    expect(screen.queryByText('Últimos 200')).not.toBeInTheDocument();
    expect(screen.queryByText(/fora do recorte/)).not.toBeInTheDocument();
  });
});
