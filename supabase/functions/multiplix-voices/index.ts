// F64 (Bloco H — Voz) — docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md.
//
// Lista as vozes que o CHAMADOR pode usar e assina a recuperacao de um ativo de voz.
//
//   * `voices.list`  — so as vozes com grant vivo que alcancam o chamador (papel ou perfil);
//   * `assets.sign`  — assina o ativo do bucket privado `multiplix-voice` por TTL do envio.
//
// A revogacao corta as DUAS pontas: grant revogado nao lista (F64) e nao assina (a recuperacao do
// asset e negada mesmo que o ativo continue no bucket). O ativo INVALIDADO (F45: o roteiro/voz/parametro
// mudou) tambem nao e assinado — quem reusa asset velho e o worker do F65, que regenera antes de enviar.
//
// O cliente do banco aqui e o SERVICE — ele NAO passa por RLS, entao a regra de visibilidade e aplicada
// EXPLICITAMENTE neste arquivo (as policies da migration 20261003132707 sao a segunda camada, para quem
// consultar a tabela por outro caminho). As decisoes ficam em funcoes puras, testadas sem banco.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.87.1';
import { z } from 'https://esm.sh/zod@3.23.8';
import {
  enforceRateLimit, errorResponse, getClientIP, handleCors, jsonResponse, requireAuth, requireEnv,
} from '../_shared/validation.ts';
import { DEFAULT_MEDIA_TTL_SECONDS } from '../_shared/messaging/media.ts';

/** Bucket privado criado pela migration do F64 (`public = false`). */
export const VOICE_BUCKET = 'multiplix-voice';

export interface VoiceGrantRow {
  voice_id: string;
  titular: string;
  roles: string[] | null;
  perfis: string[] | null;
  origem: string | null;
  revoked_at: string | null;
}

export interface VoiceAssetRow {
  id: string;
  caminho: string;
  voice_id: string;
  created_by: string | null;
  invalidated_at: string | null;
}

export interface CallerContext {
  userId: string;
  roleNames: string[];
  profileId: string | null;
  isStaff: boolean;
}

/**
 * O grant alcanca o chamador? Regra do F64: grant revogado nao alcanca NINGUEM (nem o titular da
 * linha); staff (admin/supervisor) alcanca tudo; fora disso, basta casar UM papel em `roles` OU o
 * perfil em `perfis`. Grant sem alvo nao existe na tabela (o CHECK exige roles ou perfis).
 */
export function grantReachesCaller(grant: VoiceGrantRow, caller: CallerContext): boolean {
  if (grant.revoked_at) return false;
  if (caller.isStaff) return true;
  const porPapel = (grant.roles ?? []).some((papel) => caller.roleNames.includes(papel));
  const porPerfil = caller.profileId !== null && (grant.perfis ?? []).includes(caller.profileId);
  return porPapel || porPerfil;
}

/** Voce sem grant vivo que alcance o chamador: a lista sai vazia (e nao um erro de permissao). */
export function visibleGrants(grants: VoiceGrantRow[], caller: CallerContext): VoiceGrantRow[] {
  return grants.filter((grant) => grantReachesCaller(grant, caller));
}

/**
 * O chamador pode recuperar (assinar) este ativo? Dono do ativo e staff recuperam direto; os demais
 * dependem de um grant vivo para a voz do ativo. Ativo invalidado (F45) nao se recupera.
 */
export function canRecoverAsset(
  asset: VoiceAssetRow,
  grants: VoiceGrantRow[],
  caller: CallerContext,
): boolean {
  if (asset.invalidated_at) return false;
  if (caller.isStaff) return true;
  if (asset.created_by !== null && caller.profileId !== null && asset.created_by === caller.profileId) {
    return true;
  }
  return grants.some((grant) => grant.voice_id === asset.voice_id && grantReachesCaller(grant, caller));
}

const requestSchema = z.object({
  action: z.enum(['voices.list', 'assets.sign']),
  params: z.record(z.unknown()).optional(),
});

const signParamsSchema = z.object({ asset_id: z.string().uuid() });

