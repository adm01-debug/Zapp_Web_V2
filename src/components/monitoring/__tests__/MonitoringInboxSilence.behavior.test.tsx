import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { axe } from 'vitest-axe';

/**
 * Tela do monitor de silêncio da caixa de entrada (paridade PE-87/88).
 *
 * O que este arquivo prova, renderizando o componente REAL (e o hook REAL, que
 * fala com o service mockado):
 *   - as contagens de 5 min/1 h/24 h, o último recebido/enviado e os contatos
 *     mais ativos que a RPC devolve aparecem na tela;
 *   - conexão muda mostra o aviso desde a última recebida, e conexão sem
 *     nenhuma recebida diz isso (nunca "há 0 minutos");
 *   - estados carregando, erro (mantendo o último retrato) e vazio;
 *   - limiar editável: recusa fora de 1..1440 (mesmo CHECK da migration),
 *     salva dentro da faixa e relê a RPC depois de salvar.
 */

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  settingsOrder: vi.fn(),
  settingsUpdate: vi.fn(),
  updateSelect: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => h.rpc(...args),
    from: () => ({
      select: () => ({ order: (...args: unknown[]) => h.settingsOrder(...args) }),
      update: (payload: unknown) => {
        h.settingsUpdate(payload);
        return {
          eq: (column: string, value: string) => ({
            select: () => h.updateSelect(column, value),
          }),
        };
      },
    }),
  },
}));
vi.mock('@/lib/logger', () => {
  const noop = () => {};
  return {
    getLogger: () => ({ error: noop, warn: noop, info: noop, debug: noop }),
    log: { error: noop, warn: noop, info: noop, debug: noop },
  };
});

import { MonitoringInboxSilence } from '@/components/monitoring/MonitoringInboxSilence';

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const rawConnection = (over: Record<string, unknown> = {}) => ({
  connection_id: 'c1',
  connection_name: 'Comercial',
  connection_status: 'connected',
  received_5m: 0,
  received_1h: 2,
  received_24h: 10,
  last_inbound_at: minutesAgo(180),
  last_outbound_at: minutesAgo(60),
  silence_minutes: 10,
  is_silent: true,
  top_conversations: [
    { contact_id: 'ct1', contact_name: 'Maria', received: 6, last_at: minutesAgo(200) },
  ],
  ...over,
});

const rpcOk = (rows: unknown[]) => ({
  abortSignal: vi.fn(async () => ({ data: rows, error: null })),
});
const rpcFail = (message = 'not_authorized') => ({
  abortSignal: vi.fn(async () => ({ data: null, error: { message } })),
});

const settingsRow = (value: string) => ({
  id: 's1',
  key: 'inbox_silence_minutes',
  value,
  description: null,
  updated_by: null,
  created_at: minutesAgo(1),
  updated_at: minutesAgo(1),
});

beforeEach(() => {
  h.rpc.mockReset();
  h.settingsOrder.mockReset();
  h.settingsUpdate.mockReset();
  h.updateSelect.mockReset();
  h.settingsOrder.mockResolvedValue({ data: [settingsRow('10')], error: null });
  h.updateSelect.mockResolvedValue({ data: [{ key: 'inbox_silence_minutes' }], error: null });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
});

afterEach(() => {
  cleanup();
});

