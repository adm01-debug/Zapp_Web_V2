/**
 * R2-API-015 (P2) — rotas de CICLO DE SESSÃO por flavor da Evolution.
 *
 * Defeito que este módulo fecha: `evolution-api` executava `connect`, `status` e
 * `disconnect` com fetch direto nas rotas NATIVAS do GO (`/instance/connect`,
 * `/instance/status`, `/instance/logout` — sem o nome da instância no path),
 * sem ramo v2. Com `EVOLUTION_API_FLAVOR=v2` o resto do handler (envios,
 * grupos, perfil) já usava o contrato v2 pelo tradutor, mas o ciclo de sessão
 * continuava batendo no contrato do GO: pareamento, status e logout ficavam
 * incoerentes com o flavor configurado (P13 comprovou o status v2 atingindo a
 * rota GO).
 *
 * Aqui a escolha é EXPLÍCITA por flavor: método, path (com ou sem o nome da
 * instância), credencial e normalização da resposta. O GO identifica a instância
 * pelo token (por isso o path não leva sufixo e a credencial é o token da
 * instância); o v2 identifica a instância pelo NOME no path e autentica com a
 * chave global.
 *
 * Regras de resposta:
 *   - `/instance/connectionState/{instance}` (v2) devolve `{ instance: { state } }`
 *     — sem os flags `LoggedIn`/`Connected` do GO.
 *   - `/instance/connect/{instance}` (v2) devolve o pareamento no próprio corpo
 *     (`{ base64, code, pairingCode, count }`) quando há QR a exibir, ou
 *     `{ instance: { state: 'open' } }` quando a sessão já está aberta.
 */

export type EvolutionFlavor = 'go' | 'v2';
export type SessionAction = 'connect' | 'status' | 'disconnect';
/** `instance` = token da instância (GO); `global` = chave da API (v2). */
export type SessionAuth = 'instance' | 'global';

export interface SessionRoute {
  method: 'POST' | 'GET' | 'DELETE';
  /** Path relativo à base da Evolution — já inclui a instância quando o flavor exige. */
  path: string;
  auth: SessionAuth;
}

/** Mesma regra do resto do repositório: qualquer valor diferente de 'v2' é GO. */
export function resolveEvolutionFlavor(raw: string | null | undefined): EvolutionFlavor {
  return (raw ?? 'go') === 'v2' ? 'v2' : 'go';
}

/**
 * Rota do ciclo de sessão. O `instance` só entra no path no flavor v2 — no GO um
 * sufixo vira 404 (a instância é resolvida pela credencial).
 */
export function resolveSessionRoute(
  flavor: EvolutionFlavor,
  action: SessionAction,
  instance: string,
): SessionRoute {
  if (flavor === 'v2') {
    switch (action) {
      case 'connect':
        return { method: 'POST', path: `/instance/connect/${instance}`, auth: 'global' };
      case 'status':
        return { method: 'GET', path: `/instance/connectionState/${instance}`, auth: 'global' };
      case 'disconnect':
        return { method: 'DELETE', path: `/instance/logout/${instance}`, auth: 'global' };
    }
  }
  switch (action) {
    case 'connect':
      return { method: 'POST', path: '/instance/connect', auth: 'instance' };
    case 'status':
      return { method: 'GET', path: '/instance/status', auth: 'instance' };
    case 'disconnect':
      return { method: 'DELETE', path: '/instance/logout', auth: 'instance' };
  }
}

/**
 * Credencial da rota escolhida. Rota de instância (GO) usa o token da instância
 * e cai na chave global quando ele não está configurado; rota global (v2) usa
 * sempre a chave da API.
 */
export function resolveSessionApiKey(
  route: SessionRoute,
  instanceToken: string | null | undefined,
  globalKey: string,
): string {
  return route.auth === 'instance' ? (instanceToken ?? globalKey) : globalKey;
}

/**
 * `state` de sessão ('open' | 'close') a partir da resposta do v2
 * (`{ instance: { state: 'open' | 'connecting' | 'close' | 'qrcode' } }`).
 * Só 'open' é sessão aberta; qualquer outro valor (ou corpo inesperado) é
 * tratado como fechado — nunca como logado por omissão.
 */
export function sessionStateFromV2(payload: unknown): 'open' | 'close' {
  const state = (payload as { instance?: { state?: unknown } } | null | undefined)?.instance?.state;
  return state === 'open' ? 'open' : 'close';
}

/**
 * Pareamento (`{ base64, code }`) da resposta do connect v2, ou `null` quando o
 * corpo não traz QR. O `code` é o payload cru de pareamento (`2@...`) e o
 * `base64` a imagem; o `pairingCode` do v2 é aceito como alternativa ao `code`.
 */
export function qrFromV2Connect(payload: unknown): { base64: string; code: string } | null {
  const p = payload as { base64?: unknown; code?: unknown; pairingCode?: unknown } | null | undefined;
  const base64 = typeof p?.base64 === 'string' && p.base64 ? p.base64 : '';
  if (!base64) return null;
  const code = typeof p?.code === 'string' && p.code
    ? p.code
    : typeof p?.pairingCode === 'string'
      ? p.pairingCode
      : '';
  return { base64, code };
}
