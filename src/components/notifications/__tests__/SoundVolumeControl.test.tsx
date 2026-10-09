import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

// Mocks comuns aos testes de controle de volume (toast/logger/framer-motion/ResizeObserver).
import '@/test/volumeControlMocks';

const h = vi.hoisted(() => ({
  settings: { soundEnabled: true, soundVolume: 70 },
  updateSettings: vi.fn(),
}));

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: h.settings,
    updateSettings: h.updateSettings,
    isSaving: false,
  }),
}));

import { SoundVolumeControl } from '../SoundVolumeControl';
import { TooltipProvider } from '@/components/ui/tooltip';
import { log } from '@/lib/logger';
import { toast } from '@/hooks/ui/use-toast';

const renderControl = () =>
  render(
    <TooltipProvider>
      <SoundVolumeControl />
    </TooltipProvider>,
  );

/**
 * O botão carrega o volume no `aria-label`, ex.: "Volume dos alertas: 70%".
 * O `^` é necessário: os botões − / + do painel trazem o mesmo título no meio do
 * rótulo ("Diminuir Volume dos alertas em 5%") e não são o gatilho.
 */
const botao = () => screen.getByRole('button', { name: /^(Volume dos alertas|Sons de alerta mudos)/ });
/** A roda do mouse só ajusta com o painel ABERTO (B5) — e o painel abre no CLIQUE (D01). */
const abrirPainel = () => fireEvent.click(botao());
/** A roda do mouse é ouvida no <span> que embrulha o botão (rootRef). */
const embalagem = () => botao().parentElement as HTMLElement;
/** Roda do mouse: `deltaY < 0` sobe, `deltaY > 0` desce (5 de cada vez). */
const girarRoda = (deltaY: number) =>
  act(() => {
    embalagem().dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }));
  });

