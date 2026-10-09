/**
 * N-036: botão 'remover' na enquete do menu avançado deve ter aria-label
 * com o índice do item (ex.: 'Remover opção 2').
 *
 * Prova (vermelho antes / verde depois): sem o aria-label, o axe
 * button-name encontra violação; com o aria-label, o axe passa.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AdvancedMessageMenu } from '@/components/inbox/AdvancedMessageMenu';

describe('AdvancedMessageMenu — botão remover de enquete com aria-label', () => {
  it('botão remover de opção de enquete tem aria-label com o índice', () => {
    render(
      <AdvancedMessageMenu
        contactId="contact-1"
        instanceName="default"
        recipientNumber="+5511999999999"
      />,
    );

    // Abre o popover de mais opções
    fireEvent.click(screen.getByRole('button', { name: /mais opções de mensagem/i }));

    // Clica em "Enquete" no popover
    fireEvent.click(screen.getByRole('button', { name: /enquete/i }));

    // O diálogo de enquete deve estar aberto
    expect(screen.getByRole('dialog', { name: /criar enquete/i })).toBeInTheDocument();

    // Adiciona opções para que o botão remover apareça (> 2 opções)
    fireEvent.click(screen.getByRole('button', { name: /adicionar opção/i }));
    fireEvent.click(screen.getByRole('button', { name: /adicionar opção/i }));

    expect(screen.getByRole('button', { name: /remover opção 1/i })).toBeInTheDocument();
  });
});