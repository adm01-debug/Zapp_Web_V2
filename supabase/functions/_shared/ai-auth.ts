/**
 * Identidade das Edge Functions de IA (IA-011 e IA-012).
 *
 * Regra da casa (`supabase/config.toml:3-6`): `verify_jwt` só é desligado para
 * quem não tem como enviar JWT (webhook externo ou autenticação própria). Isso
 * significa que `verify_jwt=true` — o default — deixa passar qualquer JWT válido
 * do projeto, incluindo a **anon key pública** que vive no bundle do frontend.
 * Portanto um endpoint de IA que só confia no gateway aceita qualquer portador
 * da chave pública, sem usuário, sem cota e sem trilha.
 *
 * Este módulo é o ponto único para (a) exigir identidade de USUÁRIO verificada e
 * aplicar cota/limite antes de gastar provedor e (b) reconhecer a identidade de
 * SERVIÇO (worker interno) com comparação em tempo constante, sem confundir as
 * duas — chamada de serviço não pode assumir permissão arbitrária de usuário.
 */

import { errorResponse, getClientIP, requireAuth } from './validation.ts';
import { checkRateLimit } from './validation.ts';
import { enforceAiGuards } from './ai-guards.ts';
import { enforceAiCapability } from './ai-feature-flags.ts';
import { timingSafeEqual } from './hmac-validation.ts';

export type AiIdentity =
  | { kind: 'user'; userId: string }
  | { kind: 'service'; userId: null };

export interface AiIdentityOptions {
  /** Limite por usuário por minuto (memória do isolate; o limite compartilhado é o IA-043). */
  perUserPerMinute?: number;
  /** Cota diária por usuário (tabela `ai_usage_logs`). */
  dailyQuota?: number;
  /** Limite por IP no caminho de serviço. 0 desliga. */
  servicePerMinute?: number;
}

function bearerToken(req: Request): string {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) return '';
  return header.slice(7).trim();
}

/**
 * Reconhece a service role key em tempo constante. A comparação direta com
 * `===` (como era feita em `ai-transcribe-audio`) vaza o tamanho do prefixo
 * correto pelo tempo de resposta.
 */
export function isServiceRoleRequest(
  req: Request,
  key: string | undefined = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
): boolean {
  const token = bearerToken(req);
  if (!token || !key) return false;
  return timingSafeEqual(token, key);
}

/**
 * Exige identidade de USUÁRIO verificada + cota de IA. Recusa explicitamente a
 * identidade de serviço: quem tem a service role key não é usuário e não pode
 * usar este caminho para agir em nome de alguém.
 */
export async function requireAiIdentity(
  req: Request,
  functionName: string,
  options: AiIdentityOptions = {},
): Promise<AiIdentity | Response> {
  if (isServiceRoleRequest(req)) {
    return errorResponse('Service credentials are not accepted on this endpoint', 403, req);
  }

  const authCheck = await requireAuth(req);
  if (authCheck instanceof Response) return authCheck;
  const { userId } = authCheck;

  const guard = await enforceAiGuards({
    functionName,
    userId,
    req,
    perUserPerMinute: options.perUserPerMinute,
    dailyQuota: options.dailyQuota,
  });
  if (guard) return guard;

  return { kind: 'user', userId };
}

/**
 * Aceita usuário verificado (com cota) OU worker interno com a service role key.
 * O caminho de serviço continua limitado por IP — identidade de serviço não é
 * passe livre de consumo.
 */
export async function requireAiIdentityOrService(
  req: Request,
  functionName: string,
  options: AiIdentityOptions = {},
): Promise<AiIdentity | Response> {
  if (isServiceRoleRequest(req)) {
    // O caminho de SERVIÇO não passa por `enforceAiGuards` (não há usuário):
    // o kill switch por capacidade é conferido aqui para que a capacidade
    // desligada também pare o chamador interno (IA-009: desligar vale para
    // TODA origem, não só para o navegador). Vem antes do teto por IP —
    // capacidade desligada não consome limite.
    const capability = await enforceAiCapability({ functionName, req });
    if (capability) return capability;

    const perMinute = options.servicePerMinute ?? 60;
    if (perMinute > 0) {
      const { allowed } = checkRateLimit(`ai:service:${functionName}:${getClientIP(req)}`, perMinute, 60_000);
      if (!allowed) {
        return errorResponse(`Service rate limit exceeded (${perMinute}/min)`, 429, req);
      }
    }
    return { kind: 'service', userId: null };
  }

  return await requireAiIdentity(req, functionName, options);
}