export async function handleMultiplixVoicesRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  let supabaseUrl: string;
  let serviceKey: string;
  try {
    supabaseUrl = requireEnv('SUPABASE_URL');
    serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  } catch {
    return errorResponse('Multiplix voices is not configured', 503, req);
  }

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const rate = await enforceRateLimit(`multiplix-voices:${userId}:${getClientIP(req)}`, 60, 60_000);
  if (!rate.allowed) {
    const limited = errorResponse('Rate limit exceeded', 429, req);
    limited.headers.set('Retry-After', '60');
    return limited;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400, req);
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return errorResponse('Invalid request', 400, req);
  const { action, params } = parsed.data;

  const canonical = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Papel e perfil do chamador saem de `user_roles`/`profiles` (mesma fonte que as policies usam) e
  // `is_admin_or_supervisor` decide o staff. Sem perfil o chamador ainda funciona por PAPEL.
  const [{ data: roleRows }, { data: profileRow }, staffResult] = await Promise.all([
    canonical.from('user_roles').select('role').eq('user_id', userId),
    canonical.from('profiles').select('id').eq('user_id', userId).maybeSingle(),
    canonical.rpc('is_admin_or_supervisor', { _user_id: userId }),
  ]);

  const caller: CallerContext = {
    userId,
    roleNames: (roleRows ?? []).map((row: { role: string }) => row.role),
    profileId: (profileRow?.id as string | undefined) ?? null,
    isStaff: !staffResult.error && staffResult.data === true,
  };

  switch (action) {
    case 'voices.list': {
      // Le UMA vez as linhas vivas e filtra aqui: o filtro por papel/perfil nao cabe em `or()` do
      // PostgREST quando o alvo e um array de enum.
      const { data, error } = await canonical
        .from('multiplix_voice_grants')
        .select('voice_id, titular, roles, perfis, origem, revoked_at')
        .is('revoked_at', null)
        .order('voice_id');
      if (error) return errorResponse('Falha ao listar as vozes', 500, req);

      const grants = (data ?? []) as VoiceGrantRow[];
      const visiveis = visibleGrants(grants, caller);
      return jsonResponse(
        {
          voices: visiveis.map((grant) => ({
            voice_id: grant.voice_id,
            titular: grant.titular,
            origem: grant.origem,
          })),
        },
        200,
        req,
      );
    }

    case 'assets.sign': {
      const signParams = signParamsSchema.safeParse(params ?? {});
      if (!signParams.success) return errorResponse('Invalid assets.sign parameters', 400, req);

      const { data: asset, error: assetError } = await canonical
        .from('multiplix_voice_assets')
        .select('id, caminho, voice_id, created_by, invalidated_at')
        .eq('id', signParams.data.asset_id)
        .maybeSingle();
      if (assetError) return errorResponse('Falha ao ler o ativo de voz', 500, req);
      if (!asset) return errorResponse('Ativo de voz não encontrado', 404, req);

      const { data: grantRows } = await canonical
        .from('multiplix_voice_grants')
        .select('voice_id, titular, roles, perfis, origem, revoked_at')
        .eq('voice_id', (asset as VoiceAssetRow).voice_id);

      const podeAssinar = canRecoverAsset(
        asset as VoiceAssetRow,
        (grantRows ?? []) as VoiceGrantRow[],
        caller,
      );
      if (!podeAssinar) {
        // Distingue os dois motivos: o operador precisa saber se pede um novo grant ou se regera o audio.
        return (asset as VoiceAssetRow).invalidated_at
          ? errorResponse('multiplix_voice_asset_invalidated', 403, req)
          : errorResponse('Voz sem autorização para este usuário', 403, req);
      }

      const { data: signed, error: signError } = await canonical.storage
        .from(VOICE_BUCKET)
        .createSignedUrl((asset as VoiceAssetRow).caminho, DEFAULT_MEDIA_TTL_SECONDS);
      if (signError || !signed?.signedUrl) {
        return errorResponse('Falha ao assinar o ativo de voz', 500, req);
      }

      return jsonResponse(
        {
          asset_id: (asset as VoiceAssetRow).id,
          voice_id: (asset as VoiceAssetRow).voice_id,
          url: signed.signedUrl,
          expires_in: DEFAULT_MEDIA_TTL_SECONDS,
        },
        200,
        req,
      );
    }
  }
}

if (import.meta.main) Deno.serve((req) => handleMultiplixVoicesRequest(req));
