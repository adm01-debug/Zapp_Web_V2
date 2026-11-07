import { isAllowedOrigin, ORIGIN_PATTERNS } from '../supabase/functions/_shared/cors-origins.ts';

const OFFICIAL_BACKEND = 'https://tnnnlkbymytvtqngbbqh.supabase.co';
const CANONICAL_APP = 'https://zapp-web-v2.vercel.app';

export class AuthTargetError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`[E2E setup/${code}] ${message}`);
    this.name = 'AuthTargetError';
    this.code = code;
  }
}

export type AuthTarget = { origin: string; kind: 'local' | 'remote' };

/** Classifica a origem sem autenticar, ler secrets ou fazer I/O. */
export function classifyAuthTarget(raw: unknown): AuthTarget {
  const hasControlCharacter = typeof raw === 'string' &&
    Array.from(raw).some(character => character.charCodeAt(0) <= 0x1f);
  if (typeof raw !== 'string' || !raw || raw.trim() !== raw || hasControlCharacter) {
    throw new AuthTargetError('TARGET_INVALID', 'baseURL ausente ou inválida.');
  }
  let url: URL;
  try { url = new URL(raw); } catch {
    throw new AuthTargetError('TARGET_INVALID', 'baseURL deve ser uma origem HTTP(S) absoluta.');
  }
  if (url.username || url.password) {
    throw new AuthTargetError('TARGET_CREDENTIALS', 'Credenciais na URL do alvo não são aceitas.');
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new AuthTargetError('TARGET_NOT_ORIGIN', 'baseURL deve conter apenas a origem, sem caminho, query ou fragmento.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (local && ['http:', 'https:'].includes(url.protocol)) {
    return { origin: url.origin, kind: 'local' };
  }
  if (url.protocol !== 'https:' || url.port) {
    throw new AuthTargetError('TARGET_HTTPS_REQUIRED', 'Alvo remoto exige HTTPS na porta padrão.');
  }
  if (!isAllowedOrigin(url.origin)) {
    throw new AuthTargetError('TARGET_ORIGIN_REJECTED', 'Origem remota fora da política CORS oficial.');
  }
  // CLAUDE.md §5: a propriedade do domínio customizado ainda não foi verificada.
  // Estar no CORS não prova que o domínio serve este projeto da Vercel.
  if (url.origin !== CANONICAL_APP && !ORIGIN_PATTERNS.some(pattern => pattern.test(url.origin))) {
    throw new AuthTargetError('TARGET_DOMAIN_UNVERIFIED', 'Domínio aceito pelo CORS, mas sem vínculo verificado com este projeto. Use o alias canônico ou um deployment do projeto.');
  }
  return { origin: url.origin, kind: 'remote' };
}

/**
 * O servidor HTTPS explícito já existe; projetos públicos podem usá-lo sem Vite
 * local. Isso não autoriza a suíte autenticada, cuja guarda fica no auth.setup.
 */
export function usesExternalHttpsServer(raw: string | undefined): boolean {
  if (!raw) return false;
  let url: URL;
  try { url = new URL(raw); } catch {
    // ERR_INVALID_URL do Node inclui .input; não refletir uma URL com credenciais.
    throw new AuthTargetError('TARGET_INVALID', 'PLAYWRIGHT_BASE_URL inválida.');
  }
  return url.protocol === 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

/** Bloqueio específico do setup mutador, antes de ler/enviar credenciais. */
export function assertAuthenticatedTarget(baseURL: unknown): AuthTarget {
  const target = classifyAuthTarget(baseURL);
  if (target.kind === 'remote') {
    throw new AuthTargetError('REMOTE_FULL_SUITE_BLOCKED', 'A suíte autenticada grava dados e pode enfileirar mensagens reais. Exige backend/fixtures isolados e proteção de rede; a troca de URL ou um SHA publicado igual não fornece esse isolamento. Login-only requer um harness próprio. Nenhuma autenticação foi iniciada.');
  }
  // Esta é apenas a classificação inicial. O auth.setup exige em seguida a
  // admissão do namespace e do backend realmente servido, antes do login.
  return target;
}

export type AuthObservation = {
  backendOrigin?: string;
  status?: number;
  transportFailed?: boolean;
  timedOut?: boolean;
  credentialRejected?: boolean;
  accessBlocked?: boolean;
};

export function isAuthLoginRequest(raw: string): boolean {
  try { return new URL(raw).pathname === '/functions/v1/auth-login'; } catch { return false; }
}

/** Usa metadados e marcadores específicos da UI; nunca lê body, senha, token ou email. */
export function diagnoseAuthFailure(baseURL: unknown, observation: AuthObservation) {
  const result = (code: string, message: string, retryable = false) => ({ code, message, retryable });
  const status = observation.status;
  if (status === 429) return result('RATE_LIMIT', 'auth-login respondeu HTTP 429; limite temporário de requisições.', true);
  if (status && status >= 500) return result('UPSTREAM_HTTP', `auth-login respondeu HTTP ${status}.`, true);
  // useAuthForm exibe esse título para networkBlocked. O servidor pode negar
  // a política de rede antes de conferir a senha; HTTP 403 sozinho não prova a causa.
  if (observation.accessBlocked) {
    return result('ACCESS_BLOCKED', 'O app exibiu bloqueio de acesso. Confira a política de acesso do ambiente de teste; isso não comprova senha inválida.');
  }
  if (status === 401 || observation.credentialRejected) {
    return result('AUTH_REJECTED', 'A autenticação foi recusada. Confira as credenciais e o estado da conta de teste; o diagnóstico não revela seus valores.');
  }
  if (status && status >= 400) return result('REQUEST_REJECTED', `auth-login respondeu HTTP ${status}; consulte o contrato da requisição antes de repetir.`);
  if (status && status >= 200 && status < 300) {
    return result('LOGIN_RESULT_NOT_CONFIRMED', 'auth-login respondeu 2xx, mas a sessão/app shell não foi confirmada. O status sozinho não prova login concluído.');
  }
  let target: AuthTarget;
  try { target = classifyAuthTarget(baseURL); } catch (error) {
    if (error instanceof AuthTargetError) return result(error.code, error.message);
    throw error;
  }
  if (observation.backendOrigin === OFFICIAL_BACKEND && !isAllowedOrigin(target.origin)) {
    return result('CORS_ORIGIN_INCOMPATIBLE', 'A origem do navegador não é aceita pelo CORS da edge oficial. Sem resposta HTTP do POST, não é correto concluir timeout, 5xx/429 ou senha incorreta. Não habilite localhost em produção; configure um ambiente de teste isolado.');
  }
  if (observation.timedOut) return result('WAIT_TIMEOUT', 'O tempo de espera terminou sem desfecho confirmado. Não há evidência suficiente para atribuir a falha a credencial ou HTTP 5xx.', true);
  if (observation.transportFailed) return result('TRANSPORT_FAILED', 'O navegador informou falha de transporte sem resposta HTTP. Verifique DNS, TLS, conectividade e CORS; não foi comprovado HTTP 5xx/429.', true);
  return result('NO_HTTP_EVIDENCE', 'O login não concluiu, mas não há status HTTP nem falha de transporte observados. Consulte o trace antes de atribuir uma causa.');
}
