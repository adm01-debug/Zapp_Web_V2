/**
 * X055 — prancha de referência do Talk X: estado forçado por URL.
 *
 * `?talkxState=<empty|loading|error|crm|wa|perm>` só vale com a prancha
 * habilitada (`import.meta.env.DEV` ou `VITE_TALKX_KIT=1`). Fora daí todas as
 * funções devolvem `null`/`false` e nenhuma tela muda de comportamento — é o
 * que mantém o pacote de produção igual ao de hoje.
 */

export const TALKX_FORCED_STATES = ['empty', 'loading', 'error', 'crm', 'wa', 'perm'] as const;

export type TalkXForcedState = (typeof TALKX_FORCED_STATES)[number];

/** Id da view da prancha (`?view=talkx-kit`). Não entra no menu do app. */
export const TALKX_KIT_VIEW_ID = 'talkx-kit';

/** Ambiente mínimo lido pela trava (permite provar o modo produção no teste). */
export interface TalkXKitEnv {
  DEV?: boolean;
  VITE_TALKX_KIT?: string;
}

/**
 * Título que cada estado forçado mostra — é a MESMA frase que a tela real
 * exibe (`StateShell`/`TalkXErrorState`); a prancha não inventa texto.
 */
export const TALKX_FORCED_STATE_TITLES: Record<TalkXForcedState, string> = {
  empty: 'Nenhuma campanha encontrada',
  loading: 'Carregando (Skeleton)',
  error: 'Não foi possível carregar as campanhas',
  crm: 'CRM 360 indisponível',
  wa: 'Conexão WhatsApp desconectada',
  perm: 'Você não tem permissão para acessar Campanhas',
};

export function isTalkXForcedState(raw: string | null | undefined): raw is TalkXForcedState {
  return typeof raw === 'string' && TALKX_FORCED_STATES.some((estado) => estado === raw);
}

/** Valor de `?talkxState=` válido, ou `null` (qualquer outro valor é ignorado). */
export function parseTalkXForcedState(raw: string | null | undefined): TalkXForcedState | null {
  return isTalkXForcedState(raw) ? raw : null;
}

/** A prancha (e o estado forçado) só existem em DEV ou com `VITE_TALKX_KIT=1`. */
export function isTalkXKitEnabled(env: TalkXKitEnv = import.meta.env as TalkXKitEnv): boolean {
  return env.DEV === true || env.VITE_TALKX_KIT === '1';
}

function currentSearch(): string {
  return typeof window === 'undefined' ? '' : window.location.search;
}

/**
 * Estado forçado ativo agora: `null` quando a trava está fechada, quando não há
 * `?talkxState=` na URL ou quando o valor não é um dos seis previstos.
 */
export function currentTalkXForcedState(
  search: string = currentSearch(),
  env: TalkXKitEnv = import.meta.env as TalkXKitEnv,
): TalkXForcedState | null {
  if (!isTalkXKitEnabled(env)) return null;
  return parseTalkXForcedState(new URLSearchParams(search).get('talkxState'));
}

/** A URL pede a prancha (`?view=talkx-kit`), sob a mesma trava. */
export function isTalkXKitUrl(
  search: string = currentSearch(),
  env: TalkXKitEnv = import.meta.env as TalkXKitEnv,
): boolean {
  if (!isTalkXKitEnabled(env)) return false;
  return new URLSearchParams(search).get('view') === TALKX_KIT_VIEW_ID;
}
