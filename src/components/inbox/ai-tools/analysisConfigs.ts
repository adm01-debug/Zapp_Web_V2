import React from 'react';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  Minus,
  AlertTriangle,
  ShieldAlert,
  Heart,
  Eye,
  Zap,
  BookOpen,
} from 'lucide-react';

export interface AgentPerformance {
  empathy: number;
  clarity: number;
  efficiency: number;
  knowledge: number;
}

export interface AnalysisData {
  analysisId?: string | null;
  department?: string;
  relationshipType?: string;
  summary: string;
  status: string;
  keyPoints: string[];
  nextSteps?: string[];
  sentiment: string;
  sentimentScore?: number;
  topics?: string[];
  urgency?: string;
  customerSatisfaction?: number;
  agentPerformance?: AgentPerformance | null;
  churnRisk?: string;
  salesOpportunity?: string | null;
}

export interface AnalysisMessage {
  id: string;
  sender: 'agent' | 'contact';
  content: string;
  type?: string;
  mediaUrl?: string;
  created_at: string;
}

/**
 * Envelope de execução das capacidades de IA (IA-025): toda resposta das Edge
 * Functions de IA carrega `status`, `error` e o payload em `data`. Campos
 * opcionais permanecem opcionais — ausência é ausência.
 */
export interface AiEnvelope<T> {
  capability?: string;
  status?: 'ok' | 'partial' | 'error';
  error?: unknown;
  data?: T;
  /** Só a análise devolve o id da linha gravada; o resumo não tem id. */
  analysisId?: string | null;
}

/** Mensagem de erro apresentável ao usuário, sem inventar texto genérico. */
export function aiEnvelopeErrorMessage(error: unknown, fallback: string): string {
  return typeof error === 'string' && error.trim() !== '' ? error : fallback;
}

/**
 * Lê o envelope de um `functions.invoke` que falhou (HTTP não-2xx). O corpo da
 * resposta fica em `error.context` (Response) — sem lê-lo o usuário só veria
 * "Edge Function returned a non-2xx status code".
 *
 * Dois corpos são entendidos: (1) o envelope de execução das IA-025
 * (`capability` + `status`); (2) a resposta canônica de validação
 * (`{ error: { code, message, fields } }`, supabase/functions/_shared/schemas.ts
 * :626-651) que a edge devolve com 422 quando o contexto estoura o teto — o
 * `message` do servidor é o que explica o motivo ao usuário.
 */
export async function readAiErrorEnvelope<T>(error: unknown): Promise<AiEnvelope<T> | null> {
  const context = (error as { context?: Response } | null)?.context;
  if (!context || typeof context.clone !== 'function') return null;
  try {
    const body = (await context.clone().json()) as unknown;
    if (body && typeof body === 'object') {
      if ('capability' in body && 'status' in body) {
        return body as AiEnvelope<T>;
      }
      const validationError = (body as { error?: unknown }).error;
      if (validationError && typeof validationError === 'object') {
        const message = (validationError as { message?: unknown }).message;
        if (typeof message === 'string' && message.trim() !== '') {
          return { status: 'error', error: message };
        }
      }
    }
  } catch {
    // corpo sem JSON (timeout/proxy): sem envelope a mostrar
  }
  return null;
}

// ── Janela de contexto enviada à IA ──────────────────────────────────────────
// Tetos do servidor, ESPELHADOS de supabase/functions/_shared/schemas.ts
// (CONTEXT_LIMITS): acima deles a edge responde 422 e NUNCA trunca em silêncio.
// O cliente recorta antes de enviar — e diz o que recortou.
export const AI_CONTEXT_LIMITS = {
  maxMessages: 200,
  maxSingleMessageChars: 5000,
  maxTotalChars: 120000,
} as const;

/** Teto do `content` de UMA mensagem no `ai-proxy` (supabase/functions/ai-proxy/index.ts:54). */
export const AI_PROXY_CONTENT_LIMIT = 50000;

export interface AiContextWindow<T> {
  /** Recorte enviável, na ordem original (mais antigas antes das mais recentes). */
  messages: T[];
  /** Quantas mensagens ficaram de fora do recorte. */
  omitted: number;
  /** Total disponível ANTES do recorte. */
  total: number;
}

/**
 * Recorta o contexto de conversa para o que a edge aceita: as últimas
 * `maxMessages` mensagens, cada texto cortado em `maxSingleMessageChars` e o
 * conjunto reduzido até caber no teto agregado de caracteres. Sem isso o 422
 * derruba a análise inteira; com isso a janela enviada é sempre aceita.
 */
export function limitAnalysisContext<T extends { content?: string }>(messages: T[]): AiContextWindow<T> {
  const capped = messages.map((message) =>
    typeof message.content === 'string' && message.content.length > AI_CONTEXT_LIMITS.maxSingleMessageChars
      ? { ...message, content: message.content.slice(0, AI_CONTEXT_LIMITS.maxSingleMessageChars) }
      : message,
  );
  const window = capped.slice(-AI_CONTEXT_LIMITS.maxMessages);
  let omitted = capped.length - window.length;
  let totalChars = window.reduce((sum, message) => sum + (message.content?.length ?? 0), 0);
  while (window.length > 1 && totalChars > AI_CONTEXT_LIMITS.maxTotalChars) {
    totalChars -= window[0].content?.length ?? 0;
    window.shift();
    omitted += 1;
  }
  return { messages: window, omitted, total: messages.length };
}

