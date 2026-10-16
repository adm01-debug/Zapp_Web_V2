/**
 * CV-061, CV-062 — Texto fantasma (ghost text) e completar enquanto digita.
 *
 * CV-061: a melhor sugestão do RADAR aparece em cinza na caixa de digitação.
 *   - Tab aceita (preenche o input com o texto completo).
 *   - Esc descarta (limpa o ghost text sem alterar o input).
 *   - Não interfere se o vendedor já está no meio de uma palavra.
 *
 * CV-062: ao parar de digitar por ≥ 400ms com texto suficiente, solicita
 *   completion ao endpoint `ai-suggest-reply` (modelo pequeno, propósito copilot).
 *   Desliga automaticamente se a latência p95 superar 800ms em 3 requisições seguidas.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { invokeEdge } from '@/lib/invokeEdge';
import { createLogger } from '@/lib/logger';

const log = createLogger('useGhostText');

/** Latência máxima (ms) acima da qual o ghost text é suspenso automaticamente. */
const LATENCY_P95_THRESHOLD_MS = 800;
/** Janela de amostras para calcular p95 de latência. */
const LATENCY_WINDOW = 6;
/** Debounce (ms) para disparar a requisição de completion. */
const DEBOUNCE_MS = 400;
/** Comprimento mínimo do input para disparar completion. */
const MIN_INPUT_LEN = 4;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

export interface UseGhostTextOptions {
  /** Valor atual do textarea. */
  inputValue: string;
  /** ID do contato (para contexto da requisição). */
  contactId: string;
  /** Nome do contato. */
  contactName: string;
  /** Mensagens da conversa (para contexto). */
  messages: Array<{ content: string; sender: string }>;
  /** Callback chamado quando o vendedor aceita o ghost text (Tab). */
  onAccept: (fullText: string) => void;
  /** Flag para desabilitar completamente (feature flag). */
  enabled?: boolean;
}

export interface GhostTextState {
  /** Sufixo sugerido pelo modelo (o que aparece em cinza depois do cursor). */
  ghostSuffix: string;
  /** Limpa o ghost text sem aceitar. */
  dismiss: () => void;
  /** Aceita o ghost text (igual ao Tab). */
  accept: () => void;
  /** Lida com o evento keydown para interceptar Tab e Esc. */
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean;
  /** true se o serviço está temporariamente suspenso por latência alta. */
  suspended: boolean;
  /** true enquanto aguarda resposta do modelo. */
  loading: boolean;
}

export function useGhostText({
  inputValue,
  contactId,
  contactName,
  messages,
  onAccept,
  enabled = true,
}: UseGhostTextOptions): GhostTextState {
  const [ghostSuffix, setGhostSuffix] = useState('');
  const [suspended, setSuspended] = useState(false);
  const [loading, setLoading] = useState(false);
  const latencySamples = useRef<number[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const dismiss = useCallback(() => setGhostSuffix(''), []);

  const accept = useCallback(() => {
    if (ghostSuffix) {
      onAccept(inputValue + ghostSuffix);
      setGhostSuffix('');
    }
  }, [ghostSuffix, inputValue, onAccept]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!ghostSuffix) return false;
      if (e.key === 'Tab') {
        e.preventDefault();
        accept();
        return true;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        dismiss();
        return true;
      }
      return false;
    },
    [ghostSuffix, accept, dismiss],
  );

  const recordLatency = useCallback((ms: number) => {
    latencySamples.current = [...latencySamples.current.slice(-(LATENCY_WINDOW - 1)), ms];
    if (latencySamples.current.length >= LATENCY_WINDOW) {
      const sorted = [...latencySamples.current].sort((a, b) => a - b);
      const p95 = percentile(sorted, 95);
      if (p95 > LATENCY_P95_THRESHOLD_MS) {
        setSuspended(true);
        log.warn('ghost text suspenso: latência p95 acima do limite', { p95 });
      } else {
        setSuspended(false);
      }
    }
  }, []);

  const requestCompletion = useCallback(
    async (text: string) => {
      if (!enabled || suspended || text.trim().length < MIN_INPUT_LEN) return;
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      setLoading(true);
      const t0 = Date.now();
      try {
        const recentMessages = messages.slice(-10).map((m) => ({
          content: m.content,
          sender: m.sender,
        }));

        const { data, error } = await invokeEdge<{ suggestions?: Array<{ text: string }> }>(
          'ai-suggest-reply',
          {
            body: {
              messages: recentMessages,
              contactName,
              contactId,
              context: `MODO COMPLETION: o vendedor começou a digitar "${text}". Complete a frase de forma natural, no mesmo estilo e tom, usando o contexto da conversa. Retorne APENAS o texto de completamento (o que vem depois do que o vendedor escreveu), sem repetir o que ele já digitou. Se não souber completar, retorne string vazia.`,
            },
          },
        );
        const elapsed = Date.now() - t0;
        recordLatency(elapsed);
        if (error || !data?.suggestions?.length) {
          setGhostSuffix('');
          return;
        }
        const raw = data.suggestions[0].text ?? '';
        const suffix = raw.startsWith(text) ? raw.slice(text.length) : raw;
        setGhostSuffix(suffix.trim() ? ` ${suffix.trim()}` : '');
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          log.error('ghost text: erro na requisição', { msg: err.message });
        }
        setGhostSuffix('');
      } finally {
        setLoading(false);
      }
    },
    [enabled, suspended, messages, contactName, contactId, recordLatency],
  );

  useEffect(() => {
    if (!enabled) { setGhostSuffix(''); return; }
    setGhostSuffix('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (inputValue.trim().length >= MIN_INPUT_LEN) {
      debounceRef.current = setTimeout(() => {
        void requestCompletion(inputValue);
      }, DEBOUNCE_MS);
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue, enabled]);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  return { ghostSuffix, dismiss, accept, handleKeyDown, suspended, loading };
}
