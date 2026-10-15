import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { EvolutionDisconnectBanner } from '../EvolutionDisconnectBanner';
import { toast } from 'sonner';

/**
 * B2 (12/10/2026): a faixa de desconexão abria um canal de nome FIXO
 * ('disconnect-banner') e o gerente de conexões abria outro tipo de canal com
 * nome fixo. O `supabase.channel(nome)` devolve o canal existente quando o nome
 * repete, e `.on()` num canal já inscrito lança. Aqui provamos que a faixa usa
 * o hook de canal único e fecha o canal ao desmontar.
 *
 * Refazer 1 (15/10/2026): a faixa refazia a leitura (`fetchStatus`) em QUALQUER
 * evento da tabela — até QR renovado de conexão alheia. Agora o `onChange`
 * filtra por conexão/situação ANTES do refetch, e o `handleReconnect` anuncia o
 * erro lógico da Edge (`{ error: true, message }` com HTTP 200) em vez de um
 * "Reconectando..." mudo. Os testes abaixo provam os dois.
 */
const h = vi.hoisted(() => ({
  channel: vi.fn(),
  removeChannel: vi.fn(),
  from: vi.fn(),
  invoke: vi.fn(),
  linhasDesconectadas: [] as Array<{ id: string; instance_id: string; phone_number: string | null; status: string }>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => {
      h.from(...args);
      return { select: () => ({ eq: async () => ({ data: h.linhasDesconectadas, error: null }) }) };
    },
    channel: (...args: unknown[]) => h.channel(...args),
    removeChannel: (...args: unknown[]) => h.removeChannel(...args),
    functions: { invoke: (...args: unknown[]) => h.invoke(...args) },
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));

vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

function topicos(): string[] {
  return h.channel.mock.calls.map((call) => call[0] as string);
}

/** Callback de `postgres_changes` registrada pelo hook de canal único. */
function onRealtime(): (payload: unknown) => void {
  const canal = h.channel.mock.results[0].value as { on: ReturnType<typeof vi.fn> };
  return canal.on.mock.calls[0][2] as (payload: unknown) => void;
}

beforeEach(() => {
  h.channel.mockReset();
  h.removeChannel.mockReset();
  h.from.mockReset();
  h.invoke.mockReset();
  h.linhasDesconectadas = [];
  vi.clearAllMocks();
  h.channel.mockImplementation(() => {
    const canal = { on: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn() };
    canal.on.mockReturnValue(canal);
    canal.subscribe.mockReturnValue(canal);
    return canal;
  });
});

describe('EvolutionDisconnectBanner — realtime com tópico único', () => {
  it('não usa mais o tópico fixo "disconnect-banner"', () => {
    render(<EvolutionDisconnectBanner />);

    expect(h.channel).toHaveBeenCalledTimes(1);
    const topico = topicos()[0];
    expect(topico).toMatch(/^whatsapp-connections-changes:/);
    expect(topico).not.toContain('disconnect-banner');
  });

  it('duas faixas montadas ao mesmo tempo não compartilham o mesmo canal', () => {
    render(
      <>
        <EvolutionDisconnectBanner />
        <EvolutionDisconnectBanner />
      </>
    );

    const nomes = topicos();
    expect(nomes).toHaveLength(2);
    expect(new Set(nomes).size).toBe(2);
  });

  it('remove o canal ao desmontar', () => {
    const { unmount } = render(<EvolutionDisconnectBanner />);
    const canal = h.channel.mock.results[0].value;

    unmount();

    expect(h.removeChannel).toHaveBeenCalledWith(canal);
  });
});

describe('EvolutionDisconnectBanner — refetch filtrado por conexão', () => {
  it('ignora UPDATE de conexão alheia que continua fora de "disconnected"', async () => {
    render(<EvolutionDisconnectBanner />);
    await waitFor(() => expect(h.from).toHaveBeenCalledTimes(1));

    await act(async () => {
      onRealtime()({ eventType: 'UPDATE', new: { id: 'outra', status: 'connected' }, old: { id: 'outra', status: 'connecting' } });
    });

    expect(h.from).toHaveBeenCalledTimes(1);
  });

  it('refaz a leitura quando uma conexão ENTRA em "disconnected"', async () => {
    render(<EvolutionDisconnectBanner />);
    await waitFor(() => expect(h.from).toHaveBeenCalledTimes(1));

    await act(async () => {
      onRealtime()({ eventType: 'UPDATE', new: { id: 'c1', status: 'disconnected' }, old: { id: 'c1', status: 'connected' } });
    });

    await waitFor(() => expect(h.from).toHaveBeenCalledTimes(2));
  });

  it('refaz a leitura quando uma conexão SAI de "disconnected"', async () => {
    render(<EvolutionDisconnectBanner />);
    await waitFor(() => expect(h.from).toHaveBeenCalledTimes(1));

    await act(async () => {
      onRealtime()({ eventType: 'UPDATE', new: { id: 'c1', status: 'connected' }, old: { id: 'c1', status: 'disconnected' } });
    });

    await waitFor(() => expect(h.from).toHaveBeenCalledTimes(2));
  });

  it('ignora DELETE de conexão que não estava na lista exibida', async () => {
    render(<EvolutionDisconnectBanner />);
    await waitFor(() => expect(h.from).toHaveBeenCalledTimes(1));

    await act(async () => {
      onRealtime()({ eventType: 'DELETE', new: {}, old: { id: 'alheia' } });
    });

    expect(h.from).toHaveBeenCalledTimes(1);
  });
});

describe('EvolutionDisconnectBanner — reconnect anuncia o erro real', () => {
  const CONEXAO = { id: 'c1', instance_id: 'inst-1', phone_number: null, status: 'disconnected' };

  async function abrirFaixaComUmaDesconectada() {
    h.linhasDesconectadas = [CONEXAO];
    render(<EvolutionDisconnectBanner />);
    await waitFor(() => expect(screen.queryByText('Reconectar')).not.toBeNull());
  }

  it('erro lógico da Edge (HTTP 200 com error no corpo) vira toast de erro, sem "Reconectando..."', async () => {
    h.invoke.mockResolvedValue({ data: { error: true, message: 'WhatsApp em manutenção até 18h.' }, error: null });
    await abrirFaixaComUmaDesconectada();

    await act(async () => { fireEvent.click(screen.getByText('Reconectar')); });
    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalled());

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('WhatsApp em manutenção até 18h.');
    expect(vi.mocked(toast.success)).not.toHaveBeenCalled();
  });

  it('aceite real vira um único "Reconectando...", sem erro junto', async () => {
    h.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await abrirFaixaComUmaDesconectada();

    await act(async () => { fireEvent.click(screen.getByText('Reconectar')); });
    await waitFor(() => expect(vi.mocked(toast.success)).toHaveBeenCalled());

    expect(vi.mocked(toast.success)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
  });

  it('falha de transporte vira toast de erro (nunca silêncio)', async () => {
    h.invoke.mockRejectedValue(new Error('rede caiu'));
    await abrirFaixaComUmaDesconectada();

    await act(async () => { fireEvent.click(screen.getByText('Reconectar')); });
    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalled());

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Erro ao reconectar inst-1');
    expect(vi.mocked(toast.success)).not.toHaveBeenCalled();
  });
});
