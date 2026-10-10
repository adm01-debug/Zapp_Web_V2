// Regra de autorização da reatribuição de conversa do copiloto de voz.
//
// Lacuna L4 da matriz docs/ia/IA-004-matriz-autorizacao.md (caso de aceite N19):
// o ramo `assign_conversation` de supabase/functions/voice-copilot-action/index.ts
// checava VISIBILIDADE do contato (RLS real do caller), mas não o PAPEL. Como a
// escrita roda com `service_role` (bypassa a RLS de `contacts`), um `agent` que
// apenas enxergasse o contato reatribuía a conversa para qualquer colega ativo —
// inclusive movendo a carteira de outro agente.
//
// Decisão do plano (N19 — "a reatribuição por agent de contato visível deve ser
// decisão explícita"): um agente pode REIVINDICAR a conversa para si; reatribuir
// para OUTRA pessoa exige admin/supervisor. A regra vive aqui, em função pura,
// para ser testada sem subir o handler.

/** Papéis que podem reatribuir uma conversa para outra pessoa. */
export const REASSIGN_ALLOWED_ROLES = ['admin', 'supervisor'] as const;

/** Mensagem única de recusa — o handler devolve `success: false` com este texto. */
export const REASSIGN_DENIED_MESSAGE =
  'Sem permissão para reatribuir conversa para outro agente.';

export type ReassignConversationDecision =
  | { allowed: true; mode: 'admin' | 'self' }
  | { allowed: false; reason: 'agent_not_found' | 'caller_without_profile' | 'reassign_requires_admin' };

export interface ReassignConversationInput {
  /** profile.id do agente de destino (resolvido pelo nome no handler). */
  targetProfileId: string | null | undefined;
  /** profile.id do chamador (nunca vem do body: resolvido por user_id do JWT). */
  callerProfileId: string | null | undefined;
  /** papéis do chamador em public.user_roles; ausente/`null` = nenhum papel. */
  callerRoles: readonly string[] | null | undefined;
}

export function isReassignManager(roles: readonly string[] | null | undefined): boolean {
  return (roles ?? []).some((role) => (REASSIGN_ALLOWED_ROLES as readonly string[]).includes(role));
}

export function decideReassignConversation(
  input: ReassignConversationInput,
): ReassignConversationDecision {
  const target = input.targetProfileId ?? null;
  const caller = input.callerProfileId ?? null;

  if (!target) return { allowed: false, reason: 'agent_not_found' };
  // Sem perfil associado o chamador não é staff do app: nega em vez de assumir papel.
  if (!caller) return { allowed: false, reason: 'caller_without_profile' };
  if (isReassignManager(input.callerRoles)) return { allowed: true, mode: 'admin' };
  // Reivindicar a própria conversa continua permitido para qualquer agente.
  if (target === caller) return { allowed: true, mode: 'self' };

  return { allowed: false, reason: 'reassign_requires_admin' };
}
