import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VolumeTriggerButton } from '@/components/ui/VolumeTriggerButton';
import type { VolumeRocker } from '@/hooks/ui/useVolumeRocker';

/**
 * Botão-gatilho dos controles de volume. A DICA (B3) é o ponto deste teste: na
 * sidebar o botão precisa mostrar, ao passar o mouse/focar, o ESTADO do volume e a
 * INSTRUÇÃO ("clique para ajustar") — antes só existia `title` nativo, e fora da
 * sidebar. Fora da sidebar o `title` continua (não há popover nem provider ali).
 */
const rocker = (): VolumeRocker => ({
  open: false,
  setOpen: vi.fn(),
  clearLongPress: vi.fn(),
  handleTriggerClick: vi.fn(),
  handlePointerDown: vi.fn(),
  handleTriggerKeyDown: vi.fn(),
});

const montar = (extra: Partial<React.ComponentProps<typeof VolumeTriggerButton>> = {}) => {
  const r = rocker();
  const label = extra.label ?? 'Volume dos alertas: 70%';
  render(
    <VolumeTriggerButton
      label={label}
      muted={false}
      icon={<span>icone</span>}
      rocker={r}
      {...extra}
    />,
  );
  return { r, botao: screen.getByRole('button', { name: label }) };
};

describe('VolumeTriggerButton — dica na sidebar (B3)', () => {
  it('a dica mostra o estado e a instrução ao focar o botão', async () => {
    const { botao } = montar();

    fireEvent.focus(botao);

    const dica = await screen.findByRole('tooltip');
    expect(dica).toHaveTextContent('Volume dos alertas: 70% — clique para ajustar');
  });

  it('com o som baixo ou mudo a dica explica o ponto azul', async () => {
    const { botao } = montar({
      label: 'Sons de alerta mudos',
      muted: true,
      lowDot: true,
      lowDotTestId: 'ponto-de-teste',
    });

    fireEvent.focus(botao);

    const dica = await screen.findByRole('tooltip');
    expect(dica).toHaveTextContent('Sons de alerta mudos — clique para ajustar');
    expect(dica).toHaveTextContent('Ponto azul: volume baixo ou mudo');
  });

  it('sem o ponto a dica não fala do ponto azul', async () => {
    const { botao } = montar();

    fireEvent.focus(botao);

    const dica = await screen.findByRole('tooltip');
    expect(dica).not.toHaveTextContent('Ponto azul');
  });

  it('fora da sidebar (com `title`) o botão segue no caminho nativo, sem tooltip', () => {
    const { botao } = montar({ title: 'Volume dos áudios e vídeos' });

    fireEvent.focus(botao);

    expect(botao).toHaveAttribute('title', 'Volume dos áudios e vídeos');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('a interação continua vindo do `rocker` (clique, ponteiro e teclado)', () => {
    const { r, botao } = montar();

    fireEvent.click(botao);
    fireEvent.pointerDown(botao);
    fireEvent.keyDown(botao, { key: 'ArrowUp' });

    expect(r.handleTriggerClick).toHaveBeenCalledTimes(1);
    expect(r.handlePointerDown).toHaveBeenCalledTimes(1);
    expect(r.handleTriggerKeyDown).toHaveBeenCalledTimes(1);
  });

  it('o ponto de atenção é renderizado com o testid do controle', () => {
    const { botao } = montar({ lowDot: true, lowDotTestId: 'ponto-de-teste' });

    expect(screen.getByTestId('ponto-de-teste')).toBeInTheDocument();
    expect(botao).toHaveAttribute('aria-expanded', 'false');
  });
});
