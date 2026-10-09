import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WarRoomAgentCard } from '../war-room/WarRoomAgentCard';
import { WarRoomQueueRow } from '../war-room/WarRoomQueueRow';
import { WarRoomAlertRow } from '../war-room/WarRoomAlertRow';

const mockAgent = {
  id: 'agent-1',
  name: 'Agente Teste',
  status: 'online' as const,
  activeChats: 3,
  maxChats: 5,
  avgResponseTime: 45,
  resolvedToday: 12,
  satisfaction: 4.2,
};

const mockQueue = {
  id: 'queue-1',
  name: 'Fila Teste',
  color: 'hsl(var(--primary))',
  waiting: 10,
  inProgress: 5,
  avgWaitTime: 3.5,
  slaBreaches: 0,
  slaWarnings: 2,
};

const mockAlert = {
  id: 'alert-1',
  type: 'warning' as const,
  title: 'Alerta de teste',
  message: 'Mensagem de teste',
  timestamp: new Date(),
};

describe('a11y: barras de progresso e botões sós de ícone com nome acessível', () => {
  it('Progress em WarRoomAgentCard tem nome acessível', () => {
    render(<WarRoomAgentCard agent={mockAgent} onClick={() => {}} />);
    expect(screen.getByRole('progressbar', { name: /utilização do agente/i })).toBeInTheDocument();
  });

  it('Progress em WarRoomQueueRow tem nome acessível', () => {
    render(<WarRoomQueueRow queue={mockQueue} onClick={() => {}} />);
    expect(screen.getByRole('progressbar', { name: /utilização da fila/i })).toBeInTheDocument();
  });

  it('botão dispensar em WarRoomAlertRow tem nome acessível', () => {
    render(<WarRoomAlertRow alert={mockAlert} onDismiss={() => {}} />);
    expect(screen.getByRole('button', { name: /dispensar alerta/i })).toBeInTheDocument();
  });
});