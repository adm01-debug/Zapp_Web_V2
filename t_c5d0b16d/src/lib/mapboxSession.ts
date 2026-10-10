// Sessão de busca da Mapbox Search Box (`/suggest` + `/retrieve`). A Mapbox cobra por SESSÃO, não
// por request: até 50 `/suggest` + 1 `/retrieve` sob o mesmo `session_token` contam como 1 sessão,
// que expira após 2 min de inatividade. Este módulo só controla QUANDO trocar de token — quem
// dispara as chamadas HTTP é `mapboxGeocode.ts` (E06/E07). Estado em closure de módulo (não React):
// o picker some/volta e a sessão de busca precisa sobreviver a isso, na Fase 2.
import { clearSuggestCacheForSession } from '@/lib/mapboxGeocode';
import { logAudit } from '@/lib/audit';

const SESSION_IDLE_MS = 120_000;
const MAX_SUGGESTS_PER_SESSION = 50;

interface SessionState {
  token: string;
  lastActivityAt: number;
  suggestCount: number;
  retrieved: boolean;
  source: string;
  /** E100 · O evento de sessão já foi gravado? Ver `noteSessionUsage()`. */
  audited: boolean;
}

let session: SessionState | null = null;

export function newSessionToken(): string {
  return crypto.randomUUID();
}

function createSession(now: number, source: string): SessionState {
  // E100 · NÃO grava o evento aqui. A Mapbox cobra por sessão FATURADA ("até 50 `/suggest` + 1
  // `/retrieve` sob o mesmo token contam como 1 sessão"), e uma sessão que nunca disparou request
  // não é faturada. Gravar na abertura fazia `count_searchbox_sessions_this_month()` contar
  // intenção em vez de uso — e esse número é o que degrada o autocomplete em 450
  // (`mapboxCostGuard.ts`) e dispara o alerta de custo em 400 (E91). O evento é adiado para o
  // primeiro request real (`noteSessionUsage`).
  return {
    token: newSessionToken(),
    lastActivityAt: now,
    suggestCount: 0,
    retrieved: false,
    source,
    audited: false,
  };
}

/**
 * E100 · Grava o evento `searchbox_session` no PRIMEIRO request faturado da sessão — e uma vez só,
 * por mais requests que venham sob o mesmo token. Antes disso a sessão não existe para o contador,
 * que passa a medir uso faturado e não abertura de token.
 */
function noteSessionUsage(s: SessionState): void {
  if (s.audited) return;
  s.audited = true;
  void logAudit({ action: 'searchbox_session', details: { source: s.source } });
}

/**
 * Token da sessão corrente. Abre uma sessão nova se a anterior expirou por inatividade (2 min),
 * já teve um `/retrieve` (a Mapbox conta isso como sessão fechada) ou já bateu o teto de 50
 * `/suggest`. Toda chamada — mesmo quando reaproveita a sessão — atualiza o timestamp de atividade.
 */
export function getSearchSession(source: string = 'picker'): string {
  const now = Date.now();
  if (
    !session ||
    now - session.lastActivityAt > SESSION_IDLE_MS ||
    session.retrieved ||
    session.suggestCount >= MAX_SUGGESTS_PER_SESSION
  ) {
    session = createSession(now, source);
  } else {
    session.lastActivityAt = now;
  }
  return session.token;
}

/**
 * E46 · Contar um request sem sessão ativa é **erro de programação** — alguém chamou
 * `noteSuggestCall()`/`noteRetrieveCall()` antes de `getSearchSession()` ou depois de
 * `endSearchSession()`. A versão anterior inventava uma sessão com `source='picker'` fixo, o que
 * inflava a contagem de sessões e sujava `audit_logs` com um evento de sessão que nunca existiu.
 * Em DEV falha alto (para aparecer no teste); em produção avisa e não faz nada — o request já
 * aconteceu, e contá-lo numa sessão inventada seria pior do que não contar.
 */
function activeSessionOrNull(caller: string): SessionState | null {
  if (session) return session;
  const message =
    `${caller} chamado sem sessão ativa: abra a sessão com getSearchSession() antes de contar ` +
    'o request (E46). Não vou criar uma sessão fantasma com source="picker".';
  if (import.meta.env.DEV) throw new Error(message);
  console.warn(message);
  return null;
}

/** E45 · Espia a sessão corrente **sem** criar, sem renovar e sem contar nada.
 * É o que permite consultar o cache de `/suggest` antes de abrir sessão: termo já cacheado
 * devolve resultado sem sessão nova (billing por sessão — sessão para servir cache é cobrança
 * de request que não existiu). Devolve o token mesmo de sessão vencida: a entrada de cache dela
 * ainda é servível e nada sai para a rede. */
export function peekSearchSession(): string | null {
  return session ? session.token : null;
}

/** Conta um `/suggest` na sessão corrente (E46: sem sessão ativa, erro em DEV e no-op em prod). */
export function noteSuggestCall(): void {
  const current = activeSessionOrNull('noteSuggestCall');
  if (!current) return;
  current.suggestCount += 1;
  noteSessionUsage(current);
}

/** Marca que a sessão corrente já foi usada num `/retrieve` — força sessão nova na próxima busca
 * (E46: mesma regra de sessão ativa que `noteSuggestCall`). */
export function noteRetrieveCall(): void {
  const current = activeSessionOrNull('noteRetrieveCall');
  if (!current) return;
  current.retrieved = true;
  noteSessionUsage(current);
}

/** Encerra a sessão explicitamente (após `/retrieve` bem-sucedido, ou ao fechar o picker). */
export function endSearchSession(): void {
  if (session) clearSuggestCacheForSession(session.token);
  session = null;
}

export function resetSearchSessionForTests(): void {
  session = null;
}
