/**
 * CV-097 — Janela de 24 h do WhatsApp.
 *
 * Prioridade baixa — a conexão principal é Evolution GO, onde a janela
 * de 24 h não existe. Este hook só emite alerta quando a conexão for da
 * API oficial da Meta (flavor != 'go').
 */
import { useMemo } from 'react';

export type WhatsAppFlavor = 'go' | 'official' | 'unknown';

export interface WhatsAppWindowState {
  /** Janela aplicável apenas na API oficial da Meta. */
  applicable: boolean;
  /** true se a última mensagem do cliente for > 24 h atrás. */
  windowExpired: boolean;
  /** Horas decorridas desde a última mensagem do cliente. */
  hoursElapsed: number;
  /** Horas restantes até o fechamento da janela (0 se já fechou). */
  hoursRemaining: number;
}

export interface UseWhatsAppWindowAlertOptions {
  flavor: WhatsAppFlavor;
  lastClientMessageAt: number | null;
}

const WINDOW_HOURS = 24;

export function useWhatsAppWindowAlert({
  flavor,
  lastClientMessageAt,
}: UseWhatsAppWindowAlertOptions): WhatsAppWindowState {
  return useMemo(() => {
    const applicable = flavor === 'official';

    if (!applicable || lastClientMessageAt === null) {
      return { applicable, windowExpired: false, hoursElapsed: 0, hoursRemaining: WINDOW_HOURS };
    }

    const hoursElapsed = (Date.now() - lastClientMessageAt) / 3_600_000;
    const windowExpired = hoursElapsed >= WINDOW_HOURS;
    const hoursRemaining = Math.max(0, WINDOW_HOURS - hoursElapsed);

    return {
      applicable,
      windowExpired,
      hoursElapsed: Math.round(hoursElapsed * 10) / 10,
      hoursRemaining: Math.round(hoursRemaining * 10) / 10,
    };
  }, [flavor, lastClientMessageAt]);
}
