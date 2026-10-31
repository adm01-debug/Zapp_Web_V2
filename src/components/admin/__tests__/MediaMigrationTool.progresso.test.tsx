import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => {
  const makeChain = () => {
    const chain: Record<string, unknown> = {};
    chain.like = vi.fn(() => Promise.resolve({ count: 0, error: null }));
    chain.eq = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
    chain.in = vi.fn(() => Promise.resolve({ data: [], error: null }));
    return chain;
  };
  return {
    supabase: {
      from: vi.fn(() => ({ select: vi.fn(() => makeChain()) })),
    },
  };
});
vi.mock('@/lib/invokeEdge', () => ({
  invokeEdge: vi.fn(() => new Promise(() => {})),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { MediaMigrationTool } from '../MediaMigrationTool';

describe('MediaMigrationTool — progresso durante a migração', () => {
  it('usa progressbar indeterminado com nome acessível, sem percentual fixo', () => {
    render(<MediaMigrationTool />);
    // Abre o dialog de confirmação
    fireEvent.click(screen.getByRole('button', { name: /Iniciar Migração/ }));
    // Confirma para iniciar a migração (chama runMigration → running=true)
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar migração' }));
    const barra = screen.getByRole('progressbar', { name: 'Progresso da migração de mídia' });
    expect(barra).toBeInTheDocument();
    expect(screen.getByText(/Processando mídias/)).toBeInTheDocument();
    expect(barra).not.toHaveAttribute('aria-valuenow');
    expect(barra).toHaveAttribute('data-state', 'indeterminate');
  });
});
