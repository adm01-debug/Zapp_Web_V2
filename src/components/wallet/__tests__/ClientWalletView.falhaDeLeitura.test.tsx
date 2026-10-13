/**
 * ClientWalletView — a tela não pode afirmar o que não leu (R2-API-068).
 *
 * O sujeito aqui é a tela REAL com o `useClientWallet` REAL: só a fronteira de
 * rede (`@/integrations/supabase/client`) é dublada. O que está em prova é que a
 * falha de leitura vira aviso persistente e que a tela **deixa de dizer**
 * "Nenhuma regra configurada" quando a leitura foi recusada — não ler não
 * confirma que não existe.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  tables: {} as Record<string, { data: unknown; error: unknown }>,
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      const mesmo = () => builder;
      for (const metodo of ['select', 'order', 'in', 'eq', 'limit', 'maybeSingle']) {
        builder[metodo] = () => mesmo();
      }
      builder.insert = () => mesmo();
      builder.update = () => mesmo();
      builder.delete = () => mesmo();
      builder.then = (ok?: (v: unknown) => unknown, falhou?: (e: unknown) => unknown) =>
        Promise.resolve(h.tables[table] ?? { data: [], error: null }).then(ok, falhou);
      return builder;
    },
  },
}));

import { ClientWalletView } from '../ClientWalletView';

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('ClientWalletView — falha de leitura das regras não vira "nenhuma regra"', () => {
  beforeEach(() => {
    h.tables = {};
    vi.clearAllMocks();
  });

  it('leitura recusada pelo banco vira aviso com o motivo, e a tela não afirma que não há regras', async () => {
    h.tables['client_wallet_rules'] = {
      data: null,
      error: { message: 'permission denied for table client_wallet_rules' },
    };

    render(<ClientWalletView />, { wrapper: Wrapper });

    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent('Não foi possível carregar as regras da carteira');
    expect(aviso).toHaveTextContent('permission denied for table client_wallet_rules');
    expect(screen.queryByText('Nenhuma regra configurada')).not.toBeInTheDocument();
  });

  it('leitura boa e lista vazia mantém o estado vazio, sem aviso', async () => {
    render(<ClientWalletView />, { wrapper: Wrapper });

    expect(await screen.findByText('Nenhuma regra configurada')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
