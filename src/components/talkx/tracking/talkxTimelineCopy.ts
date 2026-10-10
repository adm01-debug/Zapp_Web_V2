import type { LucideIcon } from 'lucide-react';
import {
  Activity, AlertTriangle, Ban, CalendarClock, CheckCircle2, ClipboardCheck, FileText, Link2,
  ListChecks, MessageSquare, Pause, Pencil, Play, RotateCw, Send, Settings2, ShieldOff, Sparkles,
  Square, StickyNote, TrendingUp, Upload, UserMinus, UserPlus,
} from 'lucide-react';
import { formatBRL, truncate } from '@/lib/formatters';
import type { TalkXEventType } from '@/hooks/integrations/useTalkXEvents';
import type { TalkXTimelineItem } from '@/hooks/integrations/useTalkXCampaignTimeline';

/**
 * X152 — mapa tipo → ícone, cor, título e frase da "Linha do tempo operacional".
 *
 * O Monitor mostrava o tipo cru do banco quando o evento não tinha mensagem
 * ("resumed") e despejava o JSON de `limits_updated` na tela. Aqui todo tipo que o
 * servidor grava tem título em português; o detalhe da frase só aparece com dado
 * legível — texto que começa com `{` ou `[` (JSON de configuração) NUNCA vai para a
 * tela, e chave desconhecida é ignorada em vez de virar `{"before":...}`.
 *
 * As cores são só as que o sistema já tem (primary/dash-green/dash-amber/dash-red/
 * dash-violet/foreground-secondary).
 */

export interface TalkXTimelineCopy {
  /** Título em português — nunca o tipo cru do banco. */
  title: string;
  icon: LucideIcon;
  /** Classe de cor de um token existente. */
  tone: string;
  /** Detalhe da frase; nulo quando o item não traz dado para mostrar. */
  detail?: (item: TalkXTimelineItem) => string | null;
}

/** Texto que o servidor grava como JSON de configuração (limits, investimento) nunca vai cru para a tela. */
export function isMachineText(text: string | null | undefined): boolean {
  const value = (text ?? '').trim();
  return value.startsWith('{') || value.startsWith('[');
}

/** Mensagem legível do evento — nula quando não há texto ou quando o texto é JSON. */
export function readableMessage(text: string | null | undefined): string | null {
  if (isMachineText(text)) return null;
  const value = (text ?? '').trim();
  return value.length > 0 ? value : null;
}

/* ---------------------------------------------------------------- */
/* Limites alterados (limits_updated) — o servidor grava {before, after} */
/* ---------------------------------------------------------------- */

/** Rótulos dos campos que a RPC `update_talkx_campaign_limits` devolve. */
const LIMIT_FIELD_LABELS: Record<string, string> = {
  speed_profile: 'Perfil de velocidade',
  send_interval_min: 'Intervalo mínimo entre envios (s)',
  send_interval_max: 'Intervalo máximo entre envios (s)',
  typing_delay_min: 'Digitação mínima (s)',
  typing_delay_max: 'Digitação máxima (s)',
  max_per_minute: 'Limite por minuto',
  send_window_start: 'Início da janela',
  send_window_end: 'Fim da janela',
  business_hours_only: 'Só horário comercial',
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  return String(value);
}

/**
 * "Limite por minuto: 30 → 60 · Só horário comercial: Não → Sim".
 * Campo desconhecido é ignorado (nunca mostra a chave crua) e, sem nenhuma
 * diferença legível, o item fica só com o título.
 */
