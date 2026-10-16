/**
 * CV-093 — Alerta de velocidade de resposta (speed to lead).
 *
 * Lead novo sem resposta acende alerta em 2 min (para o vendedor)
 * e em 5 min (escalada para o supervisor).
 */
import { useState, useEffect, useRef, useCallback } from 'react';

export type SpeedToLeadLevel = 'ok' | 'warning' | 'critical';

export interface SpeedToLeadState {
  level: SpeedToLeadLevel;
  elapsedMinutes: number;
  shouldEscalate: boolean;
  dismissedAt: number | null;
}

export interface UseSpeedToLeadOptions {
  /** Timestamp (ms) da primeira mensagem do lead não respondida. null = sem lead pendente. */
  firstUnansweredAt: number | null;
  /** Minutos até o alerta para o vendedor (padrão 2). */
  warningMinutes?: number;
  /** Minutos até a escalada para o supervisor (padrão 5). */
  criticalMinutes?: number;
  onWarning?: () => void;
  onCritical?: () => void;
}

const DEFAULT_WARNING = 2;
const DEFAULT_CRITICAL = 5;

export function useSpeedToLead({
  firstUnansweredAt,
  warningMinutes = DEFAULT_WARNING,
  criticalMinutes = DEFAULT_CRITICAL,
  onWarning,
  onCritical,
}: UseSpeedToLeadOptions): SpeedToLeadState & { dismiss: () => void } {
  const [state, setState] = useState<SpeedToLeadState>({
    level: 'ok',
    elapsedMinutes: 0,
    shouldEscalate: false,
    dismissedAt: null,
  });

  const onWarningRef = useRef(onWarning);
  const onCriticalRef = useRef(onCritical);
  useEffect(() => { onWarningRef.current = onWarning; });
  useEffect(() => { onCriticalRef.current = onCritical; });

  const firedWarningRef = useRef(false);
  const firedCriticalRef = useRef(false);

  useEffect(() => {
    if (firstUnansweredAt === null) {
      setState({ level: 'ok', elapsedMinutes: 0, shouldEscalate: false, dismissedAt: null });
      firedWarningRef.current = false;
      firedCriticalRef.current = false;
      return;
    }

    const tick = () => {
      const elapsed = (Date.now() - firstUnansweredAt) / 60_000;
      const level: SpeedToLeadLevel =
        elapsed >= criticalMinutes ? 'critical' :
        elapsed >= warningMinutes ? 'warning' : 'ok';
      const shouldEscalate = elapsed >= criticalMinutes;

      if (level === 'warning' && !firedWarningRef.current) {
        firedWarningRef.current = true;
        if (onWarningRef.current) onWarningRef.current();
      }
      if (level === 'critical' && !firedCriticalRef.current) {
        firedCriticalRef.current = true;
        if (onCriticalRef.current) onCriticalRef.current();
      }

      setState(prev => ({
        level,
        elapsedMinutes: Math.round(elapsed * 10) / 10,
        shouldEscalate,
        dismissedAt: prev.dismissedAt,
      }));
    };

    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [firstUnansweredAt, warningMinutes, criticalMinutes]);

  const dismiss = useCallback(() => {
    setState(prev => ({ ...prev, dismissedAt: Date.now() }));
  }, []);

  return { ...state, dismiss };
}
