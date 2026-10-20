import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

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

const renderControl = () =>
  render(
    <TooltipProvider>
      <SoundVolumeControl />
    </TooltipProvider>,
  );

/** O botão carrega o volume no `aria-label`, ex.: "Volume dos alertas: 70%". */
const botao = () => screen.getByRole('button', { name: /Volume dos alertas|Sons de alerta mudos/ });
/** A roda do mouse é ouvida no <span> que embrulha o botão (rootRef). */
const embalagem = () => botao().parentElement as HTMLElement;

describe('SoundVolumeControl — sobe e desce o volume dos alertas', () => {
  beforeEach(() => {
    h.settings.soundEnabled = true;
    h.settings.soundVolume = 70;
    h.updateSettings.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('sobe o volume de 5 em 5 com a roda para cima', () => {
    renderControl();
    act(() => {
      embalagem().dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
    });
    expect(h.updateSettings).toHaveBeenCalledWith({ soundVolume: 75 });
  });

  it('desce o volume de 5 em 5 com a roda para baixo', () => {
    renderControl();
    act(() => {
      embalagem().dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));
    });
    expect(h.updateSettings).toHaveBeenCalledWith({ soundVolume: 65 });
  });

  it('as setas ↑/↓ ajustam o volume com o foco no botão (e não em qualquer lugar)', () => {
    renderControl();

    fireEvent.keyDown(document.body, { key: 'ArrowUp' });
    expect(h.updateSettings).not.toHaveBeenCalled();

    fireEvent.keyDown(botao(), { key: 'ArrowUp' });
    expect(h.updateSettings).toHaveBeenCalledWith({ soundVolume: 75 });

    h.updateSettings.mockClear();
    fireEvent.keyDown(botao(), { key: 'ArrowDown' });
    expect(h.updateSettings).toHaveBeenCalledWith({ soundVolume: 65 });
  });

  it('o volume para no mínimo 10 (não desce abaixo)', () => {
    h.settings.soundVolume = 10;
    renderControl();
    act(() => {
      embalagem().dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));
    });
    expect(h.updateSettings).toHaveBeenCalledWith({ soundVolume: 10 });
  });

  it('o volume para no máximo 100 (não sobe acima)', () => {
    h.settings.soundVolume = 100;
    renderControl();
    act(() => {
      embalagem().dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
    });
    expect(h.updateSettings).toHaveBeenCalledWith({ soundVolume: 100 });
  });

  it('clique alterna o mudo (soundEnabled) — e não mexe no volume', () => {
    renderControl();
    fireEvent.click(botao());
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
});