export function describeLimitsChange(message: string | null | undefined): string | null {
  if (!isMachineText(message)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse((message ?? '').trim());
  } catch {
    return null;
  }
  const root = asRecord(parsed);
  const before = asRecord(root.before);
  const after = asRecord(root.after);
  const parts: string[] = [];
  for (const [key, label] of Object.entries(LIMIT_FIELD_LABELS)) {
    if (!(key in after)) continue;
    if (formatFieldValue(before[key]) === formatFieldValue(after[key])) continue;
    parts.push(`${label}: ${formatFieldValue(before[key])} → ${formatFieldValue(after[key])}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

/* ---------------------------------------------------------------- */
/* Detalhes que dependem do contato (item por destinatário, X141)     */
/* ---------------------------------------------------------------- */

function contactSentence(item: TalkXTimelineItem, phrase: (name: string, phone: string | null) => string): string | null {
  const name = item.contactName?.trim();
  if (!name) return readableMessage(item.message);
  return phrase(name, item.contactPhone?.trim() || null);
}

/* ---------------------------------------------------------------- */
/* Mapa tipo → título, ícone e cor                                    */
/* ---------------------------------------------------------------- */

const TIMELINE_COPY_DO_CICLO: Record<TalkXEventType, TalkXTimelineCopy> = {
  created: { title: 'Campanha criada', icon: Sparkles, tone: 'text-primary', detail: (i) => readableMessage(i.message) },
  updated: { title: 'Campanha editada', icon: Pencil, tone: 'text-foreground-secondary', detail: (i) => readableMessage(i.message) },
  scheduled: { title: 'Campanha agendada', icon: CalendarClock, tone: 'text-dash-violet', detail: (i) => readableMessage(i.message) },
  scheduled_updated: { title: 'Agendamento alterado', icon: CalendarClock, tone: 'text-dash-violet', detail: (i) => readableMessage(i.message) },
  started: { title: 'Campanha iniciada', icon: Play, tone: 'text-dash-green' },
  paused: {
    title: 'Campanha pausada',
    icon: Pause,
    tone: 'text-dash-amber',
    detail: (i) => { const motivo = readableMessage(i.message); return motivo ? `Motivo: ${motivo}` : null; },
  },
  resumed: { title: 'Retomada após pausa', icon: Play, tone: 'text-dash-green' },
  resumed_auto: { title: 'Retomada automática', icon: RotateCw, tone: 'text-dash-green', detail: (i) => readableMessage(i.message) },
  cancelled: { title: 'Campanha cancelada', icon: Square, tone: 'text-dash-red' },
  completed: { title: 'Campanha concluída', icon: CheckCircle2, tone: 'text-dash-green', detail: (i) => readableMessage(i.message) },
  note: { title: 'Observação', icon: StickyNote, tone: 'text-foreground-secondary', detail: (i) => readableMessage(i.message) },
  limits_updated: { title: 'Limites alterados', icon: Settings2, tone: 'text-dash-amber', detail: (i) => describeLimitsChange(i.message) },
  connection_failed: { title: 'Falha de conexão', icon: AlertTriangle, tone: 'text-dash-red', detail: (i) => readableMessage(i.message) },
  skipped_suppressed: { title: 'Contatos suprimidos pulados', icon: ShieldOff, tone: 'text-dash-amber', detail: (i) => readableMessage(i.message) },
  suppression_add: { title: 'Contato suprimido', icon: UserMinus, tone: 'text-dash-amber', detail: (i) => readableMessage(i.message) },
  suppression_remove: { title: 'Contato liberado da supressão', icon: UserPlus, tone: 'text-dash-green', detail: (i) => readableMessage(i.message) },
  suppression_update: { title: 'Supressão alterada', icon: Pencil, tone: 'text-dash-amber', detail: (i) => readableMessage(i.message) },
  segments_reviewed: { title: 'Segmentos revisados', icon: ListChecks, tone: 'text-primary', detail: (i) => readableMessage(i.message) },
  checklist: { title: 'Checklist de lançamento', icon: ClipboardCheck, tone: 'text-primary', detail: (i) => readableMessage(i.message) },
};

/**
 * Tipos que o CHECK do banco já aceita mas a união `TalkXEventType` do front ainda
 * não lista (X021: links, investimento, relatório, importação) — sem uma entrada aqui,
 * um evento desses sairia como "Atualização da campanha" em vez do título próprio.
 * Também os itens POR DESTINATÁRIO (enviada, respondida, opt-out), que trazem contato
 * quando a leitura por destinatário (X141) entrar.
 */
const TIMELINE_COPY_FORA_DO_CICLO: Record<string, TalkXTimelineCopy> = {
  link_created: { title: 'Link de rastreio criado', icon: Link2, tone: 'text-primary', detail: (i) => readableMessage(i.message) },
  link_updated: { title: 'Link de rastreio editado', icon: Link2, tone: 'text-foreground-secondary', detail: (i) => readableMessage(i.message) },
  link_deleted: { title: 'Link de rastreio removido', icon: Link2, tone: 'text-dash-red', detail: (i) => readableMessage(i.message) },
  investment_updated: {
    title: 'Investimento atualizado',
    icon: TrendingUp,
    tone: 'text-dash-green',
    detail: (i) => {
      const raw = (i.message ?? '').trim();
      const value = Number(raw.replace(',', '.'));
      if (raw && Number.isFinite(value)) return `Valor: ${formatBRL(value)}`;
      return readableMessage(i.message);
    },
  },
  report_exported: { title: 'Relatório gerado', icon: FileText, tone: 'text-foreground-secondary', detail: (i) => readableMessage(i.message) },
  report_shared: { title: 'Relatório compartilhado', icon: Send, tone: 'text-primary', detail: (i) => readableMessage(i.message) },
  import_created: { title: 'Importação iniciada', icon: Upload, tone: 'text-primary', detail: (i) => readableMessage(i.message) },
  import_completed: { title: 'Importação concluída', icon: CheckCircle2, tone: 'text-dash-green', detail: (i) => readableMessage(i.message) },
};

/** Tipo fora do mapa: título neutro + a mensagem legível, nunca o tipo cru. */
const TIMELINE_COPY_PADRAO: TalkXTimelineCopy = {
  title: 'Atualização da campanha',
  icon: Activity,
  tone: 'text-foreground-secondary',
  detail: (i) => readableMessage(i.message),
};

const TIMELINE_COPY: Record<string, TalkXTimelineCopy> = { ...TIMELINE_COPY_FORA_DO_CICLO, ...TIMELINE_COPY_DO_CICLO };

/** Rótulo do tipo (usado no filtro do painel "Ver todos"). */
export function timelineKindLabel(kind: string): string {
  return (TIMELINE_COPY[kind] ?? TIMELINE_COPY_PADRAO).title;
}

/** Opções do filtro por tipo, em ordem alfabética de título. */
export function timelineKindOptions(): { value: string; label: string }[] {
  return Object.keys(TIMELINE_COPY)
    .map((value) => ({ value, label: TIMELINE_COPY[value].title }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

export interface TalkXTimelineDescription {
  title: string;
  /** Detalhe da frase, sem o ator. */
  detail: string | null;
  /** Frase completa: "Título — detalhe". */
  phrase: string;
  icon: LucideIcon;
  tone: string;
}

/**
 * Traduz o item do servidor em título, detalhe e frase. O ator (quando o servidor
 * gravou) entra no fim da frase — "Retomada após pausa — por Ana" —, e um evento sem
 * ator fica só com o próprio texto.
 */
export function describeTimelineEvent(item: TalkXTimelineItem): TalkXTimelineDescription {
  const copy = TIMELINE_COPY[item.kind] ?? TIMELINE_COPY_PADRAO;
  const specific = copy.detail ? copy.detail(item) : readableMessage(item.message);
  const actor = item.actorName?.trim();
  const detail = [specific, actor ? `por ${actor}` : null].filter(Boolean).join(' · ') || null;
  return {
    title: copy.title,
    detail,
    phrase: detail ? `${copy.title} — ${detail}` : copy.title,
    icon: copy.icon,
    tone: copy.tone,
  };
}
