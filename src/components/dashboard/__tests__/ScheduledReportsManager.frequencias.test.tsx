import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { createElement } from 'react';

// DASH-CONTROLS-001 (ponto 5): o tile `biweekly` dizia "Personalizada / Sob
// demanda" enquanto a linha do relatório mostrava "Quinzenal" — dois rótulos
// para a mesma periodicidade. Pior: o executor real (send-scheduled-report →
// calculateNextSend) só agenda daily/weekly/monthly, então "Quinzenal" nunca
// era agendado de verdade. Agora existe UM mapa de rótulos e só se oferece o
// que o executor sabe executar; biweekly continua exibido para configs legadas.

const h = vi.hoisted(() => ({ hook: vi.fn() }));

vi.mock('@/hooks/dashboard/useScheduledReportConfigs', () => ({
  useScheduledReportConfigs: () => h.hook(),
}));

// Radix Select → lista simples para inspecionar as opções ofertadas.
vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) =>
    createElement('li', { 'data-value': value }, children),
}));

import { ScheduledReportsManager } from '../ScheduledReportsManager';

const cfgBiweekly = {
  id: 'r1', name: 'Relatório quinzenal legado', report_type: 'performance',
  frequency: 'biweekly', recipients: ['a@b.c'], is_active: true,
  last_sent_at: null, next_send_at: null, created_by: null, config: {},
  created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
};

beforeEach(() => {
  h.hook.mockReturnValue({
    configs: [cfgBiweekly], isLoading: false,
    createConfig: { mutate: vi.fn(), isPending: false },
    toggleActive: { mutate: vi.fn() },
    deleteConfig: { mutate: vi.fn() },
  });
});

describe('ScheduledReportsManager — um só mapa de rótulos, alinhado ao executor', () => {
  it('config legada biweekly é exibida como "Quinzenal" (rótulo único)', () => {
    render(<ScheduledReportsManager />);
    // aparece na linha do relatório e no filtro de frequência (mesmo rótulo)
    expect(screen.getAllByText('Quinzenal').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Personalizada')).not.toBeInTheDocument();
    expect(screen.queryByText('Sob demanda')).not.toBeInTheDocument();
  });

  it('os tiles de frequência usam os mesmos rótulos da listagem e não oferecem biweekly', () => {
    render(<ScheduledReportsManager />);
    const card = screen.getByTestId('reports-freq-card');
    // Antes: tile biweekly rotulado "Personalizada / Sob demanda".
    for (const label of ['Diário', 'Semanal', 'Mensal']) {
      expect(within(card).getByText(label)).toBeInTheDocument();
    }
    expect(within(card).queryByText('Quinzenal')).not.toBeInTheDocument();
    expect(within(card).queryByText('Personalizada')).not.toBeInTheDocument();
  });

  it('o diálogo de criação só oferece frequências que o executor agenda', () => {
    render(<ScheduledReportsManager />);
    fireEvent.click(screen.getByRole('button', { name: /Novo Relatório/i }));
    const dialog = screen.getByRole('dialog');
    const freqValues = within(dialog).getAllByRole('listitem')
      .map(li => li.getAttribute('data-value'));
    // O diálogo tem dois selects (Tipo e Frequência); o de frequência é o que
    // contém 'daily' — os valores dele não podem incluir 'biweekly'.
    const freqSelect = freqValues.filter(v => ['daily', 'weekly', 'monthly', 'biweekly'].includes(v!));
    expect(freqSelect.sort()).toEqual(['daily', 'monthly', 'weekly']);
    expect(freqSelect).not.toContain('biweekly');
  });
});
