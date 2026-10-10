import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { format, subDays } from 'date-fns';
import { TalkXMonitorHeader, type MonitorCampaign } from '../tracking/TalkXMonitorHeader';

// O jsdom não implementa captura de ponteiro; o gatilho do Select (Radix) chama
// `hasPointerCapture` no pointerdown que o abre.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

/**
 * TL-154 (X145) — cabeçalho da aba "Monitor" do módulo.
 *
 * O componente é renderizado de verdade: o que se prova aqui é o que a pessoa vê e
 * o que cada controle devolve para a tela (o dia, a segmentação, o status, a troca
 * de campanha e o botão atualizar). Quem lê os dados é a tela — ver
 * `TalkXView.monitor.test.tsx` para o recorte chegando na leitura.
 */

const isoDay = (date: Date) => format(date, 'yyyy-MM-dd');
const startedAt = subDays(new Date(), 2).toISOString();

const sending: MonitorCampaign = { id: 'c-sending', name: 'Campanha de hoje', status: 'sending', started_at: startedAt };
const paused: MonitorCampaign = { id: 'c-paused', name: 'Campanha pausada', status: 'paused', started_at: subDays(new Date(), 5).toISOString() };
const completed: MonitorCampaign = { id: 'c-done', name: 'Campanha concluída', status: 'completed', started_at: subDays(new Date(), 9).toISOString() };

/** Abre um select do cabeçalho pelo rótulo acessível (mesmo padrão da paginação). */
function abrirSelect(nome: string) {
  fireEvent.pointerDown(screen.getByRole('combobox', { name: nome }), {
    button: 0, ctrlKey: false, pointerType: 'mouse',
  });
}

function renderHeader(overrides: Partial<Parameters<typeof TalkXMonitorHeader>[0]> = {}) {
  const props = {
    campaign: sending,
    activeCampaigns: [sending, paused, completed],
    onSelectCampaign: vi.fn(),
    segments: [{ value: 'seg-vip', label: 'Clientes VIP' }],
    segment: 'all',
    onSegmentChange: vi.fn(),
    status: 'all',
    onStatusChange: vi.fn(),
    day: isoDay(new Date()),
    onDayChange: vi.fn(),
    onRefresh: vi.fn(),
    ...overrides,
  };
  render(<TalkXMonitorHeader {...props} />);
  return props;
}

afterEach(() => vi.clearAllMocks());

describe('TalkXMonitorHeader (X145)', () => {
  it('(1) mostra a trilha, o título do mock e o subtítulo sem citar o canal', () => {
    renderHeader();

    expect(screen.getByText('Teletransporte')).toBeTruthy();
    expect(screen.getByText('Chat')).toBeTruthy();
    expect(screen.getByText('Campanhas')).toBeTruthy();
    expect(screen.getByText('Talk X')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Monitor ao Vivo' })).toBeTruthy();
    expect(screen.getByText('Acompanhe o desempenho da sua campanha em tempo real.')).toBeTruthy();
  });

  it('(2) o filtro de dia abre em "Hoje" e escolher outro dia devolve a data escolhida', () => {
    const props = renderHeader();

    const gatilho = screen.getByRole('combobox', { name: 'Dia' });
    expect(gatilho.textContent ?? '').toMatch(/^Hoje · /);

    abrirSelect('Dia');
    // itens: "Hoje" + ontem + anteontem (a campanha começou há 2 dias)
    const opcoes = screen.getAllByRole('option');
    expect(opcoes).toHaveLength(3);
    fireEvent.click(opcoes[1]);

    expect(props.onDayChange).toHaveBeenCalledWith(isoDay(subDays(new Date(), 1)));
  });

  it('(3) o filtro de segmentação lista as segmentações da campanha e devolve o id', () => {
    const props = renderHeader();

    expect(screen.getByText('Todas as segmentações')).toBeTruthy();
    abrirSelect('Segmentação');
    fireEvent.click(screen.getByRole('option', { name: 'Clientes VIP' }));

    expect(props.onSegmentChange).toHaveBeenCalledWith('seg-vip');
  });

  it('(4) sem segmentação na campanha o filtro não aparece (não há controle sem consumidor)', () => {
    renderHeader({ segments: [] });

    expect(screen.queryByRole('combobox', { name: 'Segmentação' })).toBeNull();
    expect(screen.queryByText('Todas as segmentações')).toBeNull();
  });

  it('(5) o filtro de status oferece os mesmos status do card de destinatários', () => {
    const props = renderHeader();

    abrirSelect('Status');
    fireEvent.click(screen.getByRole('option', { name: 'Entregue' }));

    expect(props.onStatusChange).toHaveBeenCalledWith('delivered');
  });

  it('(6) o botão atualizar aciona a releitura da tela', () => {
    const props = renderHeader();

    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));

    expect(props.onRefresh).toHaveBeenCalledTimes(1);
  });

  it('(7) o chip seletor mostra "Em andamento · nome · Iniciada às HH:mm" e troca de campanha', () => {
    const props = renderHeader();

    const hora = format(new Date(startedAt), 'HH:mm');
    expect(screen.getByRole('combobox', { name: 'Campanha em acompanhamento' }).textContent)
      .toBe(`Em andamento · Campanha de hoje · Iniciada às ${hora}`);

    abrirSelect('Campanha em acompanhamento');
    const pausada = `Pausada · Campanha pausada · Iniciada às ${format(new Date(paused.started_at as string), 'HH:mm')}`;
    expect(screen.getByRole('option', { name: pausada })).toBeTruthy();
    // a concluída não é oferecida: o seletor lista só sending/paused
    expect(screen.queryByRole('option', { name: /Campanha concluída/ })).toBeNull();

    fireEvent.click(screen.getByRole('option', { name: pausada }));

    expect(props.onSelectCampaign).toHaveBeenCalledWith('c-paused');
  });
});
