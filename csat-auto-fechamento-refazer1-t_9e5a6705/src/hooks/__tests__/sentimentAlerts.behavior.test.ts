import '@/hooks/__tests__/helpers/alertMocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * Prova de EFEITO dos dois caminhos de alerta de sentimento (o teste antigo cobria só o encanamento):
 * o som só toca quando o alerta de fato dispara, com o tipo e o volume persistidos do painel.
 *
 * - `useRealtimeSentimentAlerts`: o callback do Realtime entrega o envelope (`payload.new` = a linha
 *   de `notifications`); precisa vir `type === 'sentiment_alert'`, com `sentimentAlertEnabled` ligado
 *   e sem o dedupe já ter reivindicado o evento.
 * - `useSentimentAlerts`: disparado pelo analisador; o som toca quando a função de análise responde
 *   `alerted: true` e `notifyCaller !== false`.
 */
import {
  callbacks,
  dedupeResult,
  invoke,
  playNotificationSound,
  resetAlertKit,
  settingsCfg,
} from '@/hooks/__tests__/helpers/alertBehaviorTestKit';

import { useRealtimeSentimentAlerts } from '@/hooks/inbox/useRealtimeSentimentAlerts';
import { useSentimentAlerts } from '@/hooks/inbox/useSentimentAlerts';

const analise = {
  contactId: 'c1',
  contactName: 'Fulano',
  sentimentScore: 10,
  previousScore: 50,
  analysisId: 'a1',
};

function linhaDeSentimento(over: Record<string, unknown> = {}) {
  return {
    id: 'n1',
    type: 'sentiment_alert',
    metadata: {
      contact_name: 'Fulano',
      sentiment_score: 12,
      consecutive_low: 3,
      analysis_id: 'a1',
    },
    ...over,
  };
}

function entregar(over: Record<string, unknown> = {}) {
  return callbacks[0]({ new: linhaDeSentimento(over) });
}

beforeEach(() => {
  resetAlertKit();
  settingsCfg.mentionSoundType = 'ping';
  settingsCfg.soundVolume = 55;
  settingsCfg.sentimentAlertEnabled = true;
});

describe('useRealtimeSentimentAlerts — efeito do alerta', () => {
  it('toca com o tipo e o volume persistidos quando chega alerta de sentimento', async () => {
    renderHook(() => useRealtimeSentimentAlerts());

    expect(callbacks.length).toBeGreaterThan(0);
    await act(async () => {
      await entregar();
    });

    await waitFor(() => {
      expect(playNotificationSound).toHaveBeenCalledWith('mention', 'ping', 55);
    });
  });

  it('não toca quando o alerta de sentimento está desligado no painel', async () => {
    settingsCfg.sentimentAlertEnabled = false;
    renderHook(() => useRealtimeSentimentAlerts());

    await act(async () => {
      await entregar({ id: 'n2' });
    });

    expect(playNotificationSound).not.toHaveBeenCalled();
  });

  it('não toca notificação que não é de sentimento', async () => {
    renderHook(() => useRealtimeSentimentAlerts());

    await act(async () => {
      await entregar({ id: 'n3', type: 'outra_coisa' });
    });

    expect(playNotificationSound).not.toHaveBeenCalled();
  });

  it('não toca o mesmo alerta duas vezes (dedupe)', async () => {
    dedupeResult.valor = false;
    renderHook(() => useRealtimeSentimentAlerts());

    await act(async () => {
      await entregar({ id: 'n4' });
    });

    expect(playNotificationSound).not.toHaveBeenCalled();
  });
});

describe('useSentimentAlerts — efeito do alerta', () => {
  it('toca com o tipo e o volume persistidos quando a análise responde que alertou', async () => {
    invoke.mockResolvedValue({ data: { alerted: true, notifyCaller: true, consecutiveLow: 3 }, error: null });
    const { result } = renderHook(() => useSentimentAlerts());

    await act(async () => {
      await result.current.checkAndTriggerAlert(analise);
    });

    await waitFor(() => {
      expect(playNotificationSound).toHaveBeenCalledWith('mention', 'ping', 55);
    });
  });

  it('não toca quando a análise não disparou alerta', async () => {
    invoke.mockResolvedValue({ data: { alerted: false, reason: 'score acima do limite' }, error: null });
    const { result } = renderHook(() => useSentimentAlerts());

    await act(async () => {
      await result.current.checkAndTriggerAlert(analise);
    });

    expect(playNotificationSound).not.toHaveBeenCalled();
  });

  it('não toca quando a análise pede para outro consumidor notificar (notifyCaller: false)', async () => {
    invoke.mockResolvedValue({ data: { alerted: true, notifyCaller: false }, error: null });
    const { result } = renderHook(() => useSentimentAlerts());

    await act(async () => {
      await result.current.checkAndTriggerAlert(analise);
    });

    expect(playNotificationSound).not.toHaveBeenCalled();
  });

  it('não toca quando a função de análise falha', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const { result } = renderHook(() => useSentimentAlerts());

    await act(async () => {
      await result.current.checkAndTriggerAlert(analise);
    });

    expect(playNotificationSound).not.toHaveBeenCalled();
  });
});
