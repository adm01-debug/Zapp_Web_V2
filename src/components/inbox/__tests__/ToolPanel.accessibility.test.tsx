/**
 * SL-216 — acessibilidade do ToolPanel (Experiência de uso e acessibilidade).
 *
 * O botão de fechar do cabeçalho renderizava só o ícone `X`, sem nome
 * acessível: leitor de tela anunciava um botão sem ação ("botão"). Este
 * teste renderiza o ToolPanel REAL aberto e busca o botão pelo role/name
 * (getByRole('button', { name: 'Fechar painel' })) — falha no código sem a
 * correção e, com ela, prova que o clique continua chamando `onClose`.
 */
import { describe, it, expect, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import { ToolPanel } from '@/components/inbox/ai-tools/ToolPanel';

function renderPanel(overrides: Partial<ComponentProps<typeof ToolPanel>> = {}) {
  const onClose = vi.fn();
  render(
    <ToolPanel
      isOpen
      onClose={onClose}
      icon={<span aria-hidden="true">i</span>}
      title="Resumo da conversa"
      subtitle="Últimas 24h"
      {...overrides}
    >
      <p>Conteúdo do painel</p>
    </ToolPanel>,
  );
  return { onClose };
}

describe('ToolPanel — nome acessível do botão de fechar (SL-216)', () => {
  it('expõe o botão de fechar com nome acessível "Fechar painel"', () => {
    renderPanel();

    const botao = screen.getByRole('button', { name: 'Fechar painel' });
    expect(botao).toBeInTheDocument();
  });

  it('chama onClose ao clicar no botão de fechar pelo nome acessível', () => {
    const { onClose } = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar painel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('não renderiza o painel quando isOpen é false', () => {
    renderPanel({ isOpen: false });

    expect(screen.queryByRole('button', { name: 'Fechar painel' })).not.toBeInTheDocument();
  });
});
