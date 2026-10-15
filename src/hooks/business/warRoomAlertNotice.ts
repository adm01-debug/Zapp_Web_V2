import { toast } from 'sonner';
import { showBrowserNotification } from '@/utils/notificationSounds';
import { claimNotificationEvent } from '@/lib/notificationDedupe';
import { createCrossTabSendDedupe, type CrossTabSendDedupe } from '@/lib/crossTabSendDedupe';
import { navigateToView } from '@/hooks/system/useNavigationHistory';

/**
 * Aviso de UM alerta da War Room (alerta de crise), em qualquer tela.
 *
 * Antes existiam dois consumidores do INSERT em `warroom_alerts` — o monitor
 * dentro do `useWarRoomAlerts` (só com a War Room aberta) e nenhum fora dela —
 * e nada coordenava dois deles. Aqui a ANÚNCIO é uma decisão ÚNICA:
 *
 * 1. `claimNotificationEvent` — a mesma aba não anuncia duas vezes, mesmo com o
 *    ouvinte global e a tela da War Room montados juntos;
 * 2. `crossTabSendDedupe` — entre abas do mesmo usuário, exatamente uma
 *    reivindicação vence (quem publica primeiro; no empate, o id de aba menor),
 *    então só uma aba toca o som/aviso. Sem `BroadcastChannel` a aba age sozinha.
 *
 * A permissão de notificação do navegador NÃO é pedida aqui: o helper só desenha
 * a notificação quando a permissão já foi concedida por clique do usuário.
 */
export interface WarRoomAlertNoticeInput {
  id: string;
  alert_type: string;
  title: string;
  message: string;
}

export interface WarRoomAlertAnnounceOptions {
  /** Mudo do painel (`user_settings.sound_enabled`) ou o valor do chamador. */
  soundEnabled: boolean;
  /** Horário de silêncio do painel — alerta mudo continua VISÍVEL no toast. */
  quietHours: boolean;
  /** Preferência de aviso de desktop (`user_settings.browser_notifications`). */
  browserNotifications: boolean;
  /** Canal de som de quem anuncia: a War Room usa o áudio próprio da tela. */
  playSound: () => void;
}

export const CRISIS_ALERT_DEDUPE_CHANNEL = 'zapp-crisis-alerts';

/** Identidade do aviso: o id da linha de `warroom_alerts` é o alerta. */
export function crisisAlertAnnouncementKey(alertId: string): string {
  return `warroom-alert:${alertId}`;
}

let dedupeEntreAbas: CrossTabSendDedupe | null = null;

export function crisisAlertCrossTabDedupe(): CrossTabSendDedupe {
  dedupeEntreAbas ??= createCrossTabSendDedupe({ channelName: CRISIS_ALERT_DEDUPE_CHANNEL });
  return dedupeEntreAbas;
}

function abrirWarRoom(): void {
  navigateToView('warroom');
}

/**
 * `true` = ESTE consumidor (nesta aba) anunciou; `false` = o aviso já era de
 * outro consumidor da mesma aba ou de outra aba. Nunca anuncia duas vezes.
 */
export async function announceWarRoomAlert(
  alerta: WarRoomAlertNoticeInput,
  opcoes: WarRoomAlertAnnounceOptions,
): Promise<boolean> {
  const chave = crisisAlertAnnouncementKey(alerta.id);
  if (!claimNotificationEvent(chave)) return false;

  const { owner } = await crisisAlertCrossTabDedupe().claim(chave, chave);
  if (!owner) return false;

  const critico = alerta.alert_type === 'critical';
  const avisar = critico ? toast.error : toast.warning;
  avisar(`⚠️ ${alerta.title}`, {
    description: alerta.message,
    duration: critico ? 15000 : 10000,
    action: { label: 'Abrir War Room', onClick: abrirWarRoom },
  });

  if (opcoes.soundEnabled && !opcoes.quietHours) opcoes.playSound();

  if (opcoes.browserNotifications) {
    showBrowserNotification(`⚠️ ${alerta.title}`, alerta.message, {
      tag: `warroom-${alerta.id}`,
      onClick: abrirWarRoom,
    });
  }

  return true;
}
