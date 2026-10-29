/**
 * Destino depois do login/2FA — porte da V3
 * (features/auth/hooks/useAuthForm.ts, l.64-79,128).
 *
 * O destino chega por duas fontes: `?next=` na URL (link direto) e `state.from`
 * (o ProtectedRoute manda a rota pedida ao devolver o usuário ao /auth). As duas
 * são manipuláveis, então só passa caminho interno relativo:
 *   - começa com '/' e não com '//' (protocol-relative vira host externo);
 *   - não carrega esquema ('javascript:', 'https:') nem '\' (o browser trata
 *     como '/', então '/\evil.com' sairia do app);
 *   - não é uma rota do próprio fluxo de autenticação (/auth, /2fa,
 *     /access-denied) — voltar para lá criaria laço.
 * Query (ex.: ?view=) e hash são preservados. Qualquer outra coisa vira '/'.
 */

export interface LocationLike {
  pathname?: string;
  search?: string;
  hash?: string;
  state?: unknown;
}

/** Rotas do fluxo de autenticação: destino para elas vira '/'. */
const ROTAS_DE_AUTENTICACAO = new Set(['/auth', '/2fa', '/access-denied']);

/**
 * Devolve o próprio caminho quando ele é um interno relativo e seguro; null
 * quando não é (open redirect, rota de autenticação, valor não-string).
 */
function caminhoInterno(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const valor = raw.trim();
  if (!valor.startsWith('/') || valor.startsWith('//')) return null;
  if (valor.includes('\\')) return null;

  // O valor pode vir percent-encoded ('/%2F%2Fevil.com'): checa o decodificado.
  let decodificado: string;
  try {
    decodificado = decodeURIComponent(valor);
  } catch {
    return null;
  }
  if (decodificado.startsWith('//') || decodificado.includes('\\')) return null;

  const pathname = decodificado.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (ROTAS_DE_AUTENTICACAO.has(pathname)) return null;

  return valor;
}

function nextDaQuery(search: unknown): string | null {
  if (typeof search !== 'string' || search.length === 0) return null;
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return params.get('next');
}

/** `state.from` pode ser um Location inteiro (ProtectedRoute) ou um caminho. */
function caminhoDoState(state: unknown): string | null {
  if (!state || typeof state !== 'object') return null;
  const from = (state as { from?: unknown }).from;
  if (typeof from === 'string') return from;
  if (!from || typeof from !== 'object') return null;

  const loc = from as { pathname?: unknown; search?: unknown; hash?: unknown };
  if (typeof loc.pathname !== 'string') return null;
  const search = typeof loc.search === 'string' ? loc.search : '';
  const hash = typeof loc.hash === 'string' ? loc.hash : '';
  return `${loc.pathname}${search}${hash}`;
}

/**
 * Resolve o destino pós-login a partir da location do react-router.
 * `?next=` tem prioridade sobre `state.from`; sem destino seguro, '/'.
 */
export function resolverDestinoPosLogin(location: LocationLike | null | undefined): string {
  const daQuery = caminhoInterno(nextDaQuery(location?.search));
  if (daQuery !== null) return daQuery;
  const doState = caminhoInterno(caminhoDoState(location?.state));
  if (doState !== null) return doState;
  return '/';
}
