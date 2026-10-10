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
  it('usa indicador indeterminado, sem percentual fixo de 30%', () => {
    render(<MediaMigrationTool />);

    fireEvent.click(screen.getByRole('button', { name: /Iniciar Migração/ }));

    expect(screen.getByRole('status', { name: 'Migração em andamento' })).toBeInTheDocument();
    expect(screen.getByText('Processando mídias...')).toBeInTheDocument();
    // A barra antiga era um <Progress value={30}> — percentual inventado.
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
