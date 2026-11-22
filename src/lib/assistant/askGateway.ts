/**
 * Fase 3 — cliente da PORTA ÚNICA (`assistant-gateway`).
 *
 * Só a requisição e a normalização da resposta; quem renderiza é o card. A edge
 * devolve `{ answer, pieces, capabilities, sources, errors }`, e a UI mostra
 * `sources` para o vendedor saber de onde veio cada pedaço — o texto do modelo
 * não é a prova, a origem é.
 */
import { edgeAuthHeaders } from '@/lib/edgeAuthHeaders';
import { SUPABASE_URL } from '@/integrations/supabase/client';

export interface GatewaySource {
  kind: 'perfil' | 'contato' | 'agenda' | 'conversa' | 'negocio';
  origin: string;
  rows: number;
  error?: string;
}

export interface GatewayAnswer {
  answer: string;
  capabilities: string[];
  sources: GatewaySource[];
  errors: string[];
}

export interface AskGatewayArgs {
  query: string;
  contactId: string | null;
  /** Injeção para teste. */
  callApi?: (body: Record<string, unknown>) => Promise<{ status: number; body: unknown }>;
}

async function callEdge(body: Record<string, unknown>): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/assistant-gateway`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await edgeAuthHeaders()) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

/** Rótulo curto de cada fonte, para a UI não vazar nome de tabela. */
export const SOURCE_LABELS: Record<GatewaySource['kind'], string> = {
  perfil: 'seu perfil',
  contato: 'cadastro do contato',
  agenda: 'agenda',
  conversa: 'conversa',
  negocio: 'negócio aberto',
};

function texto(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** `answer` ausente não pode virar tela em branco: usa o motivo do erro. */
function fallbackAnswer(errors: string[]): string {
  return errors.length > 0
    ? `Não consegui responder: ${errors.join('; ')}`
    : 'Não consegui montar uma resposta com as fontes disponíveis.';
}

export async function askGateway({ query, contactId, callApi = callEdge }: AskGatewayArgs): Promise<GatewayAnswer> {
  if (!query.trim()) throw new Error('Escreva o que você quer saber.');

  const res = await callApi({ query: query.trim(), contactId });
  const body = (res.body ?? {}) as Record<string, unknown>;

  if (res.status === 401) throw new Error('Sua sessão expirou. Entre novamente para falar com o assistente.');
  if (res.status === 503) throw new Error('O assistente está temporariamente desligado.');
  if (res.status < 200 || res.status >= 300) {
    throw new Error(texto(body.error) || `O assistente falhou (HTTP ${res.status}).`);
  }

  const errors = Array.isArray(body.errors) ? (body.errors as unknown[]).filter((e): e is string => typeof e === 'string') : [];
  const sources = Array.isArray(body.sources)
    ? (body.sources as Array<Record<string, unknown>>)
        .filter((s) => s && typeof s.origin === 'string')
        .map((s) => ({
          kind: (s.kind as GatewaySource['kind']) ?? 'conversa',
          origin: String(s.origin),
          rows: typeof s.rows === 'number' ? s.rows : 0,
          ...(typeof s.error === 'string' ? { error: s.error } : {}),
        }))
    : [];

  return {
    answer: texto(body.answer) || fallbackAnswer(errors),
    capabilities: Array.isArray(body.capabilities) ? (body.capabilities as unknown[]).filter((c): c is string => typeof c === 'string') : [],
    sources,
    errors,
  };
}