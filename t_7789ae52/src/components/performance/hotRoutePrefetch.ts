/**
 * Mapa e política do prefetch das views quentes — E35.
 *
 * Separado do componente `HotRoutePrefetcher` de propósito: um arquivo que
 * exporta componente E constantes quebra `react-refresh/only-export-components`
 * (as constantes ficariam fora do fast refresh). Aqui só vivem dados e funções.
 *
 * Ver `docs/audits/prefetch-views-quentes-2026-10-03.md`.
 */

export type ViewLoaders = Record<string, () => Promise<unknown>>;

/**
 * Imports dinâmicos das views quentes — as telas que o operador quase sempre abre
 * em seguida. Manter em sincronia com `src/pages/lazyViews.ts` / `ViewRouter`.
 *
 * Ids vêm da navegação primária (`NavigationService.getPrimaryNav()`): `inbox`
 * (label "Chat"), `team-chat` (Teams) e `email-chat` (Email). O `ChatPanel` é o
 * painel de conversa que a tela inicial monta assim que uma conversa abre.
 */
export const HOT_VIEWS: ViewLoaders = {
  chatPanel: () => import('@/components/inbox/ChatPanel'),
  inbox: () => import('@/components/inbox/RealtimeInboxView').then((m) => ({ default: m.RealtimeInboxView })),
  teamChat: () => import('@/components/team-chat/TeamChatView').then((m) => ({ default: m.TeamChatView })),
  emailChat: () => import('@/components/email/EmailChatInbox').then((m) => ({ default: m.EmailChatInbox })),
  dashboard: () => import('@/components/dashboard/DashboardView').then((m) => ({ default: m.DashboardView })),
};

/** Intervalo entre chunks: evita monopolizar rede e thread principal. */
export const PAUSA_ENTRE_CHUNKS_MS = 150;

/** Não vale gastar banda de quem está em conexão lenta ou economizando dados. */
export function shouldSkipPrefetch(): boolean {
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean };
  };
  const conn = nav.connection;
  if (!conn) return false;
  return Boolean(conn.saveData) || conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g';
}
