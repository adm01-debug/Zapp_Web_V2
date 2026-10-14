// O mapa de calor do Dashboard deixou de ler linhas cruas de `messages` (o corte
// silencioso de 1000 do PostgREST transformava a contagem numa amostra) e passou a
// consumir a RPC dashboard_heatmap, que ja agrega por (dia da semana, hora) no fuso
// do APP. A prova cobre o fuso (uma conversa as 23h30 de segunda em Sao Paulo tem de
// cair no bucket Seg 23:00, sem passar pelo getDay()/getHours() do navegador) e o
// vazio (sem NaN/Infinity e sem texto fixo).
//
// TZ forçado a UTC de propósito: e o cenario em que o defeito aparecia (um bucket do
// servidor as 23h viraria 02h do dia seguinte se o cliente reinterpretasse o horario).
process.env.TZ = 'UTC';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import ConversationHeatmap from '../ConversationHeatmap';

const h = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: h.rpc,
    from: () => {
      throw new Error('o mapa de calor nao pode mais ler `messages` direto no cliente');
    },
  },
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) =>
      <div {...props}>{children}</div>,
  },
}));

function renderWithProviders(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>
  );
}

describe('ConversationHeatmap — dados do servidor (dashboard_heatmap)', () => {
  beforeEach(() => {
    h.rpc.mockReset();
  });

  it('soma buckets repetidos do servidor e ignora dow/hora fora da grade', async () => {
    h.rpc.mockResolvedValue({
      data: [
        { dow: 1, hour: 23, value: 7 }, // segunda 23h em America/Sao_Paulo
        { dow: 1, hour: 23, value: 3 }, // mesmo bucket, soma
        { dow: 99, hour: 3, value: 5 }, // invalido: nao pode entrar na grade
      ],
      error: null,
    });

    renderWithProviders(<ConversationHeatmap />);

    expect(await screen.findByText('Seg 23:00')).toBeInTheDocument();
    // 7 + 3 = 10; o bucket invalido (99,3) nao soma em lugar nenhum
    expect(screen.getByText('10 msgs')).toBeInTheDocument();
    expect(screen.getByText('23:00')).toBeInTheDocument();
  });

  it('Horario Nobre e Melhor Dia saem do dado real, nao de texto fixo', async () => {
    h.rpc.mockResolvedValue({ data: [{ dow: 1, hour: 23, value: 7 }], error: null });

    renderWithProviders(<ConversationHeatmap />);

    // provedor le a RPC com a janela de 30 dias e nao toca em `messages`
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith('dashboard_heatmap', { dias: 30 }));

    // o bucket do servidor e renderizado como esta (fuso do app), sem reinterpretacao local
    expect(await screen.findByText('Segunda')).toBeInTheDocument(); // Melhor Dia, do dado real
    expect(screen.getByText('23:00')).toBeInTheDocument(); // Horario Nobre, do dado real
    expect(screen.getByText('7 msgs')).toBeInTheDocument();
  });

  it('RPC vazia nao quebra nem inventa numero (sem NaN/Infinity, sem texto fixo)', async () => {
    h.rpc.mockResolvedValue({ data: [], error: null });

    renderWithProviders(<ConversationHeatmap />);

    await waitFor(() => expect(h.rpc).toHaveBeenCalled());
    expect(await screen.findByText('0 msgs')).toBeInTheDocument();
    expect(screen.getAllByText('Sem dados').length).toBe(2); // Horario Nobre e Melhor Dia
    expect(screen.queryByText('10h - 16h')).toBeNull(); // texto fixo removido
    expect(screen.queryByText('Terça')).toBeNull();
  });
});
