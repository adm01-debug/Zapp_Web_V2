import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => {
  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.like = () => Promise.resolve({ data: null, error: null, count: 0 });
  q.eq = () => q;
  q.order = () => q;
  q.limit = () => Promise.resolve({ data: [], error: null });
  q.in = () => Promise.resolve({ data: [], error: null });
  return {
    supabase: {
      from: () => q,
      functions: { invoke: vi.fn(() => new Promise(() => {})) },
    },
  };
});
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { MediaMigrationTool } from '../MediaMigrationTool';

describe('MediaMigrationTool — progresso durante a migração', () => {
  it('usa progressbar indeterminado com nome acessível, sem percentual fixo', () => {
    render(<MediaMigrationTool />);

    fireEvent.click(screen.getByRole('button', { name: /Iniciar Migração/ }));

    // Mantém role="progressbar" com o nome que o N-066 exige no estado em execução...
    const barra = screen.getByRole('progressbar', { name: 'Progresso da migração de mídia' });
    expect(barra).toBeInTheDocument();
    expect(screen.getByText('Processando mídias...')).toBeInTheDocument();
    // ...mas indeterminado: a barra antiga era um <Progress value={30}> — percentual inventado.
    expect(barra).not.toHaveAttribute('aria-valuenow');
    expect(barra).toHaveAttribute('data-state', 'indeterminate');
  });
});
