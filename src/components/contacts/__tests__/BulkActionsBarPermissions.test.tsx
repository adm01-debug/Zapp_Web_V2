import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BulkActionsBar } from '../BulkActionsBar';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

const props = {
  selectedIds: ['a', 'b'],
  onClearSelection: vi.fn(),
  onActionComplete: vi.fn(),
};

describe('BulkActionsBar · alterar tipo em massa', () => {
  it('esconde "Tipo" para quem não é admin/supervisor (padrão)', () => {
    render(<BulkActionsBar {...props} />);
    expect(screen.queryByRole('button', { name: /Tipo/ })).not.toBeInTheDocument();
  });

  it('mostra "Tipo" para admin/supervisor', () => {
    render(<BulkActionsBar {...props} canChangeType />);
    expect(screen.getByRole('button', { name: /Tipo/ })).toBeInTheDocument();
  });
});
