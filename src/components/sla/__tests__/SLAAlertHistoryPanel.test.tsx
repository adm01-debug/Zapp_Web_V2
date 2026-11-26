/**
 * Painel de alertas de SLA — estados e ações.
 *
 * O hook é dublado; o que se prova aqui é a tela: carregando ≠ erro ≠ vazio, o nome do contato não
 * desaparece, "Resolver" só aparece para supervisão e só nos alertas abertos, e o filtro de status
 * chega ao hook.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { SlaAlertEvent, SlaAlertFilters } from '@/hooks/sla/useSlaAlertEvents';

const estado = {
  alerts: [] as SlaAlertEvent[],
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
  resolve: vi.fn(),
  resolvingId: null as string | null,
};
const filtrosVistos: Array<SlaAlertFilters | undefined> = [];
let supervisor = true;

vi.mock('@/hooks/sla/useSlaAlertEvents', () => ({
  DEFAULT_SLA_ALERT_FILTERS: { status: 'ativos', type: 'todos', severity: 'todas' },
  useSlaAlertEvents: (filters?: SlaAlertFilters) => {
    filtrosVistos.push(filters);
    return estado;
  },
}));

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ isSupervisor: supervisor, isAdmin: supervisor, roles: [] }),
}));

import { SLAAlertHistoryPanel } from '../SLAAlertHistoryPanel';
import { slaAlertContactLabel } from '../slaAlertLabels';

const alerta = (id: string, extra: Partial<SlaAlertEvent> = {}): SlaAlertEvent => ({
  id,
  contactId: 'c-1',
  contactName: 'Ana Souza',
  contactPhone: '+55 11 90000-0000',
  alertType: 'first_response',
  severity: 'breached',
  createdAt: '2026-11-26T12:00:00.000Z',
  resolvedAt: null,
  resolvedBy: null,
  queueId: null,
  ...extra,
});

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('dark');
  estado.alerts = [];
  estado.isLoading = false;
  estado.isError = false;
  estado.resolvingId = null;
  estado.refetch.mockClear();
  estado.resolve.mockClear();
  filtrosVistos.length = 0;
  supervisor = true;
});

describe('slaAlertContactLabel', () => {
  it('cai do nome para o telefone e, sem os dois, para o id curto', () => {
    expect(slaAlertContactLabel(alerta('e1'))).toBe('Ana Souza');
    expect(slaAlertContactLabel(alerta('e1', { contactName: null }))).toBe('+55 11 90000-0000');
    expect(
      slaAlertContactLabel(alerta('e1', { contactName: null, contactPhone: null, contactId: 'abcdef12-3456' })),
    ).toBe('Contato abcdef12');
  });
});

describe.each([['claro', false], ['escuro', true]] as const)('SLAAlertHistoryPanel (%s)', (_tema, escuro) => {
  const montar = () => {
    if (escuro) document.documentElement.classList.add('dark');
    render(<SLAAlertHistoryPanel />);
  };

  it('CARREGANDO: mostra esqueleto, não "vazio"', () => {
    estado.isLoading = true;
    montar();
    expect(screen.getByTestId('sla-alertas-carregando')).toBeInTheDocument();
    expect(screen.queryByTestId('sla-alertas-vazio')).toBeNull();
  });

  it('ERRO: estado de erro com "Tentar de novo" que refaz a consulta', () => {
    estado.isError = true;
    montar();
    expect(screen.getByTestId('sla-alertas-erro')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tentar de novo/ }));
    expect(estado.refetch).toHaveBeenCalled();
  });

  it('ATUALIZAR: o botão refaz a consulta (a tabela não está na publicação de Realtime)', () => {
    montar();
    fireEvent.click(screen.getByTestId('sla-alertas-atualizar'));
    expect(estado.refetch).toHaveBeenCalledTimes(1);
  });

  it('VAZIO: diz que não há alerta aberto', () => {
    montar();
    expect(screen.getByTestId('sla-alertas-vazio')).toHaveTextContent('Nenhum alerta de SLA aberto');
  });

  it('LISTA: mostra contato, tipo, severidade e resolve o alerta aberto', () => {
    estado.alerts = [alerta('e1'), alerta('e2', { resolvedAt: '2026-11-26T13:00:00.000Z' })];
    montar();

    const primeiro = screen.getByTestId('sla-alerta-e1');
    expect(primeiro).toHaveTextContent('Ana Souza');
    expect(primeiro).toHaveTextContent('Primeira resposta');
    expect(primeiro).toHaveTextContent('Violado');
    expect(primeiro).toHaveTextContent('Aberto');
    expect(screen.getByTestId('sla-alerta-e2')).toHaveTextContent('Resolvido');

    const resolver = screen.getAllByRole('button', { name: /Resolver/ });
    expect(resolver).toHaveLength(1);
    fireEvent.click(resolver[0]);
    expect(estado.resolve).toHaveBeenCalledWith('e1');
  });

  it('SEM SUPERVISÃO: explica quem resolve, sem botão', () => {
    supervisor = false;
    estado.alerts = [alerta('e1')];
    montar();
    expect(screen.queryByRole('button', { name: /Resolver/ })).toBeNull();
    expect(screen.getByText('Só a supervisão resolve')).toBeInTheDocument();
  });

  it('RESOLVENDO: botão fica desabilitado no alerta em envio', () => {
    estado.alerts = [alerta('e1')];
    estado.resolvingId = 'e1';
    montar();
    expect(screen.getByRole('button', { name: /Resolver/ })).toBeDisabled();
  });

  it('FILTRO: trocar para "Resolvidos" refaz a consulta com o status novo', () => {
    montar();
    const ultimo = () => filtrosVistos[filtrosVistos.length - 1];
    expect(ultimo()).toEqual({ status: 'ativos', type: 'todos', severity: 'todas' });
    fireEvent.click(screen.getByRole('radio', { name: 'Resolvidos' }));
    expect(ultimo()).toMatchObject({ status: 'resolvidos' });
  });
});
