import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleCors, errorResponse, internalErrorResponse, jsonResponse, requireEnv, Logger, requireAuth, createAuthedClient, enforceRateLimit, isValidUUID } from "../_shared/validation.ts";
import { ElevenLabsVoiceDesignPreviewSchema, ElevenLabsVoiceDesignCreateSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";

export async function handleVoiceDesignRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("elevenlabs-voice-design");

  // JWT ja e validado pelo gateway (verify_jwt=true); aqui o usuario vira a
  // chave do rate limit persistente — cota paga (ElevenLabs/Mapbox) por usuario.
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const rl = await enforceRateLimit(`elevenlabs-voice-design:${auth.userId}`, 5, 60_000);
  if (!rl.allowed) return errorResponse("Rate limit exceeded", 429, req);

  try {
    const ELEVENLABS_API_KEY = requireEnv('ELEVENLABS_API_KEY');
    const body = await req.json();
    const action = body.action || 'preview';

    if (action === 'preview') {
      const parsed = parseBody(ElevenLabsVoiceDesignPreviewSchema, body);
      if (!parsed.success) return validationErrorResponse(parsed, req);

      const { description, text } = parsed.data;
      const previewText = text || 'Olá, esta é uma prévia da minha voz. Como posso te ajudar hoje?';

      log.info("Generating voice preview", { descLen: description.length });

      const response = await fetch('https://api.elevenlabs.io/v1/text-to-voice/create-previews', {
        method: 'POST',
        headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice_description: description, text: previewText }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        log.error("Preview error", { status: response.status, detail: errorText.substring(0, 300) });
        throw new Error(`Voice preview error: ${response.status}`);
      }

      const data = await response.json();
      log.done(200);
      return jsonResponse(data, 200, req);
    }

    if (action === 'create') {
      // SL-007 (IA-003 B3): criar voz é escrita PERSISTENTE na conta ElevenLabs
      // compartilhada da empresa. Antes, qualquer usuário autenticado criava voz
      // permanente, sem checagem de papel e sem rastro de autoria. Agora exige
      // admin/supervisor pela RPC canônica `is_admin_or_supervisor` e deixa a
      // autoria em `audit_logs`. O gate é SÓ da criação: `preview` (efêmera, não
      // persiste na conta) continua atendida a qualquer autenticado.
      const supabaseUser = await createAuthedClient(req);
      const { data: isAdmin, error: roleError } = await supabaseUser.rpc("is_admin_or_supervisor", {
        _user_id: auth.userId,
      });
      if (roleError) {
        // Fail-closed: papel não verificado não vira permissão.
        log.error("Falha ao verificar papel", { error: roleError.message });
        return internalErrorResponse(roleError, req);
      }
      if (isAdmin !== true) {
        log.warn("Criação de voz negada por papel");
        return errorResponse("Only admins can create voices", 403, req);
      }

      const parsed = parseBody(ElevenLabsVoiceDesignCreateSchema, body);
      if (!parsed.success) return validationErrorResponse(parsed, req);

      const { voice_name, voice_description, generated_voice_id, labels } = parsed.data;

      log.info("Creating voice", { voice_name });

      const response = await fetch('https://api.elevenlabs.io/v1/text-to-voice/create-voice-from-preview', {
        method: 'POST',
        headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice_name, voice_description: voice_description || '', generated_voice_id, labels: labels || {} }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        log.error("Create error", { status: response.status, detail: errorText.substring(0, 300) });
        throw new Error(`Voice creation error: ${response.status}`);
      }

      const data = await response.json();
      const voiceId = typeof data.voice_id === 'string' ? data.voice_id.slice(0, 200) : null;

      // A trilha é gravada com a service role: `audit_logs` bloqueia INSERT direto
      // de `authenticated` (policy "Block direct audit log inserts", WITH CHECK
      // false) — mesmo desenho do `elevenlabs-webhook`. `user_id` guarda o autor.
      const supabaseAdmin = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));
      const { error: auditError } = await supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        action: 'elevenlabs_voice_created',
        entity_type: 'elevenlabs',
        // `entity_id` é uuid no banco: o id textual do provedor vai em `details`.
        entity_id: voiceId !== null && isValidUUID(voiceId) ? voiceId : null,
        details: { voice_id: voiceId, voice_name },
      });
      if (auditError) {
        // A voz JÁ existe no provedor; o que falhou foi a trilha. Responder 200
        // aqui esconderia uma criação permanente sem rastro de quem a fez.
        log.error("Falha ao registrar auditoria da criação de voz", { error: auditError.message, voiceId });
        return internalErrorResponse(auditError, req);
      }

      log.done(200, { voiceId });
      return jsonResponse(data, 200, req);
    }

    // R2-MOD-070: este endpoint só executa 'preview' e 'create'. Antes, qualquer action
    // fora do contrato — inclusive a `action: 'generate'` que a tela do laboratório de voz
    // enviava — caía neste ponto e era atendida com a LISTAGEM de vozes do provedor (200,
    // sem áudio): o usuário recebia "Voz gerada com sucesso!" de uma geração que nunca foi
    // pedida ao provedor. O que não está no contrato é NEGADO, nunca convertido em leitura.
    log.warn("Unsupported action rejected", { actionType: typeof action });
    return errorResponse('Unsupported action. Allowed actions: preview, create', 400, req);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error("Unhandled error", { error: errorMessage });
    return errorResponse(errorMessage, 500, req);
  }
}

if (import.meta.main) {
  Deno.serve(handleVoiceDesignRequest);
}
