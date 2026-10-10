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
 * V25 — cada objetivo carrega um ícone. Os campos são aditivos: `TalkXOverview`
 * e `TalkXSegments` continuam lendo só `value`/`label`.
 * X124 — a descrição curta é o texto que o select do passo 1 mostra sob o
 * rótulo e que a revisão exibe na linha "Objetivo" (T09-012: "Vendas ·
 * Gerar mais vendas e conversões").
 */
export const OBJECTIVES: { value: string; label: string; icon: LucideIcon; description: string }[] = [
  { value: 'vendas', label: 'Vendas', icon: BadgeDollarSign, description: 'Gerar mais vendas e conversões' },
  { value: 'engajamento', label: 'Engajamento', icon: MousePointerClick, description: 'Aumentar interação e respostas dos contatos' },
  { value: 'reativacao', label: 'Reativação', icon: RefreshCw, description: 'Trazer de volta clientes inativos' },
  { value: 'relacionamento', label: 'Relacionamento', icon: Users, description: 'Fortalecer o relacionamento com a base' },
  { value: 'pesquisa', label: 'Pesquisa', icon: Search, description: 'Coletar opiniões e feedbacks' },
  { value: 'institucional', label: 'Institucional', icon: Building2, description: 'Comunicar avisos e novidades da empresa' },
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

export const VARIABLE_KEYS = ['{{nome}}', '{{nome_completo}}', '{{apelido}}', '{{empresa}}', '{{saudacao}}', '{{vendedor}}', '{{data_atual}}', '{{link}}'] as const;

/**
 * X128 — as demais variáveis do passo 2 ficam em "Mais variáveis" (mock 08).
 * Moram aqui (módulo de constantes, sem mock nos testes de tela) para o
 * wizard importar sem passar pelo módulo do hook.
 */
export const MORE_VARIABLES = [
  { key: '{{nome_completo}}', label: 'Nome Completo', desc: 'Insere o nome completo do contato' },
  { key: '{{apelido}}', label: 'Apelido', desc: 'Usa apelido se disponível, senão primeiro nome' },
];

/**
 * X128 — limite do corpo da mensagem. É o mesmo teto que a RPC de rascunho/
 * lançamento aplica (`length(v_message_template) > 4096` recusa): passar daqui
 * só produziria um erro no fim do wizard.
 */
export const MESSAGE_LIMIT = 4096;

/**
 * A15 — Canal. O motor do Talk X envia só por WhatsApp, então o canal real é um
 * só: a coluna e o filtro existem com esse valor (campanha por e-mail não faz
 * parte do plano). Fonte das opções do select "Todos os canais" da Visão geral.
 */
export const TALKX_CHANNELS: { value: string; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
];
