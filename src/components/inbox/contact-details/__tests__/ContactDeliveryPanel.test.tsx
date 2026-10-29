import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContactDeliveryPanel } from '../ContactDeliveryPanel';

/**
 * Prova do painel de entrega (16/10/2026).
 *
 * O supabase é mockado SÓ na borda (a RPC); o componente REAL e o hook REAL rodam,
 * então um nome de chave errado na RPC (sent/delivered/read/timeline/hour) quebra
 * o teste em vez de passar com um mock que já traz a resposta pronta.
 */
const h = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => h.rpc(...args) },
}));

type Stats = {
  contact_id: string;
  is_group: boolean;
  window_hours: number;
  totals: {
    sent: number; delivered: number; read: number; failed: number; received: number;
    total_messages: number;
    last_sent_at: string | null; last_delivered_at: string | null; last_read_at: string | null;
  };
  timeline: { hour: string; sent: number; delivered: number; read: number }[];
};

function stats(over: Partial<Stats> = {}): Stats {
  return {
    contact_id: 'c1',
    is_group: false,
    window_hours: 24,
    totals: {
      sent: 7, delivered: 5, read: 2, failed: 0, received: 3,
      total_messages: 10,
      last_sent_at: '2026-10-16T10:30:00Z',
      last_delivered_at: '2026-10-16T10:20:00Z',
      last_read_at: '2026-10-16T10:10:00Z',
    },
    // Ordem da RPC: horas crescentes.
    timeline: [
      { hour: '2026-10-16T09:00:00Z', sent: 3, delivered: 2, read: 1 },
      { hour: '2026-10-16T10:00:00Z', sent: 4, delivered: 3, read: 1 },
    ],
    ...over,
  };
}

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ContactDeliveryPanel contactId="c1" />
    </QueryClientProvider>,
  );
}

describe('ContactDeliveryPanel — entrega por hora (16/10/2026)', () => {
  beforeEach(() => {
    h.rpc.mockReset();
    h.rpc.mockResolvedValue({ data: stats(), error: null });
  });

  it('mostra enviadas/entregues/lidas dos totais da RPC e a série por hora', async () => {
    renderPanel();

    const totais = await screen.findByTestId('delivery-totals');
    expect(totais).toHaveTextContent('Enviadas');
    expect(screen.getByTestId('delivery-kpi-enviadas')).toHaveTextContent('7');
    expect(screen.getByTestId('delivery-kpi-entregues')).toHaveTextContent('5');
    expect(screen.getByTestId('delivery-kpi-lidas')).toHaveTextContent('2');

    // Uma linha por hora devolvida pela RPC, com os números daquela hora.
    const linhas = screen.getAllByTestId('delivery-hour');
    expect(linhas).toHaveLength(2);
    expect(screen.getAllByTestId('delivery-hour-sent').map((el) => el.textContent)).toEqual(['3', '4']);
    expect(screen.getAllByTestId('delivery-hour-delivered').map((el) => el.textContent)).toEqual(['2', '3']);
    expect(screen.getAllByTestId('delivery-hour-read').map((el) => el.textContent)).toEqual(['1', '1']);

    // A hora é mostrada no fuso de quem olha (o banco manda hora cheia em UTC).
    const local = new Date('2026-10-16T09:00:00Z');
    expect(linhas[0]).toHaveTextContent(`${String(local.getHours()).padStart(2, '0')}:00`);

    // Janela padrão de 24 h, com o id do contato que a tela está mostrando.
    expect(h.rpc).toHaveBeenCalledWith('delivery_stats', { p_contact_id: 'c1', p_hours: 24 });
  });

  it('contato sem mensagem na janela → estado vazio explicativo', async () => {
    h.rpc.mockResolvedValue({
      data: stats({ totals: { ...stats().totals, sent: 0, delivered: 0, read: 0, received: 0, total_messages: 0, last_sent_at: null, last_delivered_at: null, last_read_at: null }, timeline: [] }),
      error: null,
    });
    renderPanel();

    expect(await screen.findByTestId('delivery-empty')).toHaveTextContent('Sem mensagens nas últimas 24 horas.');
  });

  it('RPC sem permissão/contato inexistente (NULL) → estado vazio, sem prometer número', async () => {
    h.rpc.mockResolvedValue({ data: null, error: null });
    renderPanel();

    expect(await screen.findByTestId('delivery-empty')).toHaveTextContent('Sem números de entrega para este contato.');
  });

  it('falha da RPC → alerta de erro, não estado vazio', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    renderPanel();

    expect(await screen.findByTestId('delivery-error')).toHaveTextContent('Falha ao carregar os números de entrega.');
    await waitFor(() => expect(h.rpc).toHaveBeenCalled());
    expect(screen.queryByTestId('delivery-empty')).not.toBeInTheDocument();
  });

  it('grupo: a seção por participante diz que o dado não existe na V2 (sem lista vazia)', async () => {
    h.rpc.mockResolvedValue({ data: stats({ is_group: true }), error: null });
    renderPanel();

    expect(await screen.findByTestId('delivery-participants')).toBeInTheDocument();
    expect(screen.getByTestId('delivery-participants-empty')).toHaveTextContent(
      'Ainda não disponível: o Zapp Web não registra qual participante enviou cada mensagem no grupo.',
    );
  });

  it('conversa individual não mostra a seção por participante', async () => {
    renderPanel();

    await screen.findByTestId('delivery-totals');
    expect(screen.queryByTestId('delivery-participants')).not.toBeInTheDocument();
  });
});
