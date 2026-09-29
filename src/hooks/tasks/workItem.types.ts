export type WorkItemStatus =
  | 'backlog'
  | 'todo'
  | 'doing'
  | 'waiting'
  | 'done'
  | 'cancelled';

export type Priority = 'low' | 'medium' | 'high' | 'urgent';

/**
 * Contato vinculado ao item (join da etapa 13).
 * Definido aqui — e nao no hook — para os testes puros do modulo nao dependerem
 * de React/Supabase.
 */
export interface WorkItemContact {
  id: string;
  name: string | null;
  phone: string | null;
  avatar_url: string | null;
}

export interface WorkItem {
  id: string;
  title: string;
  description: string | null;
  status: WorkItemStatus;
  priority: Priority;
  due_date: string | null;
  remind_at: string | null;
  notified_at: string | null;
  waiting_reason: string | null;
  position: number;
  started_at: string | null;
  status_changed_at: string;
  completed_at: string | null;
  contact_id: string | null;
  created_by: string;
  assigned_to: string;
  created_at: string;
  updated_at: string;
  /** Opcional de proposito: testes puros nao criam contato. */
  contact?: WorkItemContact | null;
}

export const KANBAN_COLUMNS: Array<{
  status: WorkItemStatus;
  label: string;
  shortLabel: string;
  policy: string;
}> = [
  { status: 'backlog', label: 'Caixa de entrada', shortLabel: 'Entrada',    policy: 'Tudo que voce capturou e ainda nao decidiu.' },
  { status: 'todo',    label: 'A fazer',           shortLabel: 'A fazer',   policy: 'Decidido: vai ser feito.' },
  { status: 'doing',   label: 'Fazendo',           shortLabel: 'Fazendo',   policy: 'O que esta nas suas maos agora. Tres e o limite.' },
  { status: 'waiting', label: 'Aguardando',        shortLabel: 'Aguardando',policy: 'Parou por causa de alguem ou algo. Escreva o motivo.' },
  { status: 'done',    label: 'Concluido',         shortLabel: 'Concluido', policy: 'Feito. Fica 7 dias a vista.' },
];

export const WIP_LIMITS: Record<WorkItemStatus, { hard: number | null; soft: number | null }> = {
  backlog:   { hard: null, soft: null },
  todo:      { hard: null, soft: 15 },
  doing:     { hard: 3,    soft: null },
  waiting:   { hard: null, soft: 5 },
  done:      { hard: null, soft: null },
  cancelled: { hard: null, soft: null },
};

export type TransitionBlockReason = 'wip_full' | 'waiting_reason_required' | 'invalid_transition';

export type TransitionResult =
  | { ok: true }
  | { ok: false; reason: TransitionBlockReason };
