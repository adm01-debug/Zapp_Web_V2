import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Logger, checkRateLimit, getClientIP, getCorsHeaders, handleCors } from "../_shared/validation.ts";
import { proxyToEvolution, resolvePrivateBucketUrl } from "../_shared/evolution-api-proxy.ts";
import { goHistoryNotSupported } from "../_shared/evolution-sync-actions.ts";

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const corsHeaders = getCorsHeaders(req);

  const ip = getClientIP(req);
  const rl = checkRateLimit(`evolution:${ip}`, 120, 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const evolutionApiUrl = (Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/+$/, '');
  const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

  if (!evolutionApiUrl || !evolutionApiKey) {
    return new Response(JSON.stringify({ error: 'Evolution API not configured', message: 'Please configure EVOLUTION_API_URL and EVOLUTION_API_KEY secrets' }), {
      status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  // Midia privada e assinada com o JWT de quem chamou: as policies de SELECT em
  // storage.objects (contato atribuido / admin / membro da conversa) decidem o que ele
  // pode mandar para a GO — o service_role nao passa por cima da autorizacao por objeto.
  const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || '', {
    global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
  });

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const pathAction = pathParts[pathParts.length - 1];

  let _bodyCache: Record<string, unknown> | null = null;
  const json = async () => {
    if (_bodyCache !== null) return _bodyCache;
    try { _bodyCache = await req.json(); } catch { _bodyCache = {}; }
    return _bodyCache!;
  };

  const bodyForAction = await json();
  const action = (pathAction === 'evolution-api' && bodyForAction.action)
    ? String(bodyForAction.action) : pathAction;

  try {
    const body = await json();
    const instance = String(body.instanceName || body.instance || '');

    // ─── E17 (plano multi-conexão): instância obrigatória em ação de instância ───
    // list-instances é a única ação realmente global (lista todas as instâncias
    // na GO). Toda outra ação usa `${instance}` no path traduzido — vazio hoje
    // casaria como path malformado (GO 404) ou, pior, caía silenciosamente na
    // PRINCIPAL em rotas GET sem sufixo.
    if (action !== 'list-instances' && action !== 'bootstrap-instance-token' && !instance) {
      return new Response(JSON.stringify({ error: true, message: 'instance (instanceName) é obrigatório para esta ação.' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // E22: chave do circuit breaker por instância — '__admin' para list-instances.
    const proxy = (path: string, method = 'POST', body?: unknown) =>
      proxyToEvolution(evolutionApiUrl, evolutionApiKey, corsHeaders, path, method, body, undefined, instance || '__admin');

    // ─── 0. Janela de manutenção (proteção contra bloqueio da Meta) ───
    // Enquanto whatsapp_maintenance_until estiver no futuro, ações que fazem a
    // instância tentar logar de novo na Meta (connect/restart/disconnect) ficam
    // bloqueadas — reconectar em loop durante um bloqueio tende a estendê-lo.
    // create-instance entra na mesma trava (nasceria conectando outro número
    // durante a mesma janela de risco).
    const MAINTENANCE_GATED_ACTIONS = new Set(['connect', 'restart-instance', 'disconnect', 'create-instance', 'create-connection']);
    if (MAINTENANCE_GATED_ACTIONS.has(action)) {
      const { data: maint } = await supabase.from('global_settings').select('value').eq('key', 'whatsapp_maintenance_until').maybeSingle();
      const until = maint?.value ? new Date(maint.value) : null;
      if (until && !Number.isNaN(until.getTime()) && until.getTime() > Date.now()) {
        return new Response(JSON.stringify({
          error: true,
          message: `Ação bloqueada: janela de manutenção do WhatsApp até ${until.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (proteção contra bloqueio da Meta — evita tentativas de login em loop).`,
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Endpoints admin do GO usam instanceId (UUID) no path; o app guarda o NOME
    // da instância. Resolve nome→id via /instance/all antes de chamar.
    const resolveGoInstanceId = async (name: string): Promise<string | null> => {
      try {
        const res = await fetch(`${evolutionApiUrl}/instance/all`, {
          headers: { 'apikey': evolutionApiKey },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        const json = await res.json();
        const records: Record<string, unknown>[] =
          Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
        const found = records.find((r) =>
          r?.name === name || r?.Name === name ||
          r?.instanceId === name || r?.InstanceID === name || r?.id === name || r?.ID === name);
        return (found?.instanceId ?? found?.InstanceID ?? found?.id ?? found?.ID ?? null) as string | null;
      } catch {
        return null;
      }
    };
    const isGoFlavor = (Deno.env.get('EVOLUTION_API_FLAVOR') ?? 'go') !== 'v2';

    // ─── E10/E11 (plano multi-conexão): ambas admin-only — mesmo guard usado em
    // evolution-sync/index.ts (JWT válido + is_admin_or_supervisor via RPC).
    const requireAdmin = async (): Promise<Response | null> => {
      const { data: { user }, error: userError } = await callerClient.auth.getUser();
      if (userError || !user) {
        return new Response(JSON.stringify({ error: true, message: 'Não autenticado.' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { data: isAdmin } = await callerClient.rpc('is_admin_or_supervisor', { _user_id: user.id });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: true, message: 'Apenas administradores podem executar esta ação.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return null;
    };

    // ─── E10: backfill do token da PRINCIPAL (secret global → Vault) ───
    // Idempotente (set_instance_token faz update quando já existe secret_id).
    // Nunca ecoa o token na resposta nem em log.
    if (action === 'bootstrap-instance-token') {
      const adminError = await requireAdmin();
      if (adminError) return adminError;
      const legacyToken = Deno.env.get('EVOLUTION_INSTANCE_TOKEN');
      if (!legacyToken) {
        return new Response(JSON.stringify({ error: true, message: 'EVOLUTION_INSTANCE_TOKEN não configurado — nada para migrar.' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const principalName = Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'PRINCIPAL';
      const { data: conn, error: connLookupError } = await supabase.from('whatsapp_connections').select('id').eq('instance_id', principalName).maybeSingle();
      if (connLookupError || !conn) {
        return new Response(JSON.stringify({ error: true, message: `Conexão '${principalName}' não encontrada em whatsapp_connections.` }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { error: setError } = await supabase.rpc('set_instance_token', { p_connection_id: conn.id, p_token: legacyToken });
      if (setError) {
        new Logger('evolution-api').error('bootstrap-instance-token falhou', { error: setError.message });
        return new Response(JSON.stringify({ error: true, message: 'Falha ao gravar o token no Vault.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true, instance: principalName }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ─── 1. Instance Management ───
    // Evolution GO exige token na criação (v2 auto-gerava) — gera um default;
    // ele volta na resposta para o operador guardar (EVOLUTION_INSTANCE_TOKEN).
    if (action === 'create-instance') {
      new Logger('evolution-api').warn('create-instance está deprecado — front deve migrar para create-connection (E11)', { instance });
      const { data: multi } = await supabase.from('global_settings').select('value').eq('key', 'multi_connection_enabled').maybeSingle();
      if (multi?.value !== 'true') {
        return new Response(JSON.stringify({
          error: true,
          message: 'Múltiplas conexões de WhatsApp ainda não estão habilitadas neste sistema (ver plano multi-conexão Evolution GO).',
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return await proxy('/instance/create', 'POST', { instanceName: instance, qrcode: body.qrcode ?? true, integration: body.integration || 'WHATSAPP-BAILEYS', token: body.token ?? crypto.randomUUID(), number: body.number, businessId: body.businessId, wabaId: body.wabaId, phoneNumberId: body.phoneNumberId, webhook: body.webhook, chatwoot: body.chatwoot, typebot: body.typebot, proxy: body.proxy });
    }

    // ─── E11: cria a instância na GO e persiste a conexão + token do Vault na
    // mesma operação lógica. Se falhar depois do create na GO, compensa
    // (delete best-effort na GO) em vez de deixar instância órfã com token
    // perdido — hoje (create-instance) é o front que insere depois, e se o
    // insert falhar a instância já nasceu de qualquer jeito na GO.
    if (action === 'create-connection') {
      const adminError = await requireAdmin();
      if (adminError) return adminError;
      const { data: multi } = await supabase.from('global_settings').select('value').eq('key', 'multi_connection_enabled').maybeSingle();
      if (multi?.value !== 'true') {
        return new Response(JSON.stringify({
          error: true,
          message: 'Múltiplas conexões de WhatsApp ainda não estão habilitadas neste sistema (ver plano multi-conexão Evolution GO).',
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (!/^[a-z0-9_]{3,40}$/.test(instance)) {
        return new Response(JSON.stringify({ error: true, message: 'Nome de instância inválido — use letras minúsculas, números e "_" (3 a 40 caracteres).' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const connName = String(body.name || '').trim();
      const phoneNumber = String(body.phone_number || body.number || '').trim();
      if (!connName || !phoneNumber) {
        return new Response(JSON.stringify({ error: true, message: 'name e phone_number são obrigatórios.' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { data: existing } = await supabase.from('whatsapp_connections').select('id').eq('instance_id', instance).maybeSingle();
      if (existing) {
        return new Response(JSON.stringify({ error: true, message: `Já existe uma conexão com instance_id '${instance}'.` }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const compensateGoCreate = async () => {
        try {
          if (isGoFlavor) {
            const goId = await resolveGoInstanceId(instance);
            if (goId) await proxy(`/instance/delete/${goId}`, 'DELETE');
          } else {
            await proxy(`/instance/delete/${instance}`, 'DELETE');
          }
        } catch (err: unknown) {
          new Logger('evolution-api').error('create-connection: compensação (delete na GO) falhou — instância pode ter ficado órfã', {
            instance, error: err instanceof Error ? err.message : String(err),
          });
        }
      };

      const instanceToken = crypto.randomUUID();
      const createRes = await proxy('/instance/create', 'POST', {
        instanceName: instance, qrcode: true, integration: body.integration || 'WHATSAPP-BAILEYS',
        token: instanceToken, number: body.number, businessId: body.businessId, wabaId: body.wabaId,
        phoneNumberId: body.phoneNumberId, webhook: body.webhook, chatwoot: body.chatwoot,
        typebot: body.typebot, proxy: body.proxy,
      });
      // proxyToEvolution sempre devolve status HTTP 200 (convenção do proxy —
      // ver normalizeGoResponse/cbRecord): falha real vem no corpo (error:true),
      // nunca em createRes.ok.
      const createData: Record<string, unknown> = await createRes.json().catch(() => ({}));
      if (createData?.error === true) {
        return new Response(JSON.stringify(createData), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: row, error: insertError } = await supabase.from('whatsapp_connections').insert({
        name: connName, phone_number: phoneNumber, instance_id: instance, status: 'disconnected',
        is_default: body.is_default === true,
      }).select().single();
      if (insertError || !row) {
        await compensateGoCreate();
        new Logger('evolution-api').error('create-connection: insert falhou, instância compensada na GO', { instance, error: insertError?.message });
        return new Response(JSON.stringify({ error: true, message: 'Falha ao registrar a conexão (revertido na Evolution GO).' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error: tokenError } = await supabase.rpc('set_instance_token', { p_connection_id: row.id, p_token: instanceToken });
      if (tokenError) {
        await supabase.from('whatsapp_connections').delete().eq('id', row.id);
        await compensateGoCreate();
        new Logger('evolution-api').error('create-connection: set_instance_token falhou, revertido', { instance, error: tokenError.message });
        return new Response(JSON.stringify({ error: true, message: 'Falha ao guardar o token no Vault (revertido).' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Webhook na criação (best-effort): falhar aqui não desfaz a conexão já
      // criada e com token guardado — o front sempre pode chamar 'connect'
      // (usa o token da instância via E16, quando existir) para reparar.
      try {
        await fetch(`${evolutionApiUrl}/instance/connect`, {
          method: 'POST',
          headers: { apikey: instanceToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscribe: ['ALL'], immediate: true, webhookUrl: `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/evolution-webhook` }),
        });
      } catch (err: unknown) {
        new Logger('evolution-api').warn('create-connection: connect inicial falhou (conexão criada; reconectar manualmente)', {
          instance, error: err instanceof Error ? err.message : String(err),
        });
      }

      return new Response(JSON.stringify({ connection: row, evolution: createData }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'list-instances') return await proxy(`/instance/fetchInstances${body.instanceName ? `?instanceName=${body.instanceName}` : ''}`, 'GET');

    if (action === 'connect') {
      const instToken = Deno.env.get('EVOLUTION_INSTANCE_TOKEN') ?? evolutionApiKey;
      // NUNCA body vazio: o GO persiste webhook/subscribe do body — {} apagaria
      // o webhook da instância e derrubaria a entrega de eventos (o guard
      // instance.Webhook != "" bloqueia até o WEBHOOK_URL global). Reafirmar a
      // configuração a cada connect torna o fluxo de QR auto-reparador.
      const connectBody = JSON.stringify({
        subscribe: ['ALL'], immediate: true,
        webhookUrl: `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/evolution-webhook`,
      });
      const response = await fetch(`${evolutionApiUrl}/instance/connect`, { method: 'POST', headers: { 'apikey': instToken, 'Content-Type': 'application/json' }, body: connectBody });
      const data = await response.json();
      const qrRes = await fetch(`${evolutionApiUrl}/instance/qr`, { method: 'GET', headers: { 'apikey': instToken } });
      const qrData = await qrRes.json();
      // A GO devolve o PNG do QR codificando 'https://wa.me/settings/linked_devices#2@...'.
      // O leitor de "Conectar aparelho" do WhatsApp so aceita o payload cru "2@...": com a URL
      // ele recusa o QR e o pareamento pela tela do app nunca fecha. Alem disso o campo vem
      // como "<dataURI>|<url>", o que quebra o <img src>. Re-renderiza a partir do payload cru.
      const rawQrCode = String(qrData?.data?.code ?? '').split('#').pop() ?? '';
      let qrcode = String(qrData?.data?.qrcode ?? '').split('|')[0] || undefined;
      if (rawQrCode.startsWith('2@')) {
        try {
          const { default: QRCode } = await import('https://esm.sh/qrcode@1.5.3');
          const svg = await QRCode.toString(rawQrCode, { type: 'svg', margin: 2, width: 512 });
          qrcode = `data:image/svg+xml;base64,${btoa(svg)}`;
        } catch (err: unknown) {
          new Logger('evolution-api').error('Falha ao re-renderizar QR; usando o da GO', { error: err instanceof Error ? err.message : String(err) });
        }
      }
      if (qrcode) await supabase.from('whatsapp_connections').update({ qr_code: qrcode, status: 'qr_pending', instance_id: instance }).eq('instance_id', instance);
      return new Response(JSON.stringify({ ...data, qrcode: qrcode ? { base64: qrcode, code: rawQrCode || qrData?.data?.code } : undefined }), { status: response.ok ? 200 : 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'status') {
      const instToken = Deno.env.get('EVOLUTION_INSTANCE_TOKEN') ?? evolutionApiKey;
      const response = await fetch(`${evolutionApiUrl}/instance/status`, { method: 'GET', headers: { 'apikey': instToken } });
      const data = await response.json();
      // '||' e nao '??': loggedIn:false explicito nao pode curto-circuitar o
      // fallback por State — a GO manda os dois e nem sempre concordam.
      if (data?.data && data.state === undefined) data.state = ((data.data.loggedIn ?? data.data.LoggedIn) || data.data.State === 'open') ? 'open' : 'close';
      if (response.ok) {
        const status = data.state === 'open' ? 'connected' : 'disconnected';
        // So zera o QR quando conecta de fato. O polling de status roda a cada 3s
        // enquanto o dialogo de QR esta aberto; zerar aqui apagava o qr_code que o
        // connect/webhook acabou de gravar e travava o pareamento (spinner infinito).
        // O neq('status','qr_pending') protege o pareamento em curso.
        if (status === 'connected') {
          await supabase.from('whatsapp_connections').update({ status, qr_code: null }).eq('instance_id', instance);
        } else {
          await supabase.from('whatsapp_connections').update({ status }).eq('instance_id', instance).neq('status', 'qr_pending');
        }
      }
      const status = data.state === 'open' ? 'connected' : 'disconnected';
      return new Response(JSON.stringify({ ...data, status }), { status: response.ok ? 200 : 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'instance-info') {
      if (isGoFlavor) {
        const goId = await resolveGoInstanceId(instance);
        if (!goId) return new Response(JSON.stringify({ error: true, status: 404, message: 'Instância não encontrada na Evolution GO.' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        return await proxy(`/instance/info/${goId}`, 'GET');
      }
      return await proxy(`/instance/info/${instance}`, 'GET');
    }
    if (action === 'restart-instance') return await proxy(`/instance/restart/${instance}`, 'PUT');

    if (action === 'disconnect') {
      const response = await fetch(`${evolutionApiUrl}/instance/logout`, { method: 'DELETE', headers: { 'apikey': Deno.env.get('EVOLUTION_INSTANCE_TOKEN') ?? evolutionApiKey } });
      const data = await response.json();
      await supabase.from('whatsapp_connections').update({ status: 'disconnected' }).eq('instance_id', instance);
      return new Response(JSON.stringify(data), { status: response.ok ? 200 : 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'delete-instance') {
      if (isGoFlavor) {
        const goId = await resolveGoInstanceId(instance);
        if (!goId) return new Response(JSON.stringify({ error: true, status: 404, message: 'Instância não encontrada na Evolution GO.' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        return await proxy(`/instance/delete/${goId}`, 'DELETE');
      }
      return await proxy(`/instance/delete/${instance}`, 'DELETE', body);
    }
    if (action === 'set-presence') return await proxy(`/instance/setPresence/${instance}`, 'POST', { presence: body.presence });

    // ─── 2. Settings ───
    if (action === 'set-settings') return await proxy(`/settings/set/${instance}`, 'POST', { rejectCall: body.rejectCall, msgCall: body.msgCall, groupsIgnore: body.groupsIgnore, alwaysOnline: body.alwaysOnline, readMessages: body.readMessages, readStatus: body.readStatus, syncFullHistory: body.syncFullHistory });
    if (action === 'get-settings') return await proxy(`/settings/find/${instance}`, 'GET');

    // ─── 3. Webhook ───
    if (action === 'set-webhook') return await proxy(`/webhook/set/${instance}`, 'POST', { webhook: { enabled: body.enabled ?? true, url: body.url, webhookByEvents: body.webhookByEvents ?? true, webhookBase64: body.webhookBase64 ?? false, events: body.events || ['APPLICATION_STARTUP','QRCODE_UPDATED','CONNECTION_UPDATE','MESSAGES_SET','MESSAGES_UPSERT','MESSAGES_UPDATE','MESSAGES_DELETE','MESSAGES_EDITED','SEND_MESSAGE','SEND_MESSAGE_UPDATE','CONTACTS_SET','CONTACTS_UPSERT','CONTACTS_UPDATE','PRESENCE_UPDATE','CHATS_SET','CHATS_UPSERT','CHATS_UPDATE','CHATS_DELETE','GROUPS_UPSERT','GROUP_UPDATE','GROUP_PARTICIPANTS_UPDATE','TYPEBOT_START','TYPEBOT_CHANGE_STATUS','LABELS_EDIT','LABELS_ASSOCIATION','CALL'] } });
    if (action === 'get-webhook') return await proxy(`/webhook/find/${instance}`, 'GET');

    // ─── 4. Messaging ───
    if (action === 'send-text') return await proxy(`/message/sendText/${instance}`, 'POST', { number: body.number, text: body.text, delay: body.delay, quoted: body.quoted, mentionsEveryOne: body.mentionsEveryOne, mentioned: body.mentioned });
    if (action === 'send-media') {
      // whatsapp-media e bucket privado: a GO precisa de uma signed URL para baixar o arquivo.
      let mediaSource = body.mediaUrl || body.media;
      if (typeof mediaSource === 'string') {
        mediaSource = await resolvePrivateBucketUrl(callerClient, mediaSource, undefined, supabaseUrl);
      }
      return await proxy(`/message/sendMedia/${instance}`, 'POST', { number: body.number, mediatype: body.mediaType || body.mediatype, mimetype: body.mimetype, caption: body.caption, media: mediaSource, fileName: body.fileName, delay: body.delay, quoted: body.quoted });
    }

    if (action === 'send-audio') {
      const rawAudio = body.audio || body.audioUrl || body.mediaUrl;
      let audioSource = typeof rawAudio === 'string'
        ? rawAudio.trim().replace(/^"+|"+$/g, '').replace(/\.supabase\.co"\//, '.supabase.co/')
        : rawAudio;
      if (typeof audioSource === 'string') {
        audioSource = await resolvePrivateBucketUrl(callerClient, audioSource, undefined, supabaseUrl);
      }
      const audioPayload: Record<string, unknown> = { number: body.number, audio: audioSource };
      if (body.delay) audioPayload.delay = body.delay;
      if (body.quoted) audioPayload.quoted = body.quoted;
      return await proxy(`/message/sendWhatsAppAudio/${instance}`, 'POST', audioPayload);
    }

    if (action === 'send-sticker') {
      let finalStickerUrl = body.sticker || body.mediaUrl;
      if (typeof finalStickerUrl === 'string') {
        finalStickerUrl = await resolvePrivateBucketUrl(
          callerClient,
          finalStickerUrl,
          ['whatsapp-media'],
          supabaseUrl
        );
      }
      return await proxy(`/message/sendSticker/${instance}`, 'POST', { number: body.number, sticker: finalStickerUrl, quoted: body.quoted });
    }

    if (action === 'send-location') return await proxy(`/message/sendLocation/${instance}`, 'POST', { number: body.number, name: body.locationName || body.name, address: body.locationAddress || body.address, latitude: body.latitude, longitude: body.longitude });
    if (action === 'send-contact') return await proxy(`/message/sendContact/${instance}`, 'POST', { number: body.number, contact: body.contact });
    if (action === 'send-reaction') return await proxy(`/message/sendReaction/${instance}`, 'POST', { key: body.key, reaction: body.reaction });
    if (action === 'send-poll') return await proxy(`/message/sendPoll/${instance}`, 'POST', { number: body.number, name: body.name || body.question, selectableCount: body.selectableCount || 1, values: body.values || body.options });
    if (action === 'send-list') return await proxy(`/message/sendList/${instance}`, 'POST', { number: body.number, title: body.title, description: body.description, footer: body.footer, buttonText: body.buttonText, sections: body.sections });
    if (action === 'send-buttons') return await proxy(`/message/sendButtons/${instance}`, 'POST', { number: body.number, title: body.title, description: body.description, footer: body.footer, buttons: body.buttons });
    if (action === 'send-status') return await proxy(`/message/sendStatus/${instance}`, 'POST', body);
    if (action === 'send-template') return await proxy(`/message/sendTemplate/${instance}`, 'POST', { number: body.number, template: body.template });
    if (action === 'mark-read') return await proxy(`/chat/markMessageAsRead/${instance}`, 'POST', { readMessages: body.readMessages || [body.key] });
    if (action === 'mark-unread') return await proxy(`/chat/markMessageAsUnread/${instance}`, 'POST', { readMessages: body.readMessages || [body.key] });
    if (action === 'archive-chat') return await proxy(`/message/archiveChat/${instance}`, 'POST', { lastMessage: body.lastMessage, chat: body.chat, archive: body.archive ?? true });
    if (action === 'delete-message') return await proxy(`/message/delete/${instance}`, 'DELETE', { id: body.id, remoteJid: body.remoteJid, fromMe: body.fromMe });
    if (action === 'update-message') return await proxy(`/message/update/${instance}`, 'PUT', { number: body.number, key: body.key, text: body.text });

    // ─── 5. Chat ───
    if (action === 'find-chats') return await proxy(`/chat/findChats/${instance}`, 'POST', { where: body.where || {} });
    // /chat/findMessages nao existe na Evolution GO (GO_GAPS D6): sem a guarda a
    // GO devolve 404 e o chamador engole o erro em Promise.allSettled, virando
    // "sem dados". Alem disso os 404 alimentavam o contador do circuit breaker.
    if (action === 'find-messages') {
      if (isGoFlavor) return goHistoryNotSupported('find-messages', corsHeaders);
      return await proxy(`/chat/findMessages/${instance}`, 'POST', { where: body.where || {}, page: body.page, offset: body.offset });
    }

    if (action === 'find-status-messages') {
      if (isGoFlavor) return goHistoryNotSupported('find-status-messages', corsHeaders);
      const response = await proxy(`/chat/findMessages/${instance}`, 'POST', { where: { key: { remoteJid: 'status@broadcast' } }, page: body.page ?? 1, offset: body.offset ?? 200 });
      const data = await response.json();
      if (data?.error === true) return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const records = Array.isArray(data?.messages?.records) ? data.messages.records : [];
      return new Response(JSON.stringify(records), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'find-contacts') return await proxy(`/chat/findContacts/${instance}`, 'POST', { where: body.where || {} });
    if (action === 'check-numbers') return await proxy(`/chat/whatsappNumbers/${instance}`, 'POST', { numbers: body.numbers });
    if (action === 'get-media-base64') return await proxy(`/chat/getBase64FromMediaMessage/${instance}`, 'POST', { message: body.message, convertToMp4: body.convertToMp4 ?? false });
    if (action === 'delete-for-everyone') return await proxy(`/chat/deleteMessageForEveryone/${instance}`, 'DELETE', body);
    if (action === 'edit-message') return await proxy(`/chat/updateMessage/${instance}`, 'PUT', body);

    // ─── 6. Groups ───
    if (action === 'create-group') return await proxy(`/group/create/${instance}`, 'POST', { subject: body.subject, description: body.description, participants: body.participants });
    if (action === 'list-groups') return await proxy(`/group/fetchAllGroups/${instance}?getParticipants=${body.getParticipants ?? 'false'}`, 'GET');
    if (action === 'group-info') return await proxy(`/group/findGroupInfos/${instance}?groupJid=${body.groupJid}`, 'GET');
    if (action === 'group-participants') return await proxy(`/group/participants/${instance}?groupJid=${body.groupJid}`, 'GET');
    if (action === 'update-group-name') return await proxy(`/group/updateGroupSubject/${instance}`, 'PUT', { groupJid: body.groupJid, subject: body.subject });
    if (action === 'update-group-description') return await proxy(`/group/updateGroupDescription/${instance}`, 'PUT', { groupJid: body.groupJid, description: body.description });
    if (action === 'update-participants') return await proxy(`/group/updateParticipant/${instance}`, 'PUT', { groupJid: body.groupJid, action: body.action, participants: body.participants });
    if (action === 'update-group-setting') return await proxy(`/group/updateSetting/${instance}`, 'PUT', { groupJid: body.groupJid, action: body.action });
    if (action === 'group-invite-code') return await proxy(`/group/inviteCode/${instance}?groupJid=${body.groupJid}`, 'GET');
    if (action === 'revoke-invite-code') return await proxy(`/group/revokeInviteCode/${instance}`, 'PUT', { groupJid: body.groupJid });
    if (action === 'invite-info') return await proxy(`/group/inviteInfo/${instance}?inviteCode=${body.inviteCode}`, 'GET');
    if (action === 'accept-invite') return await proxy(`/group/acceptInviteCode/${instance}`, 'POST', { inviteCode: body.inviteCode });
    if (action === 'leave-group') return await proxy(`/group/leaveGroup/${instance}`, 'DELETE', { groupJid: body.groupJid });
    if (action === 'update-group-picture') return await proxy(`/group/updateGroupPicture/${instance}`, 'PUT', { groupJid: body.groupJid, image: body.image });
    if (action === 'toggle-ephemeral') return await proxy(`/group/toggleEphemeral/${instance}`, 'POST', { groupJid: body.groupJid, expiration: body.expiration });

    // ─── 7. Profile ───
    // Com number → /chat/fetchProfile (traduzido p/ GO /user/info); sem number, própria conta.
    if (action === 'fetch-profile') {
      if (body.number) return await proxy(`/chat/fetchProfile/${instance}`, 'POST', { number: body.number });
      return await proxy(`/profile/fetchProfile/${instance}`, 'GET');
    }
    if (action === 'update-profile-name') return await proxy(`/profile/updateProfileName/${instance}`, 'PUT', { name: body.name });
    if (action === 'update-profile-status') return await proxy(`/profile/updateProfileStatus/${instance}`, 'PUT', { status: body.status });
    if (action === 'update-profile-picture') return await proxy(`/profile/updateProfilePicture/${instance}`, 'PUT', { picture: body.picture });
    if (action === 'remove-profile-picture') return await proxy(`/profile/removeProfilePicture/${instance}`, 'DELETE');
    if (action === 'fetch-profile-picture') return await proxy(`/profile/fetchProfilePicture/${instance}?number=${body.number}`, 'GET');
    if (action === 'fetch-business-profile') return await proxy(`/profile/fetchBusinessProfile/${instance}`, 'POST', { number: body.number });
    if (action === 'update-privacy') {
      // O GO exige os 7 campos no POST /user/privacy (parcial → 400). Faz GET
      // + merge para atualizar só o que veio, sem resetar o resto para 'all'.
      if (isGoFlavor) {
        const instToken = Deno.env.get('EVOLUTION_INSTANCE_TOKEN') ?? evolutionApiKey;
        let current: Record<string, unknown> = {};
        try {
          const curRes = await fetch(`${evolutionApiUrl}/user/privacy`, { headers: { 'apikey': instToken } });
          if (curRes.ok) { const curJson = await curRes.json(); if (curJson?.data && typeof curJson.data === 'object') current = curJson.data; }
        } catch { /* merge best-effort; defaults abaixo seguram */ }
        const pick = (v2Val: unknown, goCurrent: unknown) =>
          (typeof v2Val === 'string' && v2Val) ? v2Val : ((typeof goCurrent === 'string' && goCurrent) ? goCurrent : 'all');
        return await proxy(`/profile/updatePrivacySettings/${instance}`, 'PUT', {
          readreceipts: pick(body.readreceipts, current.ReadReceipts),
          profile: pick(body.profile, current.Profile),
          status: pick(body.status, current.Status),
          online: pick(body.online, current.Online),
          last: pick(body.last, current.LastSeen),
          groupadd: pick(body.groupadd, current.GroupAdd),
          calladd: pick(body.calladd, current.CallAdd),
        });
      }
      return await proxy(`/profile/updatePrivacySettings/${instance}`, 'PUT', { readreceipts: body.readreceipts, profile: body.profile, status: body.status, online: body.online, last: body.last, groupadd: body.groupadd });
    }

    // ─── 8. Labels ───
    if (action === 'find-labels') return await proxy(`/label/findLabels/${instance}`, 'GET');
    if (action === 'handle-label') return await proxy(`/label/handleLabel/${instance}`, 'POST', { number: body.number, labelId: body.labelId, action: body.action });

    // ─── 9-14. Integrations (Chatwoot, Typebot, OpenAI, Dify, Flowise, EvolutionBot) ───
    if (action === 'set-chatwoot') return await proxy(`/chatwoot/set/${instance}`, 'POST', { enabled: body.enabled ?? true, accountId: body.accountId, token: body.token, url: body.url, signMsg: body.signMsg ?? true, reopenConversation: body.reopenConversation ?? true, conversationPending: body.conversationPending ?? false, nameInbox: body.nameInbox, mergeBrazilContacts: body.mergeBrazilContacts ?? true, importContacts: body.importContacts ?? true, importMessages: body.importMessages ?? true, daysLimitImportMessages: body.daysLimitImportMessages ?? 7, signDelimiter: body.signDelimiter, autoCreate: body.autoCreate ?? false });
    if (action === 'get-chatwoot') return await proxy(`/chatwoot/find/${instance}`, 'GET');
    if (action === 'delete-chatwoot') return await proxy(`/chatwoot/delete/${instance}`, 'DELETE');

    if (action === 'set-typebot') return await proxy(`/typebot/set/${instance}`, 'POST', { enabled: body.enabled ?? true, url: body.url, typebot: body.typebot, expire: body.expire ?? 20, keywordFinish: body.keywordFinish ?? '#fim', delayMessage: body.delayMessage ?? 1000, unknownMessage: body.unknownMessage, listeningFromMe: body.listeningFromMe ?? false, stopBotFromMe: body.stopBotFromMe ?? true, keepOpen: body.keepOpen ?? false, debounceTime: body.debounceTime ?? 10, triggerType: body.triggerType, triggerOperator: body.triggerOperator, triggerValue: body.triggerValue });
    if (action === 'get-typebot') return await proxy(`/typebot/find/${instance}`, 'GET');
    if (action === 'delete-typebot') return await proxy(`/typebot/delete/${instance}`, 'DELETE');
    if (action === 'typebot-sessions') return await proxy(`/typebot/fetchSessions/${instance}${body.typebotId ? `?typebotId=${body.typebotId}` : ''}`, 'GET');
    if (action === 'typebot-change-status') return await proxy(`/typebot/changeStatus/${instance}`, 'POST', { remoteJid: body.remoteJid, status: body.status });
    if (action === 'start-typebot') return await proxy(`/typebot/startTypebot/${instance}`, 'POST', { remoteJid: body.remoteJid, url: body.url, typebot: body.typebot, variables: body.variables });

    if (action === 'set-openai') return await proxy(`/openai/set/${instance}`, 'POST', { enabled: body.enabled ?? true, openAiApiKey: body.openAiApiKey, expire: body.expire ?? 30, keywordFinish: body.keywordFinish ?? '#sair', delayMessage: body.delayMessage ?? 1000, listeningFromMe: body.listeningFromMe ?? false, stopBotFromMe: body.stopBotFromMe ?? true, speechToText: body.speechToText ?? false, botType: body.botType ?? 'chatCompletion', assistantId: body.assistantId, model: body.model ?? 'gpt-4o', systemMessage: body.systemMessage, maxTokens: body.maxTokens ?? 500, temperature: body.temperature ?? 0.7, triggerType: body.triggerType ?? 'all', triggerOperator: body.triggerOperator, triggerValue: body.triggerValue, functionUrl: body.functionUrl });
    if (action === 'get-openai') return await proxy(`/openai/find/${instance}`, 'GET');
    if (action === 'delete-openai') return await proxy(`/openai/delete/${instance}`, 'DELETE');

    if (action === 'set-dify') return await proxy(`/dify/set/${instance}`, 'POST', { enabled: body.enabled ?? true, apiUrl: body.apiUrl, apiKey: body.apiKey, botType: body.botType ?? 'chatBot', expire: body.expire ?? 30, triggerType: body.triggerType ?? 'all', keywordFinish: body.keywordFinish, listeningFromMe: body.listeningFromMe ?? false, stopBotFromMe: body.stopBotFromMe ?? true, speechToText: body.speechToText ?? false });
    if (action === 'get-dify') return await proxy(`/dify/find/${instance}`, 'GET');
    if (action === 'delete-dify') return await proxy(`/dify/delete/${instance}`, 'DELETE');

    if (action === 'set-flowise') return await proxy(`/flowise/set/${instance}`, 'POST', { enabled: body.enabled ?? true, apiUrl: body.apiUrl, apiKey: body.apiKey, chatflowId: body.chatflowId, expire: body.expire ?? 30, triggerType: body.triggerType, triggerValue: body.triggerValue });
    if (action === 'get-flowise') return await proxy(`/flowise/find/${instance}`, 'GET');
    if (action === 'delete-flowise') return await proxy(`/flowise/delete/${instance}`, 'DELETE');

    if (action === 'set-evolution-bot') return await proxy(`/evolutionBot/set/${instance}`, 'POST', { enabled: body.enabled ?? true, expire: body.expire ?? 10, keywordFinish: body.keywordFinish ?? '#sair', delayMessage: body.delayMessage ?? 800, triggerType: body.triggerType, triggerOperator: body.triggerOperator, triggerValue: body.triggerValue, unknownMessage: body.unknownMessage, listeningFromMe: body.listeningFromMe ?? false, stopBotFromMe: body.stopBotFromMe ?? true, apiUrl: body.apiUrl, apiKey: body.apiKey });
    if (action === 'get-evolution-bot') return await proxy(`/evolutionBot/find/${instance}`, 'GET');
    if (action === 'delete-evolution-bot') return await proxy(`/evolutionBot/delete/${instance}`, 'DELETE');

    // ─── 15-25. Infrastructure (RabbitMQ, SQS, Templates, Block, PTV, Call, Presence, Catalog, Proxy, EvoAI, N8N, Kafka, NATS, Pusher) ───
    if (action === 'set-rabbitmq') return await proxy(`/rabbitmq/set/${instance}`, 'POST', { enabled: body.enabled ?? true, events: body.events });
    if (action === 'get-rabbitmq') return await proxy(`/rabbitmq/find/${instance}`, 'GET');
    if (action === 'set-sqs') return await proxy(`/sqs/set/${instance}`, 'POST', { enabled: body.enabled ?? true, events: body.events });
    if (action === 'get-sqs') return await proxy(`/sqs/find/${instance}`, 'GET');
    if (action === 'create-template') return await proxy(`/template/create/${instance}`, 'POST', body);
    if (action === 'find-templates') return await proxy(`/template/find/${instance}`, 'GET');
    if (action === 'delete-template') return await proxy(`/template/delete/${instance}`, 'DELETE', body);
    if (action === 'update-block-status') return await proxy(`/chat/updateBlockStatus/${instance}`, 'POST', { number: body.number, status: body.status });
    if (action === 'send-ptv') {
      let videoSource = body.video || body.mediaUrl;
      if (typeof videoSource === 'string') {
        videoSource = await resolvePrivateBucketUrl(callerClient, videoSource, undefined, supabaseUrl);
      }
      return await proxy(`/message/sendPtv/${instance}`, 'POST', { number: body.number, video: videoSource, delay: body.delay });
    }
    if (action === 'offer-call') return await proxy(`/call/offerCall/${instance}`, 'POST', { number: body.number, isVideo: body.isVideo ?? false, callDuration: body.callDuration ?? 5 });
    if (action === 'send-chat-presence') return await proxy(`/chat/sendPresence/${instance}`, 'POST', { number: body.number, presence: body.presence, delay: body.delay ?? 1200 });
    if (action === 'get-catalog') return await proxy(`/business/getCatalog/${instance}`, 'POST', { number: body.number, limit: body.limit, cursor: body.cursor });
    if (action === 'get-collections') return await proxy(`/business/getCollections/${instance}`, 'POST', { number: body.number, limit: body.limit, cursor: body.cursor });
    if (action === 'set-proxy') return await proxy(`/proxy/set/${instance}`, 'POST', { enabled: body.enabled ?? true, host: body.host, port: body.port, protocol: body.protocol, username: body.username, password: body.password });
    if (action === 'get-proxy') return await proxy(`/proxy/find/${instance}`, 'GET');
    if (action === 'set-evoai') return await proxy(`/evoai/set/${instance}`, 'POST', { enabled: body.enabled ?? true, apiUrl: body.apiUrl, apiKey: body.apiKey, agentId: body.agentId, expire: body.expire ?? 30, triggerType: body.triggerType ?? 'all', triggerOperator: body.triggerOperator, triggerValue: body.triggerValue, keywordFinish: body.keywordFinish, delayMessage: body.delayMessage ?? 1000, unknownMessage: body.unknownMessage, listeningFromMe: body.listeningFromMe ?? false, stopBotFromMe: body.stopBotFromMe ?? true, keepOpen: body.keepOpen ?? false, debounceTime: body.debounceTime ?? 10, speechToText: body.speechToText ?? false });
    if (action === 'get-evoai') return await proxy(`/evoai/find/${instance}`, 'GET');
    if (action === 'delete-evoai') return await proxy(`/evoai/delete/${instance}`, 'DELETE');
    if (action === 'set-n8n') return await proxy(`/n8n/set/${instance}`, 'POST', { enabled: body.enabled ?? true, webhookUrl: body.webhookUrl, expire: body.expire ?? 30, triggerType: body.triggerType ?? 'all', triggerOperator: body.triggerOperator, triggerValue: body.triggerValue, keywordFinish: body.keywordFinish, delayMessage: body.delayMessage ?? 1000, unknownMessage: body.unknownMessage, listeningFromMe: body.listeningFromMe ?? false, stopBotFromMe: body.stopBotFromMe ?? true, keepOpen: body.keepOpen ?? false, debounceTime: body.debounceTime ?? 10 });
    if (action === 'get-n8n') return await proxy(`/n8n/find/${instance}`, 'GET');
    if (action === 'delete-n8n') return await proxy(`/n8n/delete/${instance}`, 'DELETE');
    if (action === 'set-kafka') return await proxy(`/kafka/set/${instance}`, 'POST', { enabled: body.enabled ?? true, events: body.events });
    if (action === 'get-kafka') return await proxy(`/kafka/find/${instance}`, 'GET');
    if (action === 'set-nats') return await proxy(`/nats/set/${instance}`, 'POST', { enabled: body.enabled ?? true, events: body.events });
    if (action === 'get-nats') return await proxy(`/nats/find/${instance}`, 'GET');
    if (action === 'set-pusher') return await proxy(`/pusher/set/${instance}`, 'POST', { enabled: body.enabled ?? true, appId: body.appId, key: body.key, secret: body.secret, cluster: body.cluster, events: body.events });
    if (action === 'get-pusher') return await proxy(`/pusher/find/${instance}`, 'GET');

    return new Response(JSON.stringify({ error: 'Unknown action', action }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const log = new Logger('evolution-api');
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error('Unhandled error', { error: message });
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
