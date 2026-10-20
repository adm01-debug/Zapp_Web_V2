/**
 * Quem agiu em cada episódio da aba Journey (S063 — foto, nome e cor).
 *
 * Recebe os `actorIds` dos eventos e o contato da conversa e devolve:
 * - `resolve(actor)`: como a tela desenha o autor daquele episódio (nome, foto, cor e iniciais);
 * - `people`: a lista de pessoas do filtro de usuários do J08 (`users: string[]` = `key`).
 *
 * Regras (plano do Journey, D03/D05 e a resposta do dono sobre a IA):
 * - usuário (atendente) → nome e foto do PERFIL, carregado em lote por R01
 *   (`fetchSenderProfiles`), reaproveitando a MESMA chave de cache de `useMediaSenderProfiles`:
 *   uma consulta por conjunto de ids, sem uma por cartão;
 * - usuário logado → "Você" (com a foto dele);
 * - contato → nome e `avatar_url` do contato da conversa;
 * - sistema (robô/IA/automação) → nome "Sistema", sem foto (o ícone é da tela);
 * - perfil ausente (apagado, RLS negado, consulta falhou) → "Atendente" com iniciais e sem foto.
 *   O nome do evento NÃO substitui o perfil para usuários: a interface não promete um nome que
 *   o cadastro não tem.
 *
 * Nada de canal/origem: o que sai daqui não tem campo de selo (decisão do dono, 07/10).
 */
import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { JourneyActor } from '@/lib/journey/model';
import {
  AGENT_SENDER_FALLBACK,
  SELF_SENDER_NAME,
  initialsOf,
  senderProfileName,
  stableColorOf,
  type SenderContact,
  type SenderProfileMap,
} from '@/lib/fileSenderIdentity';
import {
  fetchSenderProfiles,
  mediaSenderProfilesKey,
  normalizeSenderIds,
} from '@/hooks/chat/useMediaSenderProfiles';

/** Nome fixo de automação/robô/IA (resposta do dono, 07/10). */
export const SYSTEM_ACTOR_NAME = 'Sistema';
/** Nome do contato quando o cadastro não trouxe nome. */
export const CONTACT_ACTOR_NAME = 'Cliente';
/** Chaves do filtro de usuários do J08: cliente e sistema não têm id de perfil. */
export const CONTACT_ACTOR_KEY = 'contact';
export const SYSTEM_ACTOR_KEY = 'system';

/** `self` = o usuário logado ("Você"); `user` = outro atendente. */
export type JourneyActorViewKind = 'self' | 'user' | 'contact' | 'system';

/** Par de classes da paleta de avatares do sistema (`bg` + `text`). */
export interface JourneyActorColor {
  bg: string;
  text: string;
}

/** O que a tela (J11) precisa para desenhar quem agiu. Sem campo de canal/origem. */
export interface JourneyActorView {
  kind: JourneyActorViewKind;
  name: string;
  /** Foto redonda; `null` = a tela mostra as iniciais. */
  avatarUrl: string | null;
  color: JourneyActorColor;
  /** Iniciais do nome (para o avatar sem foto). */
  initials: string;
}

/** Uma pessoa do filtro: o mesmo desenho do cartão + a chave que o J08 filtra. */
export interface JourneyActorOption extends JourneyActorView {
  /** `profiles.id` do atendente, `contact` ou `system` — vocabulário do J08. */
  key: string;
}

export interface UseJourneyActorsOptions {
  /** `actor.id` dos eventos (nulos/vazios/duplicados são descartados). */
  actorIds: readonly (string | null | undefined)[] | null | undefined;
  /** Contato da conversa (`contacts`: name, avatar_url). */
  contact?: SenderContact | null;
  /** `profiles.id` da sessão — o mesmo id que os eventos guardam em `actor.id`. */
  currentUserId?: string | null;
}

export interface UseJourneyActorsState {
  /** Desenho do autor de um episódio. Ator ausente cai no "Atendente", nunca lança. */
  resolve: (actor: JourneyActor | null | undefined) => JourneyActorView;
  /** Lista do filtro de usuários: Você (se agiu), os outros atendentes, Cliente e Sistema. */
  people: JourneyActorOption[];
  /** Há consulta de perfis em voo (com ids para buscar). */
  isLoading: boolean;
}

