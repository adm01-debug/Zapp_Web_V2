// Máquina de estados pura — sem efeito colateral, sem dependência de React/Supabase.
// Importado tanto pelo frontend (validação otimista) quanto pelos testes unitários.

import { WIP_LIMITS, type WorkItem, type WorkItemStatus, type TransitionBlockReason } from './workItem.types';

interface TransitionCtx {
  doingCount: number;     // quantos itens estão em 'doing' ANTES desta transição
  waitingReason?: string; // motivo fornecido pelo usuário (obrigatório para waiting)
}

/** Máquina de transição. Retorna {ok:true} ou {ok:false, reason}. */
export function canTransition(
  from: WorkItemStatus,
  to: WorkItemStatus,
  ctx: TransitionCtx,
): TransitionResult {
  // done → só pode reabrir para 'todo'
  if (from === 'done') {
    if (to === 'todo') return { ok: true };
    return { ok: false, reason: 'invalid_transition' };
  }

  // cancelled → sem transições (arquivo morto)
  if (from === 'cancelled') {
    return { ok: false, reason: 'invalid_transition' };
  }

  // transições proibidas explícitas
  if (to === 'backlog' && from !== 'backlog') {
    // voltar para backlog só permitido de todo/waiting
    if (!['todo', 'waiting'].includes(from)) {
      return { ok: false, reason: 'invalid_transition' };
    }
  }

  // WIP hard em 'doing'
  if (to === 'doing' && from !== 'doing') {
    const limit = WIP_LIMITS.doing.hard;
    if (limit !== null && ctx.doingCount >= limit) {
      return { ok: false, reason: 'wip_full' };
    }
  }

  // Waiting exige motivo
  if (to === 'waiting' && !ctx.waitingReason?.trim()) {
    return { ok: false, reason: 'waiting_reason_required' };
  }

  return { ok: true };
}

/** Aplica a transição num WorkItem imutavelmente (update otimista). */
export function applyTransition(
  item: WorkItem,
  to: WorkItemStatus,
  now: Date = new Date(),
): WorkItem {
  const nowIso = now.toISOString();
  const patch: Partial<WorkItem> = {
    status: to,
    status_changed_at: nowIso,
  };

  if (to === 'doing' && item.started_at === null) {
    patch.started_at = nowIso;
  }

  if (to === 'done' || to === 'cancelled') {
    patch.completed_at = item.completed_at ?? nowIso;
    patch.remind_at = null;
    patch.notified_at = null;
  }

  if (to !== 'waiting') {
    patch.waiting_reason = null;
  }

  // reabrir: limpar completed_at
  if (item.status === 'done' && to === 'todo') {
    patch.completed_at = null;
  }

  return { ...item, ...patch };
}

/** Conta itens em 'doing' numa lista (helper para o frontend). */
export function countDoing(items: Pick<WorkItem, 'status'>[]): number {
  return items.filter((i) => i.status === 'doing').length;
}

/** Dias que o item está na coluna atual (para envelhecimento visual). */
export function agingDays(item: WorkItem, now: Date = new Date()): number {
  const changed = new Date(item.status_changed_at);
  return Math.floor((now.getTime() - changed.getTime()) / 86_400_000);
}
