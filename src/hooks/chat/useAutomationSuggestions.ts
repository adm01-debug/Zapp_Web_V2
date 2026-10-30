import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/** Fonte da sugestão, carimbada pelo SERVIDOR (`automation-suggest-reply`):
 *  `null` significa sugestão sem artigo da base de conhecimento. */
export interface AutomationSuggestionSource {
  article_id: string;
  title: string;
}

/** Sugestão de resposta pronta para a barra do compositor. */
export interface AutomationSuggestion {
  text: string;
  source: AutomationSuggestionSource | null;
}

/** Espera antes de ir à Edge: mensagem que ainda está chegando não gasta IA. */
export const AUTOMATION_SUGGESTIONS_DEBOUNCE_MS = 400;

/** Teto da memória por mensagem (a mais antiga sai quando estoura). */
const MAX_CACHED_MESSAGES = 50;

/**
 * Memória por MENSAGEM da conversa (o cartão pede "por lastInboundMessageId").
 * O id da mensagem é único e o conteúdo não muda, então repetir a mesma
 * mensagem (voltar na conversa, remontar o compositor) não paga IA de novo.
 */
const suggestionCache = new Map<string, AutomationSuggestion[]>();
const dismissedMessages = new Set<string>();

function copySuggestions(suggestions: AutomationSuggestion[]): AutomationSuggestion[] {
  return suggestions.map((s) => ({
    text: s.text,
    source: s.source ? { ...s.source } : null,
  }));
}

function peekCache(messageId: string): AutomationSuggestion[] | undefined {
  const hit = suggestionCache.get(messageId);
  return hit ? copySuggestions(hit) : undefined;
}

function readCache(messageId: string): AutomationSuggestion[] | undefined {
  const hit = suggestionCache.get(messageId);
  if (!hit) return undefined;
  // Reordena como o mais recente para a evicção tirar o mais antigo.
  suggestionCache.delete(messageId);
  suggestionCache.set(messageId, hit);
  return copySuggestions(hit);
}

function writeCache(messageId: string, suggestions: AutomationSuggestion[]): void {
  suggestionCache.delete(messageId);
  suggestionCache.set(messageId, copySuggestions(suggestions));
  while (suggestionCache.size > MAX_CACHED_MESSAGES) {
    const oldest = suggestionCache.keys().next().value;
    if (oldest === undefined) break;
    suggestionCache.delete(oldest);
  }
}

/** Limpa a memória por mensagem (cache + dispensa) — usar na troca de sessão/usuário. */
export function resetAutomationSuggestionsMemory(): void {
  suggestionCache.clear();
  dismissedMessages.clear();
}

/** Tipo de falha da Edge, para o silêncio não virar alarme falso. */
export type AutomationSuggestionFailure = 'quota' | 'network' | 'other';

interface ErrorLike {
  name?: string;
  message?: string;
  status?: number;
  context?: { status?: number };
}

/**
 * `429` cobre orçamento de IA estourado e o guarda de ritmo (códigos estáveis
 * `ai_budget_exceeded`/`rate_limited` na Edge): é um limite do produto, não um
 * defeito da tela — nada deve aparecer. Falha de rede é o mesmo caso.
 * Só o status 429 e o nome `FunctionsFetchError` (erro de rede do cliente
 * Supabase) viram silêncio; texto da mensagem nunca decide, para um erro de
 * código que mencione "fetch" não sumir como se fosse offline.
 */
export function classifyAutomationSuggestionFailure(error: unknown): AutomationSuggestionFailure {
  if (!error || typeof error !== 'object') return 'other';
  const candidate = error as ErrorLike;
  const status = candidate.status ?? candidate.context?.status;
  if (status === 429) return 'quota';
  if (candidate.name === 'FunctionsFetchError') return 'network';
  return 'other';
}

function parseSource(source: unknown): AutomationSuggestionSource | null {
  if (!source || typeof source !== 'object') return null;
  const row = source as { article_id?: unknown; title?: unknown };
  if (typeof row.article_id !== 'string' || typeof row.title !== 'string') return null;
  return { article_id: row.article_id, title: row.title };
}

/**
 * Lê `{ suggestions: [{ text, source }] }` da Edge. Devolve `null` só quando o
 * corpo NÃO atende ao contrato (o chamador sinaliza); lista vazia é tratada
 * pelo chamador como ausência sinalizada (fallback silencioso da Edge também
 * chega aqui como `[]`, então vazio nunca vira "ok").
 */
function parseSuggestions(payload: unknown): AutomationSuggestion[] | null {
  if (!payload || typeof payload !== 'object') return null;
  const raw = (payload as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(raw)) return null;
  const parsed: AutomationSuggestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as { text?: unknown; source?: unknown };
    if (typeof row.text !== 'string' || row.text.trim().length === 0) continue;
    parsed.push({ text: row.text, source: parseSource(row.source) });
  }
  return parsed;
}

/** O que a Edge respondeu para UMA mensagem da conversa. */
interface MessageSuggestions {
  messageId: string;
  suggestions: AutomationSuggestion[];
  /** Preenchido só no que é defeito real; limite/offline ficam em silêncio. */
  error: string | null;
}

