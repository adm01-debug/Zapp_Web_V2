/**
 * R2-INB-040 (#334) — o botão "Ouvir mensagem" do balão do chat.
 *
 * A auditoria pinou que, durante o loading da PRÓPRIA mensagem, o botão continuava
 * clicável e o clique chamava `onSpeak` de novo — duas gerações do mesmo pedido.
 * O contrato passa a ser: carregando a própria mensagem, o clique CANCELA
 * (`onStop`), nunca abre uma segunda geração; mensagem de outro id continua
 * desabilitada enquanto uma geração está em curso.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { TextToSpeechButton } from '../TextToSpeechButton';
import { TooltipProvider } from '@/components/ui/tooltip';

type Props = React.ComponentProps<typeof TextToSpeechButton>;

function renderButton(over: Partial<Props> = {}) {
  const onSpeak = vi.fn();
  const onStop = vi.fn();
  render(
    // O Radix exige o provider; na aplicação ele vem do App.
    <TooltipProvider>
      <TextToSpeechButton
      messageId="m-1"
      text="olá mundo"
      isLoading={false}
      isPlaying={false}
      currentMessageId={null}
      onSpeak={onSpeak}
      onStop={onStop}
      {...over}
      />
    </TooltipProvider>,
  );
  return { onSpeak, onStop };
}

describe('TextToSpeechButton — clique durante o carregamento (R2-INB-040)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('carregando a própria mensagem: o clique cancela a geração, não abre outra', () => {
    const { onSpeak, onStop } = renderButton({ isLoading: true, currentMessageId: 'm-1' });

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar leitura' }));

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onSpeak).not.toHaveBeenCalled();
  });

  it('carregando OUTRA mensagem: botão desabilitado e o clique não dispara nada', () => {
    const { onSpeak, onStop } = renderButton({ isLoading: true, currentMessageId: 'm-2' });

    const button = screen.getByRole('button', { name: 'Ouvir mensagem' });
    expect(button).toBeDisabled();

    fireEvent.click(button);

    expect(onSpeak).not.toHaveBeenCalled();
    expect(onStop).not.toHaveBeenCalled();
  });

  it('fora do carregamento: o clique pede a fala do texto da mensagem', () => {
    const { onSpeak, onStop } = renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Ouvir mensagem' }));

    expect(onSpeak).toHaveBeenCalledWith('olá mundo', 'm-1');
    expect(onStop).not.toHaveBeenCalled();
  });

  it('tocando a própria mensagem: o clique para a leitura', () => {
    const { onSpeak, onStop } = renderButton({ isPlaying: true, currentMessageId: 'm-1' });

    fireEvent.click(screen.getByRole('button', { name: 'Parar leitura' }));

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onSpeak).not.toHaveBeenCalled();
  });

  it('mensagem só de mídia não oferece o botão', () => {
    renderButton({ text: '[Imagem]' });
    expect(screen.queryByRole('button')).toBeNull();
  });
});
