import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WidgetConfigSheet } from '../WidgetConfigSheet';
import type { DashboardWidget } from '@/hooks/analytics/useDashboardWidgets';

// #fix — o WidgetConfigSheet existia pronto mas nada o abria na Visão Geral.
// Aqui provamos o comportamento do painel montado: abrir, reordenar por teclado
// com anúncio aria-live, travar os cartões fixos e restaurar o padrão.
const widgets: DashboardWidget[] = [
  { id: 'stats', title: 'Estatísticas', type: 'stats', visible: true, order: 0, size: 'full', column: 0, row: 0, width: 4, height: 1, level: 1 },
  { id: 'challenges', title: 'Desafios do Dia', type: 'challenges', visible: true, order: 1, size: 'full', column: 0, row: 1, width: 4, height: 1, level: 2 },
  { id: 'queues', title: 'Status das Filas', type: 'queues', visible: true, order: 2, size: 'medium', column: 0, row: 2, width: 2, height: 1, level: 2 },
  { id: 'activity', title: 'Atividade Recente', type: 'activity', visible: true, order: 3, size: 'medium', column: 2, row: 2, width: 2, height: 1, level: 2 },
  { id: 'ai-stats', title: 'IA Stats', type: 'ai-stats', visible: false, order: 4, size: 'medium', column: 0, row: 3, width: 2, height: 1, level: 3 },
];

function abrirPainel() {
  const props = {
    widgets,
    isEditMode: false,
    setIsEditMode: vi.fn(),
    onToggleVisibility: vi.fn(),
    onUpdateSize: vi.fn(),
    onReorder: vi.fn(),
    onReset: vi.fn(),
  };
  render(<WidgetConfigSheet {...props} />);
  fireEvent.click(screen.getByTestId('btn-personalizar'));
  return props;
}

describe('WidgetConfigSheet — personalização da Visão Geral', () => {
  it('abre pelo botão "Personalizar" e lista todos os widgets', () => {
    abrirPainel();
    expect(screen.getByTestId('widget-config-stats')).toBeTruthy();
    expect(screen.getByTestId('widget-config-challenges')).toBeTruthy();
    expect(screen.getByTestId('widget-config-ai-stats')).toBeTruthy();
  });

  it('trava os cartões fixos (stats/queues/activity) como obrigatórios', () => {
    const props = abrirPainel();
    expect(screen.getByRole('switch', { name: 'Mostrar Estatísticas' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Mostrar Status das Filas' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Mostrar Atividade Recente' })).toBeDisabled();

    // Clicar no switch travado não muda a visibilidade.
    fireEvent.click(screen.getByRole('switch', { name: 'Mostrar Estatísticas' }));
    expect(props.onToggleVisibility).not.toHaveBeenCalled();
  });

  it('permite desligar um widget não obrigatório', () => {
    const props = abrirPainel();
    fireEvent.click(screen.getByRole('switch', { name: 'Mostrar Desafios do Dia' }));
    expect(props.onToggleVisibility).toHaveBeenCalledWith('challenges');
  });

  it('reordena por teclado (setas) e anuncia em aria-live', () => {
    const props = abrirPainel();
    fireEvent.click(screen.getByRole('button', { name: 'Mover Estatísticas para baixo' }));
    expect(props.onReorder).toHaveBeenCalledWith(0, 1);
    expect(screen.getByRole('status').textContent).toContain('Estatísticas movido para a posição 2 de 5');
  });

  it('desabilita subir no primeiro e descer no último', () => {
    abrirPainel();
    expect(screen.getByRole('button', { name: 'Mover Estatísticas para cima' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Mover IA Stats para baixo' })).toBeDisabled();
  });

  it('restaura o padrão pelo botão "Restaurar Padrão"', () => {
    const props = abrirPainel();
    fireEvent.click(screen.getByRole('button', { name: /Restaurar Padrão/i }));
    expect(props.onReset).toHaveBeenCalledTimes(1);
  });
});
