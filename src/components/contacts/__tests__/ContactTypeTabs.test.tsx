import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ContactTypeTabs } from '../ContactTypeTabs';

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => true };
});

function renderTabs(counts: Record<string, number>, activeTab = 'all') {
  return render(<ContactTypeTabs activeTab={activeTab} setActiveTab={() => {}} contactCountByType={counts} />);
}

describe('ContactTypeTabs', () => {
  it('renderiza "Todos" + os 6 tipos canônicos na ordem de CONTACT_TYPES', () => {
    renderTabs({ all: 0 });
    const labels = screen.getAllByRole('tab').map(t => t.textContent?.replace(/[\d.]+$/, '').trim());
    expect(labels).toEqual([
      'Todos', 'Cliente', 'Fornecedor', 'Transportadora', 'Colaborador', 'Prestador de Serviço', 'Parceiro',
    ]);
  });

  it('badge aparece em "Todos" mesmo com 0 e nos tipos só quando count > 0', () => {
    renderTabs({ all: 0, cliente: 3, fornecedor: 0 });
    const tabs = screen.getAllByRole('tab');
    expect(within(tabs[0]).getByTestId('tab-count')).toHaveTextContent('0');
    expect(within(tabs[1]).getByTestId('tab-count')).toHaveTextContent('3');
    expect(within(tabs[2]).queryByTestId('tab-count')).toBeNull();
    expect(screen.getAllByTestId('tab-count')).toHaveLength(2);
  });

  it('formata contagens com separador pt-BR', () => {
    renderTabs({ all: 3104, cliente: 1234 });
    const counts = screen.getAllByTestId('tab-count').map(el => el.textContent);
    expect(counts).toEqual(['3.104', '1.234']);
  });
});
