/**
 * Z03 (PLANO_CONSISTENCIA_DESIGN_SISTEMA, decisão D03) — dica uniforme no sino.
 *
 * Antes: a dica do sino alternava entre "Desativar todas as notificações" e
 * "Ativar todas as notificações" — fora do padrão "Nome: estado — ação" que os
 * outros controles rápidos passam a usar, e sem a legenda do ponto azul.
 *
 * Aqui se prova, no componente REAL montado com os eventos do usuário:
 * 1. ligado: "Notificações: ligadas — clique para desligar" + legenda "ponto = ligado";
 * 2. desligado: "Notificações: desligadas — clique para ligar";
 * 3. a dica sai à DIREITA (o lado que a sidebar recolhida deixa livre);
 * 4. o clique continua chamando updateSettings — a dica não troca o comportamento.
 *
 * O `TooltipProvider` é montado no teste: em produção a sidebar já o fornece.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

const fonte = vi.hoisted(() => ({
  settings: {
    soundEnabled: true,
    browserNotifications: true,
    sentimentAlertEnabled: true,
    transcriptionNotificationEnabled: true,
  },
  updateSettings: vi.fn(),
  isSaving: false,
}));

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => fonte,
}));

import { PushNotificationToggle } from '../PushNotificationToggle';

const LIGADO = 'Notificações: ligadas — clique para desligar';
const DESLIGADO = 'Notificações: desligadas — clique para ligar';
const LEGENDA = 'ponto = ligado';

function montar() {
  return render(
    <TooltipProvider>
      <PushNotificationToggle />
    </TooltipProvider>,
  );
}

const acharBotao = () => screen.getByRole('button', { name: /Notificações:/ });

beforeEach(() => {
  fonte.settings.soundEnabled = true;
  fonte.settings.browserNotifications = true;
  fonte.updateSettings.mockClear();
});

describe('Z03 — dica do sino no padrão "Nome: estado — ação"', () => {
  it('ligado: mostra o estado e a ação, com a legenda do ponto azul', async () => {
    montar();

    fireEvent.pointerMove(acharBotao(), { pointerType: 'mouse' });

    const dica = await screen.findByRole('tooltip');
    expect(dica).toHaveTextContent(LIGADO);
    expect(dica).toHaveTextContent(LEGENDA);
  });

  it('desligado: mostra o estado e a ação de ligar', async () => {
    fonte.settings.soundEnabled = false;
    fonte.settings.browserNotifications = false;

    montar();

    fireEvent.pointerMove(acharBotao(), { pointerType: 'mouse' });

    expect(await screen.findByRole('tooltip')).toHaveTextContent(DESLIGADO);
  });

  it('a dica sai à direita do botão', async () => {
    montar();

    fireEvent.pointerMove(acharBotao(), { pointerType: 'mouse' });

    expect(await screen.findByRole('tooltip')).toHaveAttribute('data-side', 'right');
  });

  it('o clique continua desligando as notificações', () => {
    montar();

    fireEvent.click(acharBotao());

    expect(fonte.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ soundEnabled: false, browserNotifications: false }),
    );
  });
});