describe('SoundVolumeControl — sobe e desce o volume dos alertas', () => {
  beforeEach(() => {
    h.settings.soundEnabled = true;
    h.settings.soundVolume = 70;
    h.updateSettings.mockReset();
    h.updateSettings.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('com o painel aberto, sobe o volume de 5 em 5 com a roda para cima', async () => {
    renderControl();
    abrirPainel();
    girarRoda(-100);
    await waitFor(() => expect(h.updateSettings).toHaveBeenCalledWith({ soundVolume: 75 }));
  });

  it('com o painel aberto, desce o volume de 5 em 5 com a roda para baixo', async () => {
    renderControl();
    abrirPainel();
    girarRoda(100);
    await waitFor(() => expect(h.updateSettings).toHaveBeenCalledWith({ soundVolume: 65 }));
  });

  it('com o painel FECHADO a roda não mexe no volume (B5 — rolar a sidebar não ajusta)', () => {
    // A gravação é agrupada (~400 ms, D06/B6): avança o relógio além do prazo para provar
    // que nada é agendado, em vez de só olhar o instante da roda.
    vi.useFakeTimers();
    renderControl();
    girarRoda(-100);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(h.updateSettings).not.toHaveBeenCalled();
  });

  it('as setas ↑/↓ ajustam o volume com o foco no botão (e não em qualquer lugar)', async () => {
    renderControl();

    fireEvent.keyDown(document.body, { key: 'ArrowUp' });
    expect(h.updateSettings).not.toHaveBeenCalled();

    fireEvent.keyDown(botao(), { key: 'ArrowUp' });
    await waitFor(() => expect(h.updateSettings).toHaveBeenCalledWith({ soundVolume: 75 }));

    h.updateSettings.mockClear();
    fireEvent.keyDown(botao(), { key: 'ArrowDown' });
    await waitFor(() => expect(h.updateSettings).toHaveBeenCalledWith({ soundVolume: 65 }));
  });

  it('o volume para no mínimo 10 (não desce abaixo)', async () => {
    h.settings.soundVolume = 10;
    renderControl();
    abrirPainel();
    girarRoda(100);
    await waitFor(() => expect(h.updateSettings).toHaveBeenCalledWith({ soundVolume: 10 }));
  });

  it('o volume para no máximo 100 (não sobe acima)', async () => {
    h.settings.soundVolume = 100;
    renderControl();
    abrirPainel();
    girarRoda(-100);
    await waitFor(() => expect(h.updateSettings).toHaveBeenCalledWith({ soundVolume: 100 }));
  });

  it('o clique ABRE o painel e não mexe no volume nem no mudo (D01)', async () => {
    renderControl();

    fireEvent.click(botao());

    expect(await screen.findByRole('slider', { name: 'Volume dos alertas' })).toBeInTheDocument();
    expect(botao()).toHaveAttribute('aria-expanded', 'true');
    expect(h.updateSettings).not.toHaveBeenCalled();
  });

  it('o botão grande do painel alterna o mudo (o mudo rápido saiu do clique no ícone)', async () => {
    renderControl();
    abrirPainel();

    fireEvent.click(await screen.findByRole('button', { name: 'Silenciar' }));

    expect(h.updateSettings).toHaveBeenCalledWith({ soundEnabled: false });
    expect(h.updateSettings).not.toHaveBeenCalledWith(expect.objectContaining({ soundVolume: expect.any(Number) }));
  });

  it('o rótulo acessível expõe o volume — não é mais um simples botão de mudo', () => {
    renderControl();
    expect(botao()).toHaveAccessibleName('Volume dos alertas: 70%');
  });

  it('o rótulo acessível indica mudo quando silenciado', () => {
    h.settings.soundEnabled = false;
    renderControl();
    expect(botao()).toHaveAccessibleName('Sons de alerta mudos');
  });

  it('a tecla `M` alterna o mudo', () => {
    renderControl();
    fireEvent.keyDown(botao(), { key: 'm' });
    expect(h.updateSettings).toHaveBeenCalledWith({ soundEnabled: false });
  });

  it('clique longo (400 ms) abre o slider, e o clique seguinte NÃO alterna o mudo', async () => {
    vi.useFakeTimers();
    renderControl();

    fireEvent.pointerDown(botao());
    act(() => {
      vi.advanceTimersByTime(399);
    });
    expect(screen.queryByRole('slider', { name: 'Volume dos alertas' })).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    vi.useRealTimers();

    expect(await screen.findByRole('slider', { name: 'Volume dos alertas' })).toBeInTheDocument();

    // O `click` que o navegador dispara no pointerup vem DEPOIS do clique longo:
    // ele não pode alternar o mudo (regressão clássica do dedup).
    fireEvent.click(botao());
    expect(h.updateSettings).not.toHaveBeenCalled();
  });

  it('Enter abre o slider (equivalente de teclado do clique longo) e não alterna o mudo', async () => {
    renderControl();
    expect(botao()).toHaveAttribute('aria-expanded', 'false');

    fireEvent.keyDown(botao(), { key: 'Enter' });

    expect(await screen.findByRole('slider', { name: 'Volume dos alertas' })).toBeInTheDocument();
    expect(botao()).toHaveAttribute('aria-expanded', 'true');
    expect(h.updateSettings).not.toHaveBeenCalled();
  });

  it('o gatilho anuncia que abre um popover (aria-haspopup=dialog)', () => {
    renderControl();
    expect(botao()).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('o ponto de atenção aparece com o alerta mudo ou baixo e some com volume alto', () => {
    h.settings.soundVolume = 20;
    const baixo = renderControl();
    expect(screen.getByTestId('sound-volume-low-dot')).toBeInTheDocument();
    baixo.unmount();

    h.settings.soundVolume = 70;
    const alto = renderControl();
    expect(screen.queryByTestId('sound-volume-low-dot')).not.toBeInTheDocument();
    alto.unmount();

    h.settings.soundEnabled = false;
    renderControl();
    expect(screen.getByTestId('sound-volume-low-dot')).toBeInTheDocument();
  });

  // ─── S36–S39 / D06: gravação agrupada, desfazer, indicador e separação do mudo ───

  it('S36/D06: a tela anda na hora, mas vários passos do mesmo movimento viram UMA gravação', async () => {
    renderControl();
    abrirPainel();

    girarRoda(-100);
    expect(botao()).toHaveAccessibleName('Volume dos alertas: 75%');

    girarRoda(-100);
    girarRoda(-100);
    expect(botao()).toHaveAccessibleName('Volume dos alertas: 85%');

    // A gravação sai ~400 ms depois do ÚLTIMO movimento, com o valor final — um POST,
    // não um por passo (era o defeito B6: 7 gravações em ~10 ações).
    await waitFor(() => expect(h.updateSettings).toHaveBeenCalledWith({ soundVolume: 85 }));
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(h.updateSettings).toHaveBeenCalledTimes(1);
  });

  it('S37: gravação rejeitada volta ao valor anterior, encerra salvando e não duplica toast', async () => {
    h.updateSettings.mockRejectedValueOnce(new Error('rede'));

    renderControl();
    fireEvent.keyDown(botao(), { key: 'Enter' });
    await screen.findByRole('slider', { name: 'Volume dos alertas' });

    girarRoda(-100);
    expect(botao()).toHaveAccessibleName('Volume dos alertas: 75%');

    await waitFor(() => expect(h.updateSettings).toHaveBeenCalledWith({ soundVolume: 75 }));
    await waitFor(() => expect(botao()).toHaveAccessibleName('Volume dos alertas: 70%'));
    await waitFor(() => expect(screen.queryByTestId('sound-volume-saving')).not.toBeInTheDocument());

    expect(log.warn).toHaveBeenCalledWith(
      'Failed to commit sidebar sound volume:',
      expect.objectContaining({ message: 'rede' }),
    );
    expect(toast).not.toHaveBeenCalled();
  });

  it('S37: pendente é solto após gravar e a tela volta a seguir as preferências', async () => {
    renderControl();
    abrirPainel();

    girarRoda(-100);
    expect(botao()).toHaveAccessibleName('Volume dos alertas: 75%');

    await waitFor(() => expect(h.updateSettings).toHaveBeenCalledWith({ soundVolume: 75 }));

    // Gravação bem-sucedida com o mock parado: o valor pendente é solto, então a tela
    // volta a seguir `settings` (70%) até o hook/React Query publicar a preferência nova.
    await waitFor(() => expect(botao()).toHaveAccessibleName('Volume dos alertas: 70%'));
  });

  it('S38: o indicador de "salvando" aparece durante a gravação sem travar o slider', async () => {
    let liberar: (() => void) | undefined;
    h.updateSettings.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          liberar = () => resolve();
        }),
    );

    renderControl();
    fireEvent.keyDown(botao(), { key: 'Enter' });
    const slider = await screen.findByRole('slider', { name: 'Volume dos alertas' });

    girarRoda(-100);
    expect(screen.queryByTestId('sound-volume-saving')).not.toBeInTheDocument();

    expect(await screen.findByTestId('sound-volume-saving')).toBeInTheDocument();
    // O aviso é do indicador, não um bloqueio: o slider continua utilizável.
    expect(slider).not.toHaveAttribute('data-disabled');

    await act(async () => {
      liberar?.();
    });
    await waitFor(() => expect(screen.queryByTestId('sound-volume-saving')).not.toBeInTheDocument());
  });

  it('S36/D06: desmontar cancela a gravação agendada', async () => {
    const { unmount } = renderControl();
    abrirPainel();
    girarRoda(-100);
    // Prova que a roda valeu (e agendou a gravação) antes de desmontar: sem isto o teste passaria à toa.
    expect(botao()).toHaveAccessibleName('Volume dos alertas: 75%');
    unmount();

    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(h.updateSettings).not.toHaveBeenCalled();
  });

  it('S39: mudo e volume não se misturam — desmutar devolve o último volume (nunca 0)', async () => {
    h.settings.soundVolume = 45;
    const { rerender } = renderControl();
    expect(botao()).toHaveAccessibleName('Volume dos alertas: 45%');

    abrirPainel(); // D01 — o clique abre o painel; o mudo é o botão grande dele
    fireEvent.click(await screen.findByRole('button', { name: 'Silenciar' }));
    expect(h.updateSettings).toHaveBeenCalledWith({ soundEnabled: false });
    expect(h.updateSettings).not.toHaveBeenCalledWith(expect.objectContaining({ soundVolume: expect.any(Number) }));

    h.settings.soundEnabled = false; // o hook aplica a preferência
    rerender(
      <TooltipProvider>
        <SoundVolumeControl />
      </TooltipProvider>,
    );
    expect(botao()).toHaveAccessibleName('Sons de alerta mudos');

    fireEvent.keyDown(botao(), { key: 'Enter' });
    const slider = await screen.findByRole('slider', { name: 'Volume dos alertas' });
    // O 0 não é um valor alcançável no controle dos alertas: mudo não é "volume zero".
    expect(slider).toHaveAttribute('aria-valuemin', '10');

    h.settings.soundEnabled = true; // desmuta
    rerender(
      <TooltipProvider>
        <SoundVolumeControl />
      </TooltipProvider>,
    );
    expect(botao()).toHaveAccessibleName('Volume dos alertas: 45%');
  });

  it('S39: ajustar o volume com o alerta mudo não desmuta', async () => {
    h.settings.soundEnabled = false;
    renderControl();
    abrirPainel();

    girarRoda(-100);
    await waitFor(() => expect(h.updateSettings).toHaveBeenCalledWith({ soundVolume: 75 }));
    expect(h.updateSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({ soundEnabled: expect.any(Boolean) }),
    );
  });
});