export interface AiTextWindow {
  /** Recorte enviável, na ordem original. */
  texts: string[];
  /** Quantos textos ficaram de fora do recorte. */
  omitted: number;
  /** Total disponível ANTES do recorte. */
  total: number;
}

/**
 * Mesmo recorte, para listas de TEXTO já montadas (objeções e universitários
 * enviam as mensagens concatenadas numa única mensagem do `ai-proxy`, cujo teto
 * é `AI_PROXY_CONTENT_LIMIT`). Descarta os itens mais antigos até o texto
 * concatenado caber — o separador `\n` conta no orçamento.
 *
 * O comprimento que vale é o do texto UNIDO com `\n` — exatamente o que vai no
 * corpo da mensagem. Medido direto no `join`, sem contabilidade paralela.
 */
export function limitAiTexts(texts: string[], maxChars: number = AI_PROXY_CONTENT_LIMIT): AiTextWindow {
  const window = [...texts];
  let omitted = 0;
  while (window.length > 1 && window.join('\n').length > maxChars) {
    window.shift();
    omitted += 1;
  }
  return { texts: window, omitted, total: texts.length };
}

/**
 * O período pedido está INTEIRO dentro da janela carregada? Decide se
 * `period_days` pode ser gravado: com histórico mais antigo não carregado, a
 * janela pode começar DEPOIS do início do período, e gravar os dias afirmaria
 * um recorte que não foi analisado. Quando a janela já alcança o início do
 * período, o que falta de mais antigo não interfere.
 */
export function isPeriodCoveredByWindow(
  messages: { created_at?: string }[],
  days: number | null,
  hasOlderMessages = false,
  now = Date.now(),
): boolean {
  if (days === null) return false;
  if (messages.length === 0 || hasOlderMessages) {
    let oldest = Number.POSITIVE_INFINITY;
    for (const message of messages) {
      const timestamp = message.created_at ? Date.parse(message.created_at) : Number.NaN;
      if (!Number.isNaN(timestamp) && timestamp < oldest) oldest = timestamp;
    }
    if (!Number.isFinite(oldest)) return false;
    return oldest <= now - days * 86_400_000;
  }
  return true;
}

export const statusConfig: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  resolvido: { label: 'Resolvido', icon: CheckCircle2, className: 'bg-success/20 text-success border-success/30' },
  pendente: { label: 'Pendente', icon: Clock, className: 'bg-warning/20 text-warning border-warning/30' },
  aguardando_cliente: { label: 'Aguardando Cliente', icon: AlertCircle, className: 'bg-warning/20 text-warning border-warning/30' },
  aguardando_atendente: { label: 'Aguardando Atendente', icon: AlertCircle, className: 'bg-info/20 text-info border-info/30' },
  escalado: { label: 'Escalado', icon: AlertTriangle, className: 'bg-destructive/20 text-destructive border-destructive/30' },
};

export const sentimentConfig: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  positivo: { label: 'Positivo', icon: ThumbsUp, color: 'text-success', bg: 'bg-success' },
  neutro: { label: 'Neutro', icon: Minus, color: 'text-muted-foreground', bg: 'bg-muted' },
  negativo: { label: 'Negativo', icon: ThumbsDown, color: 'text-destructive', bg: 'bg-destructive' },
  critico: { label: 'Crítico', icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive' },
};

export const urgencyConfig: Record<string, { label: string; className: string }> = {
  baixa: { label: 'Baixa', className: 'bg-success/20 text-success' },
  media: { label: 'Média', className: 'bg-warning/20 text-warning' },
  alta: { label: 'Alta', className: 'bg-destructive/20 text-destructive' },
  critica: { label: 'Crítica', className: 'bg-destructive/30 text-destructive animate-pulse' },
};

export const departmentConfig: Record<string, { label: string; emoji: string; color: string }> = {
  vendas: { label: 'Vendas', emoji: '🛒', color: 'bg-primary/20 text-primary border-primary/30' },
  compras: { label: 'Compras', emoji: '📦', color: 'bg-warning/20 text-warning border-warning/30' },
  logistica: { label: 'Logística', emoji: '🚛', color: 'bg-success/20 text-success border-success/30' },
  rh: { label: 'RH', emoji: '👥', color: 'bg-accent/40 text-accent-foreground border-accent/30' },
  financeiro: { label: 'Financeiro', emoji: '💰', color: 'bg-warning/20 text-warning border-warning/30' },
  sac: { label: 'SAC', emoji: '🎧', color: 'bg-destructive/20 text-destructive border-destructive/30' },
  outros: { label: 'Outros', emoji: '📋', color: 'bg-muted/40 text-muted-foreground border-border' },
};

export const churnConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  low: { label: 'Baixo', color: 'text-success', icon: CheckCircle2 },
  medium: { label: 'Médio', color: 'text-warning', icon: AlertCircle },
  high: { label: 'Alto', color: 'text-destructive', icon: ShieldAlert },
};

export const performanceLabels: Record<string, { label: string; icon: React.ElementType }> = {
  empathy: { label: 'Empatia', icon: Heart },
  clarity: { label: 'Clareza', icon: Eye },
  efficiency: { label: 'Eficiência', icon: Zap },
  knowledge: { label: 'Conhecimento', icon: BookOpen },
};
