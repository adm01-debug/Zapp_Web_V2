import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';

/**
 * Alerta de crise FORA da War Room: o INSERT em `warroom_alerts` era ouvido só
 * pelo `useWarRoomAlerts` dentro da `WarRoomDashboard` — quem estava em
 * Contatos/Inbox/Relatórios não recebia som, aviso nem toast, e o alerta ficava
 * parado no banco até alguém abrir a tela.
 *
 * Aqui o ouvinte global (montado no shell via `useGlobalCrisisAlerts`) é
 * exercitado com o canal falso: supervisão recebe em qualquer tela, agente não
 * recebe nada, e o MESMO alerta visto por dois consumidores não é anunciado
 * duas vezes.
 */
const h = vi.hoisted(() => ({
  supervisor: true,
  quiet: false,
  owner: true,
  handler: null as null | ((payload: { new: unknown }) => void),
  canais: 0,
  settings: {
    soundEnabled: true,
    soundVolume: 70,
    browserNotifications: true,
    slaSoundType: 'alert' as const,
  },
  playSound: vi.fn(),
  notificacaoNavegador: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => {
  const canal: Record<string, unknown> = {};
  canal.on = (_evento: string, _filtro: unknown, cb: (payload: { new: unknown }) => void) => {
    h.handler = cb;
    return canal;
  };
  canal.subscribe = vi.fn(() => ({ unsubscribe: vi.fn() }));
  return {
    supabase: {
      channel: vi.fn(() => {
        h.canais += 1;
        return canal;
      }),
      removeChannel: vi.fn(),
    },
  };
});

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ isAdmin: false, isSupervisor: h.supervisor }),
}));

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({ settings: h.settings, isQuietHours: () => h.quiet }),
}));

vi.mock('@/utils/notificationSounds', () => ({
  playNotificationSound: h.playSound,
  showBrowserNotification: h.notificacaoNavegador,
}));

vi.mock('sonner', () => ({
  toast: { error: h.toastError, warning: h.toastWarning },
}));

vi.mock('@/hooks/system/useNavigationHistory', () => ({
  navigateToView: h.navigate,
}));

// A disputa entre abas é a mesma infraestrutura do envio (SL-070): aqui só
// controlamos o veredito (`owner`) para provar os dois lados.
vi.mock('@/lib/crossTabSendDedupe', () => ({
  createCrossTabSendDedupe: () => ({
    claim: () => Promise.resolve({ owner: h.owner, clientMessageId: 'x' }),
    release: vi.fn(),
    dispose: vi.fn(),
  }),
}));

import { useGlobalCrisisAlerts } from '@/hooks/business/useGlobalCrisisAlerts';
import { announceWarRoomAlert } from '@/hooks/business/warRoomAlertNotice';

// O aviso é deduplicado POR ALERTA (`claimNotificationEvent`) e essa memória vive
// no módulo: cada caso usa um alerta NOVO, senão o segundo caso ficaria em
// silêncio pela dedupe, não pela regra que ele quer provar.
let sequencia = 0;
const alertaDeCrise = (tipo = 'critical') => ({
  id: `crise-${++sequencia}`,
  alert_type: tipo,
  title: '3 SLA(s) Violado(s)',
  message: 'Existem 3 conversas com SLA violado que precisam de atenção imediata.',
});

async function montarOuvinte() {
  renderHook(() => useGlobalCrisisAlerts());
  await waitFor(() => expect(h.handler).toBeTruthy());
}

function disparar(alerta: unknown) {
  act(() => { h.handler!({ new: alerta }); });
}

describe('ouvinte global do alerta de crise', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.supervisor = true;
    h.quiet = false;
    h.owner = true;
    h.handler = null;
    h.canais = 0;
  });

  afterEach(cleanup);

  it('supervisão recebe o alerta em qualquer tela: som, aviso de desktop e ação para a War Room', async () => {
    await montarOuvinte();
    expect(h.canais).toBe(1);
    const alerta = alertaDeCrise();

    disparar(alerta);

    await waitFor(() => expect(h.playSound).toHaveBeenCalledTimes(1));
    expect(h.playSound).toHaveBeenCalledWith('sla_breach', 'alert', 70);
    expect(h.toastError).toHaveBeenCalledWith(
      '⚠️ 3 SLA(s) Violado(s)',
      expect.objectContaining({ description: alerta.message }),
    );
    expect(h.notificacaoNavegador).toHaveBeenCalledTimes(1);

    const opcoes = h.toastError.mock.calls[0][1] as { action: { label: string; onClick: () => void } };
    expect(opcoes.action.label).toBe('Abrir War Room');
    act(() => opcoes.action.onClick());
    expect(h.navigate).toHaveBeenCalledWith('warroom');
  });

  it('alerta não crítico avisa mais baixo (warning) e com o som de aviso', async () => {
    await montarOuvinte();

    disparar(alertaDeCrise('warning'));

    await waitFor(() => expect(h.playSound).toHaveBeenCalledTimes(1));
    expect(h.playSound).toHaveBeenCalledWith('sla_warning', 'alert', 70);
    expect(h.toastWarning).toHaveBeenCalledTimes(1);
    expect(h.toastError).not.toHaveBeenCalled();
  });

  it('quem NÃO é da supervisão não recebe: nenhum canal é aberto', async () => {
    h.supervisor = false;

    renderHook(() => useGlobalCrisisAlerts());
    await act(async () => { await Promise.resolve(); });

    expect(h.canais).toBe(0);
    expect(h.playSound).not.toHaveBeenCalled();
    expect(h.toastError).not.toHaveBeenCalled();
  });

  it('o MESMO alerta visto pelo shell e pela War Room é anunciado uma vez só', async () => {
    await montarOuvinte();
    const alerta = alertaDeCrise();
    const somDaWarRoom = vi.fn();

    // Consumidor 1: o ouvinte do shell. Consumidor 2: a tela da War Room aberta,
    // que anuncia pelo mesmo caminho (`announceWarRoomAlert`).
    await act(async () => {
      h.handler!({ new: alerta });
      await announceWarRoomAlert(alerta, {
        soundEnabled: true,
        quietHours: false,
        browserNotifications: false,
        playSound: somDaWarRoom,
      });
    });

    expect(h.playSound).toHaveBeenCalledTimes(1);
    expect(somDaWarRoom).not.toHaveBeenCalled();
    expect(h.toastError).toHaveBeenCalledTimes(1);
  });

  it('repetir o mesmo INSERT não repete o aviso (uma vez por alerta)', async () => {
    await montarOuvinte();
    const alerta = alertaDeCrise();

    disparar(alerta);
    disparar(alerta);

    await waitFor(() => expect(h.playSound).toHaveBeenCalledTimes(1));
    expect(h.toastError).toHaveBeenCalledTimes(1);
  });

  it('aba em que outra já anunciou o alerta não toca nem avisa de novo', async () => {
    h.owner = false;
    await montarOuvinte();

    disparar(alertaDeCrise());
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });

    expect(h.playSound).not.toHaveBeenCalled();
    expect(h.toastError).not.toHaveBeenCalled();
    expect(h.notificacaoNavegador).not.toHaveBeenCalled();
  });
});
