/**
 * Z03 (PLANO_CONSISTENCIA_DESIGN_SISTEMA, decisão D03) — dica uniforme no cadeado.
 *
 * Antes: "Desativar proteção de tela" / "Ativar proteção de tela", fora do padrão
 * "Nome: estado — ação". Aqui se prova, no componente REAL:
 * 1. ligado: "Proteção de tela: ligada — clique para desligar";
 * 2. desligado (localStorage false): "Proteção de tela: desligada — clique para ligar";
 * 3. a dica sai à DIREITA;
 * 4. o clique continua alternando o localStorage — a dica não troca o comportamento.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

import { ScreenProtectionToggle } from '../ScreenProtectionToggle';

const LIGADO = 'Proteção de tela: ligada — clique para desligar';
const DESLIGADO = 'Proteção de tela: desligada — clique para ligar';

function montar() {
  return render(
    <TooltipProvider>
      <ScreenProtectionToggle />
    </TooltipProvider>,
  );
}

const acharBotao = () => screen.getByRole('button', { name: /Proteção de tela:/ });

// O setup global faz todo elemento medir 800x600 (para o virtualizador). Com esse tamanho a
// dica de 800 px não cabe à direita do botão e o Radix vira o lado para a esquerda. Aqui a
// medida volta a ser a real do jsdom (zero): sobra espaço e o lado pedido (`right`) vale.
const SEM_MEDIDA = { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) };
let medida: { mockRestore: () => void } | null = null;

beforeEach(() => {
  medida = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(SEM_MEDIDA as DOMRect);
});

afterEach(() => {
  medida?.mockRestore();
  medida = null;
});

beforeEach(() => {
  localStorage.clear();
});

describe('Z03 — dica do cadeado no padrão "Nome: estado — ação"', () => {
  it('ligado: mostra o estado e a ação de desligar', async () => {
    montar();

    fireEvent.pointerMove(acharBotao(), { pointerType: 'mouse' });

    expect(await screen.findByRole('tooltip')).toHaveTextContent(LIGADO);
  });

  it('desligado: mostra o estado e a ação de ligar', async () => {
    localStorage.setItem('screen-protection-enabled', 'false');

    montar();

    fireEvent.pointerMove(acharBotao(), { pointerType: 'mouse' });

    expect(await screen.findByRole('tooltip')).toHaveTextContent(DESLIGADO);
  });

  it('a dica sai à direita do botão', async () => {
    montar();

    fireEvent.pointerMove(acharBotao(), { pointerType: 'mouse' });

    expect(await screen.findByRole('tooltip')).toHaveAttribute('data-side', 'right');
  });

  it('o clique continua alternando o localStorage', () => {
    montar();

    fireEvent.click(acharBotao());

    expect(localStorage.getItem('screen-protection-enabled')).toBe('false');
  });
});
