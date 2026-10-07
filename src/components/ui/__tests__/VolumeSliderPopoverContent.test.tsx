import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { VolumeSliderPopoverContent } from '@/components/ui/VolumeSliderPopoverContent';
import type { VolumeSliderPopoverContentProps } from '@/components/ui/VolumeSliderPopoverContent';

/**
 * Conteúdo do painel de volume (alertas e mídias): o que o dono pediu — subir,
 * abaixar e anular o som de forma CLARA — passou a ter botões (− / +), valor
 * grande e um botão único de silenciar com o estado visível.
 */
const props = {
  title: 'Volume dos alertas',
  valueLabel: '70%',
  volume: 70,
  muted: false,
  min: 10,
  max: 100,
  step: 5,
  thumbLabel: 'Volume dos alertas',
  valueTestId: 'valor-de-teste',
};

/** `within`: dois painéis na mesma tela (alertas e mídias) não podem se confundir. */
const montar = (extra: Partial<VolumeSliderPopoverContentProps> = {}) => {
  const onVolumeChange = vi.fn();
  const onToggleMute = vi.fn();
  const { container } = render(
    <VolumeSliderPopoverContent
      {...props}
      {...extra}
      onVolumeChange={onVolumeChange}
      onToggleMute={onToggleMute}
    />,
  );
  return { onVolumeChange, onToggleMute, tela: within(container) };
};

describe('VolumeSliderPopoverContent — − / + / Silenciar', () => {
  it('mostra o valor grande e o slider com o texto falado em "% por cento"', () => {
    const { tela } = montar();

    expect(tela.getByTestId('valor-de-teste')).toHaveTextContent('70%');
    expect(tela.getByRole('slider', { name: 'Volume dos alertas' })).toHaveAttribute(
      'aria-valuetext',
      '70 por cento',
    );
  });

  it('com o som silenciado o texto falado do slider é "Mudo"', () => {
    const { tela } = montar({ muted: true, valueLabel: 'Mudo' });

    expect(tela.getByRole('slider', { name: 'Volume dos alertas' })).toHaveAttribute(
      'aria-valuetext',
      'Mudo',
    );
  });

  it('o botão − abaixa 5% e o botão + sobe 5%', () => {
    const { onVolumeChange, tela } = montar();

    fireEvent.click(tela.getByRole('button', { name: /^Diminuir Volume dos alertas/ }));
    expect(onVolumeChange).toHaveBeenLastCalledWith(65);

    fireEvent.click(tela.getByRole('button', { name: /^Aumentar Volume dos alertas/ }));
    expect(onVolumeChange).toHaveBeenLastCalledWith(75);
  });

  it('os botões − / + não passam dos limites do controle (10–100 nos alertas)', () => {
    const noTeto = montar({ volume: 100, valueLabel: '100%' });
    fireEvent.click(noTeto.tela.getByRole('button', { name: /^Aumentar Volume dos alertas/ }));
    expect(noTeto.onVolumeChange).not.toHaveBeenCalled();

    const noChao = montar({ volume: 10, valueLabel: '10%' });
    fireEvent.click(noChao.tela.getByRole('button', { name: /^Diminuir Volume dos alertas/ }));
    expect(noChao.onVolumeChange).not.toHaveBeenCalled();
  });

  it('o botão grande silencia, com o estado visível', () => {
    const { onToggleMute, tela } = montar();

    const botao = tela.getByRole('button', { name: 'Silenciar' });
    expect(botao).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(botao);
    expect(onToggleMute).toHaveBeenCalledTimes(1);
  });

  it('com o som mudo o botão grande vira "Ativar som", marcado como pressionado', () => {
    const { onToggleMute, tela } = montar({ muted: true, valueLabel: 'Mudo' });

    const ativar = tela.getByRole('button', { name: 'Ativar som' });
    expect(ativar).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(ativar);
    expect(onToggleMute).toHaveBeenCalledTimes(1);
  });

  it('desabilitado (navegador sem controle de volume) os botões não agem', () => {
    const { onVolumeChange, onToggleMute, tela } = montar({ disabled: true });

    const menos = tela.getByRole('button', { name: /^Diminuir Volume dos alertas/ });
    expect(menos).toBeDisabled();
    fireEvent.click(menos);
    fireEvent.click(tela.getByRole('button', { name: 'Silenciar' }));

    expect(onVolumeChange).not.toHaveBeenCalled();
    expect(onToggleMute).not.toHaveBeenCalled();
  });

  it('o painel é um diálogo com o rótulo do controle', () => {
    const { tela } = montar();

    expect(tela.getByRole('dialog', { name: 'Volume dos alertas' })).toBeInTheDocument();
  });

  it('o foco fica preso no painel: Tab no último volta ao primeiro e Shift+Tab no primeiro vai ao último', () => {
    const { tela } = montar();

    const primeiro = tela.getByRole('button', { name: /^Diminuir Volume dos alertas/ });
    const ultimo = tela.getByRole('button', { name: 'Silenciar' });

    ultimo.focus();
    fireEvent.keyDown(ultimo, { key: 'Tab' });
    expect(document.activeElement).toBe(primeiro);

    fireEvent.keyDown(primeiro, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(ultimo);
  });

  it('Tab no meio do painel não é sequestrado (só as pontas dão a volta)', () => {
    const { tela } = montar();

    const slider = tela.getByRole('slider', { name: 'Volume dos alertas' });
    slider.focus();
    const evento = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    fireEvent(slider, evento);

    expect(evento.defaultPrevented).toBe(false);
  });
});