/** Referência estável para o mapa sem perfis (não recria o objeto a cada render). */
const EMPTY_PROFILES: SenderProfileMap = {};

export function useJourneyActors({
  actorIds,
  contact = null,
  currentUserId = null,
}: UseJourneyActorsOptions): UseJourneyActorsState {
  const queryClient = useQueryClient();
  const ids = useMemo(() => normalizeSenderIds(actorIds), [actorIds]);
  const selfId = currentUserId?.trim() || null;

  const query = useQuery({
    // Mesma chave do lote do R01: as duas telas compartilham o cache.
    queryKey: mediaSenderProfilesKey(ids),
    queryFn: () => fetchSenderProfiles(queryClient, ids),
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
  });
  const profiles = query.data ?? EMPTY_PROFILES;

  /** Atendente pelo perfil em lote; sem perfil (ou sem id) cai no "Atendente" com iniciais. */
  const resolveUser = useCallback(
    (id: string | null): JourneyActorView => {
      const profile = id ? profiles[id] : undefined;
      const avatarUrl = profile?.avatar_url?.trim() || null;
      if (id && selfId && id === selfId) {
        return {
          kind: 'self',
          name: SELF_SENDER_NAME,
          avatarUrl,
          color: stableColorOf(id),
          initials: initialsOf(SELF_SENDER_NAME),
        };
      }
      const name = senderProfileName(profile);
      return {
        kind: 'user',
        name,
        avatarUrl,
        // Sem id não há pessoa estável para colorir: a cor vem da própria chave "Atendente".
        color: stableColorOf(id || AGENT_SENDER_FALLBACK),
        initials: initialsOf(name),
      };
    },
    [profiles, selfId],
  );

  const resolve = useCallback(
    (actor: JourneyActor | null | undefined): JourneyActorView => {
      if (actor?.kind === 'system') {
        return {
          kind: 'system',
          name: SYSTEM_ACTOR_NAME,
          avatarUrl: null,
          color: stableColorOf(SYSTEM_ACTOR_KEY),
          initials: initialsOf(SYSTEM_ACTOR_NAME),
        };
      }
      if (actor?.kind === 'contact') {
        const name = contact?.name?.trim() || actor.name?.trim() || CONTACT_ACTOR_NAME;
        const avatarUrl = contact?.avatar_url?.trim() || actor.avatarUrl?.trim() || null;
        return {
          kind: 'contact',
          name,
          avatarUrl,
          color: stableColorOf(actor.id?.trim() || name),
          initials: initialsOf(name),
        };
      }
      return resolveUser(actor?.id?.trim() || null);
    },
    [contact, resolveUser],
  );

  const people = useMemo<JourneyActorOption[]>(() => {
    // Mesmas regras do cartão: a lista e a timeline nunca divergem de nome/foto.
    const dosUsuarios = ids.map((id) => ({ ...resolveUser(id), key: id }));
    const eu = dosUsuarios.filter((pessoa) => pessoa.kind === 'self');
    const outros = dosUsuarios
      .filter((pessoa) => pessoa.kind !== 'self')
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || a.key.localeCompare(b.key));
    const cliente: JourneyActorOption = {
      ...resolve({ kind: 'contact', id: null, name: null, avatarUrl: null }),
      key: CONTACT_ACTOR_KEY,
    };
    const sistema: JourneyActorOption = {
      ...resolve({ kind: 'system', id: null, name: null, avatarUrl: null }),
      key: SYSTEM_ACTOR_KEY,
    };
    // "Você" primeiro, depois os outros atendentes por nome, e por fim as duas opções fixas
    // do filtro (o cliente e o sistema), que existem sempre — o hook só recebe ids de usuário.
    return [...eu, ...outros, cliente, sistema];
  }, [ids, resolve, resolveUser]);

  return { resolve, people, isLoading: ids.length > 0 && query.isLoading };
}
