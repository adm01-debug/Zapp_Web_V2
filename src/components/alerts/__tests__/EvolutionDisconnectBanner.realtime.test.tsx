import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { EvolutionDisconnectBanner } from '../EvolutionDisconnectBanner';

/**
 * B2 (12/10/2026): a faixa de desconexão abria um canal de nome FIXO
 * ('disconnect-banner') e o gerente de conexões abria outro tipo de canal com
 * nome fixo. O `supabase.channel(nome)` devolve o canal existente quando o nome
 * repete, e `.on()` num canal já inscrito lança. Aqui provamos que a faixa usa
 * o hook de canal único e fecha o canal ao desmontar.
 */
const h = vi.hoisted(() => ({
  channel: vi.fn(),
  removeChannel: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }),
    channel: (...args: unknown[]) => h.channel(...args),
    removeChannel: (...args: unknown[]) => h.removeChannel(...args),
    functions: { invoke: vi.fn() },
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function topicos(): string[] {
  return h.channel.mock.calls.map((call) => call[0] as string);
}

beforeEach(() => {
  h.channel.mockReset();
  h.removeChannel.mockReset();
  h.channel.mockImplementation(() => {
    const canal = { on: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn() };
    canal.on.mockReturnValue(canal);
    canal.subscribe.mockReturnValue(canal);
    canal.unsubscribe.mockReturnValue(canal);
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
