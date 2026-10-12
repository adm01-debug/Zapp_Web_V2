import { startTransition, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Tempo (ms) para auto-limpar o estado "digitando…" caso não venha novo evento
 * `composing`. Configurável por instância via env `VITE_TYPING_AUTO_CLEAR_MS`
 * (ex.: 3000, 5000, 8000). Clamp: 1s–30s. Default: 5000ms.
 */
const DEFAULT_AUTO_CLEAR_MS = 5000;
const MIN_AUTO_CLEAR_MS = 1000;
const MAX_AUTO_CLEAR_MS = 30000;

function resolveAutoClearMs(): number {
  const raw = (import.meta.env?.VITE_TYPING_AUTO_CLEAR_MS as string | undefined)?.trim();
  if (!raw) return DEFAULT_AUTO_CLEAR_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_AUTO_CLEAR_MS;
  return Math.min(MAX_AUTO_CLEAR_MS, Math.max(MIN_AUTO_CLEAR_MS, Math.round(n)));
}

/** Auto-clear do aviso de "digitando…" (ms), resolvido uma vez a partir do env. */
export const TYPING_AUTO_CLEAR_MS = resolveAutoClearMs();

/**
 * Debounce do STOP (`isTyping=false`) para evitar o piscar quando o WhatsApp
 * alterna rapidamente `composing` → `paused` → `composing`. O START (`true`) é
 * aplicado imediatamente; o STOP só é confirmado após
 * `VITE_TYPING_STOP_DEBOUNCE_MS` ms sem reativação. Clamp: 100ms–5s.
 * Default: 600ms.
 */
const DEFAULT_STOP_DEBOUNCE_MS = 600;
const MIN_STOP_DEBOUNCE_MS = 100;
const MAX_STOP_DEBOUNCE_MS = 5000;

function resolveStopDebounceMs(): number {
  const raw = (import.meta.env?.VITE_TYPING_STOP_DEBOUNCE_MS as string | undefined)?.trim();
  if (!raw) return DEFAULT_STOP_DEBOUNCE_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_STOP_DEBOUNCE_MS;
  return Math.min(MAX_STOP_DEBOUNCE_MS, Math.max(MIN_STOP_DEBOUNCE_MS, Math.round(n)));
}

/** Debounce de parada do "digitando…" (ms), resolvido uma vez a partir do env. */
export const TYPING_STOP_DEBOUNCE_MS = resolveStopDebounceMs();

/** Opções do hook leve. `enabled=false` suspende a subscrição. */
export interface UseContactTypingOptions {
  /** Assina o canal só quando a linha está visível. Default true. */
  enabled?: boolean;
}

/**
 * Hook leve e SÓ LEITURA para escutar o broadcast `contact_typing` no canal
 * `typing:${contactId}` — o mesmo canal em que o webhook da Evolution publica
 * (ver `evolution-webhook-handlers.ts`). Feito para a linha da lista de
 * conversas: assinar só quando a linha está visível (`enabled`) e liberar o
 * canal ao sair da tela, sem o overhead de presence/track do `useTypingPresence`.
 *
 * Defesas: ignora `@broadcast`; ignora grupos (`@g.us`) — o webhook não publica
 * presença de grupo. Auto-clear por temporizador (`VITE_TYPING_AUTO_CLEAR_MS`,
 * default 5s) e debounce de parada (`VITE_TYPING_STOP_DEBOUNCE_MS`, default
 * 600ms) para não piscar entre `composing` e `paused`.
 *
 * Compat: aceita o segundo argumento como `boolean` (legacy) ou
 * `UseContactTypingOptions`.
 */
export function useContactTyping(
  contactId?: string | null,
  enabledOrOptions: boolean | UseContactTypingOptions = true
): boolean {
  const opts: UseContactTypingOptions =
    typeof enabledOrOptions === 'boolean' ? { enabled: enabledOrOptions } : enabledOrOptions;
  const enabled = opts.enabled !== false;

  const [isTyping, setIsTyping] = useState(false);
  const clearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || !contactId || contactId.endsWith('@broadcast') || contactId.endsWith('@g.us')) {
      // startTransition evita setState síncrono no corpo do efeito
      // (react-hooks/set-state-in-effect).
      startTransition(() => setIsTyping(false));
      return;
    }

    const clearAutoClear = () => {
      if (clearTimeoutRef.current) {
        clearTimeout(clearTimeoutRef.current);
        clearTimeoutRef.current = null;
      }
    };
    const clearStopDebounce = () => {
      if (stopTimeoutRef.current) {
        clearTimeout(stopTimeoutRef.current);
        stopTimeoutRef.current = null;
      }
    };

    const channel = supabase.channel(`typing:${contactId}`);

    channel.on('broadcast', { event: 'contact_typing' }, ({ payload }) => {
      const typing = (payload as { isTyping?: boolean } | undefined)?.isTyping === true;

      if (typing) {
        clearStopDebounce();
        clearAutoClear();
        setIsTyping(true);

        clearTimeoutRef.current = setTimeout(() => {
          setIsTyping(false);
          clearTimeoutRef.current = null;
        }, TYPING_AUTO_CLEAR_MS);
        return;
      }

      // STOP com debounce: sem reativação dentro da janela, o aviso sai de cena.
      clearStopDebounce();
      stopTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
        stopTimeoutRef.current = null;
        clearAutoClear();
      }, TYPING_STOP_DEBOUNCE_MS);
    });

    channel.subscribe();

    return () => {
      clearAutoClear();
      clearStopDebounce();
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [contactId, enabled]);

  return isTyping;
}
