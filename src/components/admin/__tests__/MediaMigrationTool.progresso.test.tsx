import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn(() => new Promise(() => {})) } },
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { MediaMigrationTool } from '../MediaMigrationTool';

describe('MediaMigrationTool — progresso durante a migração', () => {
  it('usa progressbar indeterminado nomeado, sem percentual fixo de 30%', () => {
    render(<MediaMigrationTool />);

    fireEvent.click(screen.getByRole('button', { name: /Iniciar Migração/ }));

    // Mantém role progressbar com nome acessível (compatível com N-066).
    const barra = screen.getByRole('progressbar', { name: 'Progresso da migração de mídia' });
    expect(barra).toBeInTheDocument();
    // Indeterminado: sem aria-valuenow (a barra antiga era <Progress value={30}>).
    expect(barra).not.toHaveAttribute('aria-valuenow');
    expect(screen.getByText('Processando mídias...')).toBeInTheDocument();
  });
});