const readingCache = (messageId: string | null): Record<string, MessageSuggestions> => {
  if (!messageId) return {};
  const hit = readCache(messageId);
  return hit ? { [messageId]: { messageId, suggestions: hit, error: null } } : {};
};

/**
 * Sugestões de resposta da automação para a barra acima do compositor.
 *
 * `lastInboundMessageId` é o id da ÚLTIMA mensagem da conversa QUANDO ela é do
 * contato; o chamador passa `null` quando a última mensagem é do agente (ou a
 * conversa está vazia) e o hook não vai à Edge. É esse contrato que evita gastar
 * IA respondendo a nós mesmos.
 *
 * Não repete a chamada para a mesma mensagem (memória por id, compartilhada
 * entre montagens) e espera `AUTOMATION_SUGGESTIONS_DEBOUNCE_MS` antes de
 * chamar, para mensagem que ainda está chegando não disparar requisição.
 *
 * `dismiss()` esconde a barra daquela mensagem sem nova chamada. `429`
 * (orçamento/limite) e falha de rede devolvem lista vazia em silêncio, sem
 * toast; falha inesperada também não renderiza nada, mas sobra sinalizada em
 * `error` — nunca engolida.
 */
export function useAutomationSuggestions(
  contactId: string | null | undefined,
  lastInboundMessageId: string | null | undefined,
) {
  const messageId = lastInboundMessageId ?? null;

  // Resultado por mensagem. Só cresce com o que a Edge respondeu NESTA montagem;
  // a memória entre montagens entra pelo inicializador (sem setState no efeito).
  const [entries, setEntries] = useState<Record<string, MessageSuggestions>>(() =>
    readingCache(lastInboundMessageId ?? null),
  );
  const [dismissedIds, setDismissedIds] = useState<ReadonlySet<string>>(() => {
    const initial = lastInboundMessageId ?? null;
    return new Set(initial && dismissedMessages.has(initial) ? [initial] : []);
  });

  const cachedEntry = messageId && !entries[messageId] ? peekCache(messageId) : undefined;
  const entry = messageId
    ? (entries[messageId] ?? (cachedEntry ? { messageId, suggestions: cachedEntry, error: null } : undefined))
    : undefined;
  // A dispensa é global (outra montagem pode ter dispensado este id e esta
  // montagem só chega nele por rerender): o conjunto local sozinho deixaria
  // a barra reaparecer — ou o `loading` preso, pois o efeito não busca dispensa.
  const isDismissed = !!messageId && (dismissedIds.has(messageId) || dismissedMessages.has(messageId));

  const suggestions = isDismissed ? [] : (entry?.suggestions ?? []);
  const error = isDismissed ? null : (entry?.error ?? null);
  const loading = !!contactId && !!messageId && !isDismissed && !entry;

  useEffect(() => {
    if (!contactId || !messageId) return;
    // Dispensada ou já respondida antes (outra montagem): não paga IA de novo.
    if (dismissedMessages.has(messageId)) return;
    if (readCache(messageId)) return;

    let cancelled = false;

    const timer = setTimeout(() => {
      void (async () => {
        const { data, error: invokeError } = await supabase.functions.invoke('automation-suggest-reply', {
          body: { contact_id: contactId, message_id: messageId },
        });

        // Resposta de mensagem/contato anterior é descartada DEPOIS do await:
        // não sobrescreve a sugestão da conversa atual nem deixa o carregando preso.
        if (cancelled) return;

        const resolved = (): MessageSuggestions => {
          if (invokeError) {
            const kind = classifyAutomationSuggestionFailure(invokeError);
            return {
              messageId,
              suggestions: [],
              // Limite/orçamento e rede ficam silenciosos; o resto é sinalizado.
              error: kind === 'other' ? (invokeError.message || 'Não foi possível buscar sugestões.') : null,
            };
          }
          const parsed = parseSuggestions(data);
          if (!parsed) {
            return {
              messageId,
              suggestions: [],
              error: 'A resposta da automação não atende ao contrato esperado.',
            };
          }
          if (parsed.length === 0) {
            return {
              messageId,
              suggestions: [],
              error: 'A automação não encontrou uma sugestão para esta mensagem.',
            };
          }
          writeCache(messageId, parsed);
          return { messageId, suggestions: parsed, error: null };
        };

        const next = resolved();
        setEntries((prev) => ({ ...prev, [messageId]: next }));
      })();
    }, AUTOMATION_SUGGESTIONS_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [contactId, messageId]);

  const dismiss = useCallback(() => {
    if (!messageId) return;
    dismissedMessages.add(messageId);
    // Atualização de estado num callback do usuário: esconde a barra sem
    // disparar nova chamada ao servidor (o efeito não depende disto).
    setDismissedIds((prev) => {
      if (prev.has(messageId)) return prev;
      const next = new Set(prev);
      next.add(messageId);
      return next;
    });
  }, [messageId]);

  return { suggestions, loading, error, isDismissed, dismiss };
}
