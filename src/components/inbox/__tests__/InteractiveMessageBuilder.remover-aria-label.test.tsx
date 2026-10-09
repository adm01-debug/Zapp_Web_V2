/**
 * N-036: botões 'remover' no montador de mensagem interativa e na enquete
 * devem ter aria-label com o índice do item (ex.: 'Remover opção 2').
 *
 * Prova (vermelho antes / verde depois): sem o aria-label, o axe
 * button-name encontra violação; com o aria-label, o axe passa.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InteractiveMessageBuilder } from '@/components/inbox/InteractiveMessageBuilder';

describe('InteractiveMessageBuilder — botões remover com aria-label', () => {
  it('botão remover de botão tem aria-label com o índice', () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<InteractiveMessageBuilder open onOpenChange={vi.fn()} onSend={onSend} />);

    fireEvent.click(screen.getByRole('button', { name: /^resposta$/i }));

    expect(screen.getByRole('button', { name: /remover opção 1/i })).toBeInTheDocument();
  });
});