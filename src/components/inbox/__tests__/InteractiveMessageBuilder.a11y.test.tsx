/**
 * axe no construtor de mensagem interativa depois das setas de reordenar (item
 * do cartão: "axe sem violações"). Os botões de subir/descer são só ícone, então
 * a auditoria confirma que cada um tem nome acessível (aria-label) e que o
 * diálogo não introduz violação nova.
 *
 * `color-contrast` fica desligado: o jsdom não calcula cor computada (mesma
 * escolha dos outros testes de a11y do repositório).
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { InteractiveMessageBuilder } from '@/components/inbox/InteractiveMessageBuilder';

const semContraste = { rules: { 'color-contrast': { enabled: false } } };

function abrirConstrutor() {
  render(
    <InteractiveMessageBuilder open onOpenChange={vi.fn()} onSend={vi.fn().mockResolvedValue(undefined)} />,
  );
}

function comporListaComDuasLinhas() {
  // Radix Tabs ativa no mouseDown.
  fireEvent.mouseDown(screen.getByRole('tab', { name: /lista/i }));
  fireEvent.click(screen.getByRole('button', { name: /^seção$/i }));
  // A seção já nasce expandida; seu controle fica disponível para toggle.
  fireEvent.click(screen.getByRole('button', { name: /^item$/i }));
  fireEvent.click(screen.getByRole('button', { name: /^item$/i }));
}

describe('InteractiveMessageBuilder — a11y com as setas de reordenar', () => {
  it('axe sem violações com botões na tela', async () => {
    abrirConstrutor();
    fireEvent.click(screen.getByRole('button', { name: /resposta/i }));
    fireEvent.click(screen.getByRole('button', { name: /resposta/i }));

    const results = await axe(document.body, semContraste);
    expect(results.violations).toEqual([]);
  });

  it('axe sem violações com seção de duas linhas', async () => {
    abrirConstrutor();
    comporListaComDuasLinhas();

    const results = await axe(document.body, semContraste);
    expect(results.violations).toEqual([]);
  });
});
