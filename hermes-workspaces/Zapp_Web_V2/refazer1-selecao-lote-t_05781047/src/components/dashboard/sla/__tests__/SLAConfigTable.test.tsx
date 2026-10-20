import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';

const mockState = vi.hoisted(() => ({ showDialog: false }));

vi.mock('@/hooks/sla/useSLAConfigurations', () => ({
  useSLAConfigurations: () => ({
    configs: [
      { id: '1', name: 'SLA Crítico', first_response_minutes: 5, priority: 'critical', is_default: false, is_active: true },
      { id: '2', name: 'SLA Baixo', first_response_minutes: 120, priority: 'low', is_default: false, is_active: false },
    ],
    isLoading: false,
    form: { name: '', first_response_minutes: 15, resolution_minutes: 120, priority: 'medium', is_default: false },
    setForm: vi.fn(),
    showDialog: mockState.showDialog,
    setShowDialog: vi.fn(),
    editingId: null,
    saveMutation: { isPending: false, mutate: vi.fn() },
    toggleMutation: { mutate: vi.fn() },
    deleteMutation: { mutate: vi.fn() },
    openEdit: vi.fn(),
    openCreate: vi.fn(),
  }),
  PRIORITY_CONFIG: {
    critical: { label: 'Crítica', color: 'bg-destructive/20 text-destructive border-destructive/30' },
    high: { label: 'Alta', color: 'bg-warning/20 text-warning border-warning/30' },
    medium: { label: 'Média', color: 'bg-warning/20 text-warning border-warning/30' },
    low: { label: 'Baixa', color: 'bg-success/20 text-success border-success/30' },
  },
}));

import { SLAConfigTable } from '../SLAConfigTable';

describe('SLAConfigTable — nomes acessíveis nos controles da tabela', () => {
  it('Switch da linha inclui o nome da regra no aria-label (sempre Ativar)', () => {
    render(<SLAConfigTable />);
    expect(screen.getByRole('switch', { name: 'Ativar SLA Crítico' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Ativar SLA Baixo' })).toBeInTheDocument();
  });

  it('botão de editar inclui o nome da regra no aria-label', () => {
    render(<SLAConfigTable />);
    expect(screen.getByRole('button', { name: 'Editar SLA SLA Crítico' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar SLA SLA Baixo' })).toBeInTheDocument();
  });

  it('botão de excluir inclui o nome da regra no aria-label', () => {
    render(<SLAConfigTable />);
    expect(screen.getByRole('button', { name: 'Excluir SLA SLA Crítico' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir SLA SLA Baixo' })).toBeInTheDocument();
  });

  it('diálogo aberto: combobox Prioridade e switch SLA padrão têm nome', async () => {
    mockState.showDialog = true;
    try {
      render(<SLAConfigTable />);
      expect(screen.getByRole('combobox', { name: 'Prioridade' })).toBeInTheDocument();
      expect(screen.getByRole('switch', { name: 'SLA padrão' })).toBeInTheDocument();
      const results = await axe(document.body);
      expect(results).toHaveNoViolations();
    } finally {
      mockState.showDialog = false;
    }
  });

  it('não tem violacoes de acessibilidade', async () => {
    const { container } = render(<SLAConfigTable />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
