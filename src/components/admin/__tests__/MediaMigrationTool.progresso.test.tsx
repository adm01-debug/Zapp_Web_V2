import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn(() => new Promise(() => {})) } },
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { MediaMigrationTool } from '../MediaMigrationTool';

describe('MediaMigrationTool — progresso durante a migração', () => {
  it('usa progressbar indeterminado com nome acessível, sem percentual fixo', async () => {
    render(<MediaMigrationTool />);

    // A execução pede confirmação (alertdialog) antes de disparar a Edge.
    fireEvent.click(screen.getByRole('button', { name: /Iniciar Migração/ }));
    const dialogo = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Iniciar migração' }));

    // Mantém role="progressbar" com o nome que o N-066 exige no estado em execução...
    const barra = await screen.findByRole('progressbar', { name: 'Progresso da migração de mídia' });
    expect(barra).toBeInTheDocument();
    expect(screen.getByText(/Migrando mídias\.\.\./)).toBeInTheDocument();
    // ...mas indeterminado: a barra antiga era um <Progress value={30}> — percentual inventado.
    expect(barra).not.toHaveAttribute('aria-valuenow');
    expect(barra).toHaveAttribute('data-state', 'indeterminate');
  });
});
