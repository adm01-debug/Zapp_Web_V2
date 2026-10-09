import type { LucideIcon } from 'lucide-react';
import { BadgeDollarSign, MousePointerClick, RefreshCw, Users, Search, Building2 } from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Tipos                                                              */
/* ------------------------------------------------------------------ */

export type PillTone = 'success' | 'danger' | 'warning' | 'info' | 'violet' | 'muted';
export type TileColor = 'blue' | 'red' | 'green' | 'violet' | 'amber';

export const CAMPAIGN_STATUS: Record<string, { label: string; tone: PillTone }> = {
  draft: { label: 'Rascunho', tone: 'muted' },
  scheduled: { label: 'Agendada', tone: 'violet' },
  sending: { label: 'Em andamento', tone: 'info' },
  paused: { label: 'Pausada', tone: 'warning' },
  completed: { label: 'Concluída', tone: 'success' },
  cancelled: { label: 'Cancelada', tone: 'danger' },
};

export const RECIPIENT_STATUS: Record<string, { label: string; tone: PillTone }> = {
  pending: { label: 'Na fila', tone: 'muted' },
  sending: { label: 'Enviando', tone: 'info' },
  sent: { label: 'Enviada', tone: 'info' },
  delivered: { label: 'Entregue', tone: 'success' },
  failed: { label: 'Falha', tone: 'danger' },
  outcome_unknown: { label: 'Confirmação pendente', tone: 'warning' },
  skipped: { label: 'Suprimido', tone: 'muted' },
  cancelled: { label: 'Cancelado', tone: 'muted' },
};

/**
 * V25 — cada objetivo carrega um ícone. O campo é aditivo: `TalkXOverview`,
 * `TalkXSegments` e `TalkXWizardDelivery` continuam lendo só `value`/`label`.
 */
/**
 * X124/X134 — cada objetivo tem uma descrição fixa do próprio objetivo (mock
 * 09: "Vendas · Gerar mais vendas e conversões"), usada no resumo da revisão.
 */
export const OBJECTIVES: { value: string; label: string; description: string; icon: LucideIcon }[] = [
  { value: 'vendas', label: 'Vendas', description: 'Gerar mais vendas e conversões', icon: BadgeDollarSign },
  { value: 'engajamento', label: 'Engajamento', description: 'Aumentar interação e cliques', icon: MousePointerClick },
  { value: 'reativacao', label: 'Reativação', description: 'Trazer de volta clientes inativos', icon: RefreshCw },
  { value: 'relacionamento', label: 'Relacionamento', description: 'Manter o contato próximo com os clientes', icon: Users },
  { value: 'pesquisa', label: 'Pesquisa', description: 'Coletar opiniões e feedbacks dos clientes', icon: Search },
  { value: 'institucional', label: 'Institucional', description: 'Divulgar avisos e novidades da empresa', icon: Building2 },
];

/** Perfis de velocidade → intervalo entre envios (segundos). Digitação fica com o editor. */
export const SPEED_PROFILES = [
  { value: 'slow', label: 'Lenta (mais segura)', interval: [15, 30] as [number, number] },
  { value: 'moderate', label: 'Moderada (recomendado)', interval: [8, 20] as [number, number] },
  { value: 'fast', label: 'Rápida', interval: [3, 8] as [number, number] },
] as const;

export const SUPPRESSION_ORIGIN: Record<string, { label: string; tone: PillTone }> = {
  manual: { label: 'Bloqueio manual', tone: 'warning' },
  optout: { label: 'Opt-out solicitado', tone: 'danger' },
  system: { label: 'Número inválido', tone: 'muted' },
  lgpd: { label: 'LGPD', tone: 'violet' },
  list: { label: 'Sem permissão comercial', tone: 'info' },
  auto_optout: { label: 'Opt-out automático', tone: 'danger' },
};

export const TEMPLATE_CATEGORIES = [
  'boas-vindas', 'vendas', 'promocao', 'follow-up', 'pos-venda', 'reativacao', 'catalogo', 'sazonal', 'financeiro', 'geral',
] as const;

export const TEMPLATE_STATUS: Record<string, { label: string; tone: PillTone }> = {
  draft: { label: 'Rascunho', tone: 'muted' },
  review: { label: 'Em revisão', tone: 'warning' },
  approved: { label: 'Aprovado', tone: 'success' },
};

export const VARIABLE_KEYS = ['{{nome}}', '{{nome_completo}}', '{{apelido}}', '{{empresa}}', '{{saudacao}}'] as const;

/**
 * A15 — Canal. O motor do Talk X envia só por WhatsApp, então o canal real é um
 * só: a coluna e o filtro existem com esse valor (campanha por e-mail não faz
 * parte do plano). Fonte das opções do select "Todos os canais" da Visão geral.
 */
export const TALKX_CHANNELS: { value: string; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
];
