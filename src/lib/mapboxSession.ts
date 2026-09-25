// Sessão de busca da Mapbox Search Box (`/suggest` + `/retrieve`). A Mapbox cobra por SESSÃO, não
// por request: até 50 `/suggest` + 1 `/retrieve` sob o mesmo `session_token` contam como 1 sessão,
// que expira após 2 min de inatividade. Este módulo só controla QUANDO trocar de token — quem
// dispara as chamadas HTTP é `mapboxGeocode.ts` (E06/E07). Estado em closure de módulo (não React):
// o picker some/volta e a sessão de busca precisa sobreviver a isso, na Fase 2.

const SESSION_IDLE_MS = 120_000;
const MAX_SUGGESTS_PER_SESSION = 50;

interface SessionState {
  token: string;
  lastActivityAt: number;
  suggestCount: number;
  retrieved: boolean;
}

let session: SessionState | null = null;

export function newSessionToken(): string {
  return crypto.randomUUID();
}

function createSession(now: number): SessionState {
  return { token: newSessionToken(), lastActivityAt: now, suggestCount: 0, retrieved: false };
}

/**
 * Token da sessão corrente. Abre uma sessão nova se a anterior expirou por inatividade (2 min),
 * já teve um `/retrieve` (a Mapbox conta isso como sessão fechada) ou já bateu o teto de 50
 * `/suggest`. Toda chamada — mesmo quando reaproveita a sessão — atualiza o timestamp de atividade.
 */
export function getSearchSession(): string {
  const now = Date.now();
  if (
    !session ||
    now - session.lastActivityAt > SESSION_IDLE_MS ||
    session.retrieved ||
    session.suggestCount >= MAX_SUGGESTS_PER_SESSION
  ) {
    session = createSession(now);
  } else {
    session.lastActivityAt = now;
  }
  return session.token;
}

/** Conta um `/suggest` na sessão corrente (abre uma se ainda não houver). */
export function noteSuggestCall(): void {
  if (!session) session = createSession(Date.now());
  session.suggestCount += 1;
}

/** Marca que a sessão corrente já foi usada num `/retrieve` — força sessão nova na próxima busca. */
export function noteRetrieveCall(): void {
  if (!session) session = createSession(Date.now());
  session.retrieved = true;
}

/** Encerra a sessão explicitamente (após `/retrieve` bem-sucedido, ou ao fechar o picker). */
export function endSearchSession(): void {
  session = null;
}

export function resetSearchSessionForTests(): void {
  session = null;
}
