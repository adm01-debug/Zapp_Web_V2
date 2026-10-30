import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Visao `supervisao` — ferramentas do supervisor (Fila, Copiloto, Sala de Crise,
 * Playbooks e Treinamento).
 *
 * Antes elas so existiam como abas do AdminView, atras da visao `admin`
 * (ADMIN_ONLY): o supervisor nao alcancava nenhuma. Aqui o que se prova e que a
 * visao entrega as cinco ferramentas ao supervisor/admin e fecha a porta para o
 * atendente — sem depender do AdminView.
 */

const roleState = { isSupervisor: true, isAdmin: false, loading: false };

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => roleState,
}));

// Blocos reais viram stubs: o que esta sob teste e a composicao da visao.
vi.mock('@/components/queues/QueuesView', () => ({
  QueuesView: () => <div data-testid="queue-ok" />,
}));
vi.mock('../SupervisorCopilot', () => ({
  SupervisorCopilot: () => <div data-testid="copilot-ok" />,
}));
vi.mock('../CrisisRoom', () => ({
  CrisisRoom: () => <div data-testid="crisis-ok" />,
}));
vi.mock('../PlaybooksManager', () => ({
  PlaybooksManager: () => <div data-testid="playbooks-ok" />,
}));
vi.mock('../TrainingMode', () => ({
  TrainingMode: () => <div data-testid="training-ok" />,
}));

import { SupervisaoView } from '@/components/admin/SupervisaoView';

const ABAS = ['Filas', 'Copiloto IA', 'Sala de Crise', 'Playbooks', 'Treinamento'] as const;

afterEach(() => {
  cleanup();
  roleState.isSupervisor = true;
  roleState.isAdmin = false;
  roleState.loading = false;
});

describe('SupervisaoView — ferramentas do supervisor', () => {
  it('mostra as cinco abas para o supervisor e abre na Fila', () => {
    render(<SupervisaoView />);

    for (const aba of ABAS) {
      expect(screen.getByRole('tab', { name: aba })).toBeInTheDocument();
    }
    expect(screen.getByTestId('queue-ok')).toBeInTheDocument();
  });

  it('cada aba entrega a ferramenta correspondente (supervisor alcanca todas)', () => {
    render(<SupervisaoView />);

    const provas: [string, string][] = [
      ['Copiloto IA', 'copilot-ok'],
      ['Sala de Crise', 'crisis-ok'],
      ['Playbooks', 'playbooks-ok'],
      ['Treinamento', 'training-ok'],
    ];

    for (const [aba, testId] of provas) {
      fireEvent.mouseDown(screen.getByRole('tab', { name: aba }));
      fireEvent.click(screen.getByRole('tab', { name: aba }));
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    }
  });

  it('nao mostra a tela de CRM do admin: a visao e so das ferramentas de supervisao', () => {
    render(<SupervisaoView />);

    expect(screen.queryByRole('tab', { name: /CRM 360/ })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Auditoria/ })).toBeNull();
  });

  it('fecha a porta para quem nao tem papel de supervisao (atendente)', () => {
    roleState.isSupervisor = false;
    roleState.isAdmin = false;

    render(<SupervisaoView />);

    expect(screen.getByText('Acesso Restrito')).toBeInTheDocument();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByTestId('queue-ok')).toBeNull();
  });

  it('espera o papel carregar antes de decidir (nao libera nem bloqueia com papel desconhecido)', () => {
    roleState.isSupervisor = false;
    roleState.loading = true;

    render(<SupervisaoView />);

    expect(screen.queryByText('Acesso Restrito')).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
  });
});
