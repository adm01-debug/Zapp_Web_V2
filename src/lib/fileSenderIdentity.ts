/**
 * Quem enviou cada arquivo da aba Arquivos (R01 — cartao de arquivo igual ao mockup).
 *
 * Funcao PURA: recebe o item de midia, o usuario logado, o contato e o mapa de perfis
 * (carregado em lote por `useMediaSenderProfiles`) e devolve como a UI deve apresentar o
 * autor — tipo, nome e foto. Nao fala com o Supabase, nao lanca: dado ausente cai em
 * fallback legivel ("Equipe"/"Atendente"/iniciais) em vez de quebrar o cartao.
 *
 * `messages.agent_id` e FK para `profiles.id` (nao para o id de auth): por isso o valor
 * de `currentUserId` que a UI passa e o `profile.id` da sessao (o mesmo id que
 * `useContactMedia` entrega em `item.agentId`).
 */
import { getAvatarColor, getInitials } from '@/lib/avatar-colors';

export type SenderKind = 'self' | 'agent' | 'contact' | 'team';

/** Nomes fixos desta resolucao (exportados para a UI e os testes nao repetirem o literal). */
export const SELF_SENDER_NAME = 'Você';
export const TEAM_SENDER_NAME = 'Equipe';
/** Fallback do contato quando o cadastro nao trouxe nome. */
export const CONTACT_SENDER_FALLBACK = 'Contato';
/** Fallback do atendente quando o perfil nao veio (RLS, perfil apagado) — mesmo rotulo do
 * `AGENT_SENDER_LABEL` de `useContactMedia`; aqui e o NOME do autor, la o rotulo do cartao. */
export const AGENT_SENDER_FALLBACK = 'Atendente';

/** So o que a identidade precisa de `messages` — evita acoplar a regra ao item inteiro. */
export interface SenderIdentityItem {
  sender: string | null;
  /** `ContactMediaItem.agentId`: opcional no item (ver comentario la), preenchido pelo hook. */
  agentId?: string | null;
}

/** `profiles` (id, name, nickname, avatar_url). */
export interface SenderProfile {
  id?: string | null;
  name?: string | null;
  nickname?: string | null;
  avatar_url?: string | null;
}

/** `contacts` (name, avatar_url). */
export interface SenderContact {
  name?: string | null;
  avatar_url?: string | null;
}

/** Perfis por `profiles.id`; id ausente = perfil nao carregado (cai no fallback). */
export type SenderProfileMap = Record<string, SenderProfile | undefined>;

export interface SenderIdentity {
  kind: SenderKind;
  name: string;
  avatarUrl: string | null;
}

export interface ResolveSenderIdentityInput {
  item: SenderIdentityItem;
  /** `profile.id` do usuario logado (mesmo id que `messages.agent_id` guarda). */
  currentUserId?: string | null;
  contact?: SenderContact | null;
  profiles?: SenderProfileMap | null;
}

/** Foto do perfil quando existe (string nao vazia); senao `null`. */
function avatarOf(profile?: SenderProfile | null): string | null {
  return profile?.avatar_url?.trim() || null;
}

/** Nome do perfil: nome, senao apelido, senao "Atendente" (nunca vazio). */
export function senderProfileName(profile?: SenderProfile | null): string {
  return profile?.name?.trim() || profile?.nickname?.trim() || AGENT_SENDER_FALLBACK;
}

/**
 * Regras do plano (D01):
 * - `sender='contact'` → nome/foto do contato;
 * - `sender='agent'` com `agentId` = usuario logado → "Você" com a foto dele;
 * - `agentId` de OUTRO atendente → nome/foto do perfil (perfil ausente → "Atendente" sem foto);
 * - `sender='agent'` SEM `agentId` (celular/automacao) → identidade neutra "Equipe", sem foto.
 */
export function resolveSenderIdentity({
  item,
  currentUserId,
  contact,
  profiles,
}: ResolveSenderIdentityInput): SenderIdentity {
  const agentId = item.agentId?.trim() || null;
  const selfId = currentUserId?.trim() || null;

  if (item.sender === 'contact') {
    return {
      kind: 'contact',
      name: contact?.name?.trim() || CONTACT_SENDER_FALLBACK,
      avatarUrl: contact?.avatar_url?.trim() || null,
    };
  }

  if (agentId && selfId && agentId === selfId) {
    return { kind: 'self', name: SELF_SENDER_NAME, avatarUrl: avatarOf(profiles?.[agentId]) };
  }

  if (agentId) {
    const profile = profiles?.[agentId];
    return { kind: 'agent', name: senderProfileName(profile), avatarUrl: avatarOf(profile) };
  }

  return { kind: 'team', name: TEAM_SENDER_NAME, avatarUrl: null };
}

/** Iniciais para o avatar sem foto ("Joaquim Ataides" → "JA"); vazio quando nao ha nome. */
export function initialsOf(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed ? getInitials(trimmed) : '';
}

/**
 * Cor deterministica por PESSOA: o id (`profiles.id`) e estavel, entao a mesma pessoa
 * mantem a cor mesmo que mude o nome (D02). Usa a mesma paleta dos avatares do app.
 * Sem id, devolve a primeira cor da paleta — nunca lanca.
 */
export function stableColorOf(id: string | null | undefined): { bg: string; text: string } {
  return getAvatarColor(id?.trim() || '');
}
