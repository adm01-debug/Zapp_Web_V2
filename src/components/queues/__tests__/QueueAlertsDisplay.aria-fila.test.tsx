import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueueAlertsDisplay } from '../QueueAlertsDisplay';
import type { QueueAlert } from '@/hooks/business/useQueueGoals';

// O botao de dispensar e um icone X sem texto: o nome acessivel vem todo do
// aria-label. Sem o nome da fila, duas filas em alerta do MESMO tipo produzem
// dois botoes de nome identico e o operador que navega por leitor de tela nao
// sabe qual dos dois esta dispensando. Melhoria recuperada da branch
// b46eabe4279840549ce47ba3b42e07422e897d20 (fechada); veredito em
// analise-prs/VEREDITOS-71-FECHADAS-261116.md.

function alerta(over: Partial<QueueAlert> = {}): QueueAlert {
  return {
    type: 'waiting_contacts',
    queueId: 'q1',
    queueName: 'Suporte',
    queueColor: '#ff0000',
    message: 'muitos contatos aguardando',
    severity: 'warning',
    currentValue: 12,
    threshold: 5,
    ...over,
  };
}

describe('QueueAlertsDisplay — nome acessivel do botao de dispensar', () => {
  it('inclui o nome da fila no aria-label', () => {
    render(<QueueAlertsDisplay alerts={[alerta()]} onDismiss={() => {}} />);
    expect(
      screen.getByRole('button', { name: 'Dispensar alerta da fila Suporte: contatos aguardando' }),
    ).toBeTruthy();
  });

  it('duas filas no mesmo tipo de alerta geram botoes de nome DISTINTO', () => {
    render(
      <QueueAlertsDisplay
        alerts={[
          alerta({ queueId: 'q1', queueName: 'Suporte' }),
          alerta({ queueId: 'q2', queueName: 'Financeiro' }),
        ]}
        onDismiss={() => {}}
      />,
    );
    const nomes = screen
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'))
      .filter((n): n is string => !!n);
    expect(nomes).toHaveLength(2);
    expect(new Set(nomes).size).toBe(2);
    expect(nomes).toContain('Dispensar alerta da fila Suporte: contatos aguardando');
    expect(nomes).toContain('Dispensar alerta da fila Financeiro: contatos aguardando');
  });

  it('mantem o tipo do alerta no nome, para cada tipo', () => {
    render(
      <QueueAlertsDisplay
        alerts={[
          alerta({ queueId: 'q1', type: 'wait_time' }),
          alerta({ queueId: 'q1', type: 'assignment_rate' }),
          alerta({ queueId: 'q1', type: 'messages_pending' }),
        ]}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Dispensar alerta da fila Suporte: tempo de espera' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dispensar alerta da fila Suporte: taxa de atribuição' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dispensar alerta da fila Suporte: mensagens pendentes' })).toBeTruthy();
  });

  it('sem onDismiss nao renderiza botao nenhum', () => {
    render(<QueueAlertsDisplay alerts={[alerta()]} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