describe('MonitoringInboxSilence', () => {
  it('mostra contagens, aviso de silêncio, último recebido/enviado e contatos mais ativos', async () => {
    h.rpc.mockImplementation(() =>
      rpcOk([
        rawConnection(),
        rawConnection({
          connection_id: 'c2',
          connection_name: 'Suporte',
          received_5m: 4,
          received_1h: 9,
          received_24h: 30,
          last_inbound_at: minutesAgo(5),
          last_outbound_at: minutesAgo(2),
          is_silent: false,
          top_conversations: [],
        }),
      ]),
    );

    const { container } = render(<MonitoringInboxSilence />);

    const comercial = (await screen.findByText('Comercial')).closest('li');
    expect(comercial).not.toBeNull();
    const scope = within(comercial as HTMLElement);
    expect(scope.getByText('Recebidas (5 min)')).toBeInTheDocument();
    expect(scope.getByText('Recebidas (1 h)')).toBeInTheDocument();
    expect(scope.getByText('Recebidas (24 h)')).toBeInTheDocument();
    expect(scope.getByText('0')).toBeInTheDocument();
    expect(scope.getByText('2')).toBeInTheDocument();
    expect(scope.getByText('10')).toBeInTheDocument();
    expect(scope.getByText(/Muda desde há/)).toBeInTheDocument();
    expect(scope.getByText('Maria')).toBeInTheDocument();
    expect(scope.getByText('6')).toBeInTheDocument();

    const suporte = (await screen.findByText('Suporte')).closest('li');
    const scopeSuporte = within(suporte as HTMLElement);
    expect(scopeSuporte.getByText('Recebendo')).toBeInTheDocument();
    expect(scopeSuporte.getByText(/Nenhuma mensagem recebida de contato/)).toBeInTheDocument();

    // Contador de conexões mudas no título (1 de 2).
    expect(screen.getByText('1')).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('conexão sem nenhuma mensagem recebida diz isso, não "há 0 minutos"', async () => {
    h.rpc.mockImplementation(() =>
      rpcOk([rawConnection({ is_silent: true, last_inbound_at: null, top_conversations: [] })]),
    );

    render(<MonitoringInboxSilence />);

    const comercial = (await screen.findByText('Comercial')).closest('li');
    const scope = within(comercial as HTMLElement);
    expect(scope.getByText('Nunca recebeu mensagem')).toBeInTheDocument();
    expect(scope.getByText(/Última recebida:\s*nenhuma/)).toBeInTheDocument();
  });

  it('estado carregando antes da primeira leitura', () => {
    h.rpc.mockImplementation(() => ({ abortSignal: () => new Promise(() => {}) }));

    render(<MonitoringInboxSilence />);

    expect(screen.getByText('Carregando o silêncio da caixa de entrada…')).toBeInTheDocument();
  });

  it('erro de leitura sem retrato mostra o alerta e NÃO afirma que não há conexões', async () => {
    h.rpc.mockImplementation(() => rpcFail());

    render(<MonitoringInboxSilence />);

    expect(await screen.findByText('Falha na leitura')).toBeInTheDocument();
    expect(screen.getByText('Sem leitura para mostrar. Use “Tentar de novo”.')).toBeInTheDocument();
    expect(screen.queryByText(/Nenhuma conexão de WhatsApp cadastrada/)).toBeNull();
  });

  it('sem conexões cadastradas mostra o vazio', async () => {
    h.rpc.mockImplementation(() => rpcOk([]));

    render(<MonitoringInboxSilence />);

    expect(
      await screen.findByText('Nenhuma conexão de WhatsApp cadastrada para monitorar.'),
    ).toBeInTheDocument();
  });

  it('recusa limiar fora de 1..1440 e salva dentro da faixa, relendo a RPC', async () => {
    h.rpc.mockImplementationOnce(() => rpcOk([rawConnection({ is_silent: false })]));
    h.rpc.mockImplementationOnce(() =>
      rpcOk([rawConnection({ is_silent: false, silence_minutes: 30 })]),
    );

    render(<MonitoringInboxSilence />);
    await screen.findByText('Comercial');

    const input = screen.getByLabelText('Limiar (minutos sem receber)');
    // Os limites da tela são os do CHECK da migration (1..1440).
    expect(input).toHaveAttribute('min', '1');
    expect(input).toHaveAttribute('max', '1440');

    const save = screen.getByRole('button', { name: 'Salvar limiar' });
    expect(save).toBeDisabled();

    const form = input.closest('form');
    expect(form).not.toBeNull();

    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.submit(form as HTMLFormElement);
    expect(
      await screen.findByText('Informe um número inteiro de 1 a 1440 minutos.'),
    ).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '1441' } });
    fireEvent.submit(form as HTMLFormElement);
    expect(h.updateSelect).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '30' } });
    expect(save).not.toBeDisabled();
    fireEvent.submit(form as HTMLFormElement);

    await waitFor(() =>
      expect(h.updateSelect).toHaveBeenCalledWith('key', 'inbox_silence_minutes'),
    );
    expect(h.settingsUpdate).toHaveBeenCalledWith({ value: '30' });
    expect(await screen.findByText('Limiar salvo; as contagens foram relidas.')).toBeInTheDocument();
    // A releitura trouxe o limiar novo do servidor.
    expect(await screen.findByText(/Em uso agora: 30 min/)).toBeInTheDocument();
    expect(h.rpc).toHaveBeenCalledTimes(2);
  });

  it('falha ao salvar o limiar mostra o erro e não relê a RPC', async () => {
    h.rpc.mockImplementation(() => rpcOk([rawConnection({ is_silent: false })]));
    h.updateSelect.mockResolvedValue({ data: [], error: null });

    render(<MonitoringInboxSilence />);
    await screen.findByText('Comercial');

    const input = screen.getByLabelText('Limiar (minutos sem receber)');
    fireEvent.change(input, { target: { value: '30' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    expect(await screen.findByText('Não foi possível salvar o limiar.')).toBeInTheDocument();
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });
});
