import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ScheduledReportsManager, MAX_DESTINATARIOS } from '../ScheduledReportsManager';

// Três defeitos da tela de Relatórios Agendados do dashboard:
//  (1) a lista nunca mostrava quando o relatório foi enviado pela última vez;
//  (2) o lixo excluía no primeiro clique, sem confirmação e sem nome acessível;
//  (3) o campo de destinatários gravava qualquer texto (o que a Edge depois
//      tentava enviar) e a lista repetia/aceitava endereço vazio.
// A prova renderiza o componente REAL: só o hook de dados é mockado.
const mocks = vi.hoisted(() => ({
  configs: [] as Array<Record<string, unknown>>,
  createMutate: vi.fn(),
  deleteMutate: vi.fn(),
}));

vi.mock('@/hooks/dashboard/useScheduledReportConfigs', () => ({
  useScheduledReportConfigs: () => ({
    configs: mocks.configs,
    isLoading: false,
    createConfig: { mutate: mocks.createMutate, isPending: false },
    toggleActive: { mutate: vi.fn() },
    deleteConfig: { mutate: mocks.deleteMutate, isPending: false },
  }),
}));

const configBase = {
  id: 'cfg-1',
  name: 'Fechamento do mês',
  report_type: 'performance',
  frequency: 'monthly',
  recipients: ['gestor@promobrindes.com.br'],
  is_active: true,
  created_at: '2026-10-08T12:00:00.000Z',
};

function abrirFormulario() {
  fireEvent.click(screen.getByText('Novo Relatório'));
}

function preencher(token: string, destinatarios: string) {
  fireEvent.change(screen.getByPlaceholderText('Ex: Relatório semanal de performance'), {
    target: { value: token },
  });
  fireEvent.change(screen.getByPlaceholderText('email1@empresa.com, email2@empresa.com'), {
    target: { value: destinatarios },
  });
}

describe('ScheduledReportsManager — último envio e status', () => {
  beforeEach(() => {
    mocks.configs.length = 0;
    mocks.createMutate.mockClear();
    mocks.deleteMutate.mockClear();
  });

  it('mostra "Último envio há X" quando a Edge já registrou o envio', () => {
    const daquiADoisDias = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    mocks.configs.push({ ...configBase, last_sent_at: daquiADoisDias });

    render(<ScheduledReportsManager />);

    expect(screen.getByText('Último envio há 2 dias')).toBeInTheDocument();
  });

  it('mostra "Nunca enviado" quando last_sent_at é nulo', () => {
    mocks.configs.push({ ...configBase, last_sent_at: null });

    render(<ScheduledReportsManager />);

    expect(screen.getByText('Nunca enviado')).toBeInTheDocument();
  });
});

describe('ScheduledReportsManager — exclusão confirmada e acessível', () => {
  beforeEach(() => {
    mocks.configs.length = 0;
    mocks.deleteMutate.mockClear();
    mocks.configs.push({ ...configBase, last_sent_at: null });
  });

  it('o botão de excluir tem nome acessível e não exclui no primeiro clique', () => {
    render(<ScheduledReportsManager />);

    fireEvent.click(screen.getByRole('button', { name: 'Excluir relatório Fechamento do mês' }));

    expect(mocks.deleteMutate).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Excluir relatório agendado')).toBeInTheDocument();
    expect(within(dialog).getByText(/Fechamento do mês/)).toBeInTheDocument();
  });

  it('cancelar fecha a confirmação sem excluir', () => {
    render(<ScheduledReportsManager />);

    fireEvent.click(screen.getByRole('button', { name: 'Excluir relatório Fechamento do mês' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));

    expect(mocks.deleteMutate).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('confirmar exclui o relatório escolhido', () => {
    render(<ScheduledReportsManager />);

    fireEvent.click(screen.getByRole('button', { name: 'Excluir relatório Fechamento do mês' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir' }));

    expect(mocks.deleteMutate).toHaveBeenCalledTimes(1);
    expect(mocks.deleteMutate.mock.calls[0][0]).toBe('cfg-1');
  });
});

describe('ScheduledReportsManager — destinatários validados', () => {
  beforeEach(() => {
    mocks.configs.length = 0;
    mocks.createMutate.mockClear();
  });

  it('barra e-mail com formato inválido, com aviso na tela', () => {
    render(<ScheduledReportsManager />);
    abrirFormulario();
    preencher('Fechamento', 'sem-arroba, gestor@promobrindes.com.br');

    expect(screen.getByRole('alert')).toHaveTextContent('E-mail inválido: sem-arroba');
    fireEvent.click(screen.getByText('Criar relatório'));
    expect(mocks.createMutate).not.toHaveBeenCalled();
  });

  it('barra e-mail de fora do domínio da empresa', () => {
    render(<ScheduledReportsManager />);
    abrirFormulario();
    preencher('Fechamento', 'gestor@outrodominio.com');

    expect(screen.getByRole('alert')).toHaveTextContent('@promobrindes.com.br');
    fireEvent.click(screen.getByText('Criar relatório'));
    expect(mocks.createMutate).not.toHaveBeenCalled();
  });

  it(`barra mais de ${MAX_DESTINATARIOS} destinatários`, () => {
    const muitos = Array.from({ length: MAX_DESTINATARIOS + 1 }, (_, i) => `pessoa${i}@promobrindes.com.br`);
    render(<ScheduledReportsManager />);
    abrirFormulario();
    preencher('Fechamento', muitos.join(', '));

    expect(screen.getByRole('alert')).toHaveTextContent(`Máximo de ${MAX_DESTINATARIOS} destinatários`);
    fireEvent.click(screen.getByText('Criar relatório'));
    expect(mocks.createMutate).not.toHaveBeenCalled();
  });

  it('grava os destinatários sem espaços e sem repetidos', () => {
    render(<ScheduledReportsManager />);
    abrirFormulario();
    preencher('Fechamento', ' gestor@promobrindes.com.br , gestor@promobrindes.com.br ');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Criar relatório'));

    expect(mocks.createMutate).toHaveBeenCalledTimes(1);
    expect(mocks.createMutate.mock.calls[0][0]).toMatchObject({
      name: 'Fechamento',
      recipients: ['gestor@promobrindes.com.br'],
    });
  });
});
