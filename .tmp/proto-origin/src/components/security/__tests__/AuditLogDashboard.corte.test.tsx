import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuditLogDashboard } from '../AuditLogDashboard';

const linha = (id: string) => ({
  id, action: 'login', entity_type: 'user', entity_id: 'u', user_id: 'uid',
  details: null, ip_address: null, user_agent: null, created_at: new Date().toISOString(),
});

const estado = vi.hoisted(() => ({ dados: [] as unknown[] }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(() => {
            const resultado = Promise.resolve({ data: estado.dados, error: null });
            const construtor = {
              eq: () => construtor,
              in: () => construtor,
              like: () => construtor,
              then: resultado.then.bind(resultado),
            };
            return construtor;
          }),
        })),
      })),
    })),
  },
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

  it('com a página cheia (200) avisa o recorte e rotula "Últimos 200"', async () => {
    estado.dados = Array.from({ length: 200 }, (_, i) => linha(String(i)));
    render(<AuditLogDashboard />);

    await waitFor(() => expect(screen.getByText('Últimos 200')).toBeInTheDocument());
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
