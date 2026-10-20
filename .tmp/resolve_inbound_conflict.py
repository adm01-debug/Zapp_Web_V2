from pathlib import Path
path = Path('supabase/functions/_shared/evolution-webhook-messages.ts')
text = path.read_text()
text = text.replace('import { attributeMultiplixReply, attributeTalkXReply } from "./talkx-reply.ts";\n\n', '')
start = text.index('<<<<<<< HEAD\n  // Uma transacao (migration 20260905050000): find-or-create')
end = text.index('\n}\n\n/**\n * F62: extrai o `external_id`', start)
block = '''  // R2-API-006: palavra de opt-out e citacao viajam na MESMA transacao do ingest
  // (a RPC grava mensagem + efeitos pendentes; a reentrega retoma o que faltou).
  // X030/X064: por palavra configurada (mesma normalizacao da RPC) OU botao/lista
  // `talkx_optout` — avaliado so para mensagem recebida (nunca a nossa).
  const optOutKeyword = key.fromMe
    ? null
    : interactiveResponseId === TALKX_OPTOUT_BUTTON_ID
    ? TALKX_OPTOUT_BUTTON_ID
    : messageType === 'text' && content
    ? await resolveOptOutKeyword(supabase, content)
    : null;
  const quotedExternalId = extractQuotedExternalId(data);

  // Uma transacao (20260905050000 + outbox R2-API-006): contato find-or-create
  // (variantes do 9o digito, relink) + upsert idempotente + efeitos pendentes
  // (opt-out OU respostas — nunca os dois).
  const { data: txRows, error: txError } = await supabase.rpc('ingest_inbound_message', {
    p_connection_id: connection.id,
    p_phone: phone,
    p_push_name: (data.pushName as string) || null,
    p_content: content,
    p_message_type: messageType,
    p_media_url: mediaUrl,
    p_external_id: key.id,
    p_created_at: messageCreatedAt,
    p_from_me: key.fromMe === true,
    p_opt_out_keyword: optOutKeyword,
    p_quoted_external_id: quotedExternalId,
  });
  if (txError) {
    console.error('[INCOMING] ingest_inbound_message failed:', { code: txError.code, message: txError.message, externalId: key.id, bestJid, phone, messageType });
    // R2-API-006: engolir o erro seria "mensagem perdida"; a excecao vira 500 e a
    // Evolution reentrega a operacao inteira.
    throw new Error(`ingest_inbound_message falhou (${txError.code ?? 'sem_codigo'}): ${txError.message}`);
  }
  const tx = (Array.isArray(txRows) ? txRows[0] : txRows) as {
    contact_id: string; contact_name: string | null; assigned_to: string | null; avatar_url: string | null;
    contact_created: boolean; message_id: string | null; outcome: 'inserted' | 'updated' | 'duplicate';
  } | null;
  if (!tx?.contact_id) {
    console.error('[INCOMING] ingest_inbound_message returned no contact', { externalId: key.id, phone });
    return;
  }

  // Avatar fica fora da transacao: chamada externa a Evolution GO.
  if (tx.contact_created || !tx.avatar_url || isWhatsAppCdnUrl(tx.avatar_url)) {
    const picUrl = await fetchProfilePicFromApi(instance, phone);
    if (picUrl) {
      const avatarUrl = await persistProfilePicture(supabase, phone, picUrl);
      if (avatarUrl) await supabase.from('contacts').update({ avatar_url: avatarUrl }).eq('id', tx.contact_id);
    }
  }

  // R2-API-006: a drenagem roda em TODA entrega — inclusive 'duplicate', que
  // antes saia sem retomar nada. A RPC aplica e baixa na mesma transacao; falha
  // fica pendente (last_error). Erro e pendencia sao lancados (500 -> reentrega).
  const { data: drainData, error: drainErr } = await supabase.rpc('drain_inbound_message_effects', {
    p_connection_id: connection.id,
    p_external_id: key.id,
  });
  if (drainErr) {
    console.error('[INCOMING] drain_inbound_message_effects failed:', { code: drainErr.code, message: drainErr.message, externalId: key.id });
    throw new Error(`drain_inbound_message_effects falhou (${drainErr.code ?? 'sem_codigo'}): ${drainErr.message}`);
  }
  const drain = (drainData ?? null) as {
    suppression_id: string | null;
    optout_status: 'suppressed' | 'already_suppressed' | 'no_recent_send' | 'invalid_phone' | null;
    talkx_reply: { attributed?: boolean; attribution?: string | null; recipient_id?: string; campaign_id?: string } | null;
    multiplix_reply: { attributed?: boolean; attribution?: string | null; item_id?: string; dispatch_id?: string } | null;
    pending_failed: number;
  } | null;
  if (drain && drain.pending_failed > 0) {
    console.error('[INCOMING] drain_inbound_message_effects deixou efeito pendente:', { externalId: key.id, pending_failed: drain.pending_failed });
    throw new Error(`drain_inbound_message_effects: ${drain.pending_failed} efeito(s) pendente(s) apos erro`);
  }

  if (tx.outcome === 'duplicate') {
    console.warn(`[INCOMING] Duplicate delivery — efeitos drenados pela outbox: ${key.id}`);
  }
  if (tx.outcome !== 'duplicate' && tx.message_id) {
    if (messageType === 'audio' && mediaUrl) await handleAudioTranscription(supabase, tx.contact_id, tx.message_id, mediaUrl, supabaseUrl, supabaseServiceKey);
    if (tx.outcome === 'inserted' && messageType === 'text' && content) {
      void enrichIncomingLinkPreview(supabase, tx.message_id, content, supabaseUrl, supabaseServiceKey);
    }
  }

  // E57/E59: a confirmacao so sai quando a drenagem criou supressao NOVA
  // (suppression_id nao-nulo) — a autoresposta nunca sai duas vezes.
  if (drain?.suppression_id) {
    const resolvedPhone = phone ?? ((key.remoteJid ?? '').split('@')[0].replace(/\D/g, ''));
    console.warn('[OPT-OUT] ' + resolvedPhone + ' adicionado a talkx_blacklist (' + optOutKeyword + ')');
    // E59: mensagem de confirmacao. O texto vem de
    // talkx_settings.optout_autoreply e sai pelo token da INSTANCIA que
    // recebeu a mensagem (resolvido no Vault via get_instance_token).
    try {
      const evolutionUrl = Deno.env.get('EVOLUTION_API_URL')?.replace(/\/+$/, '');
      const evolutionKey = Deno.env.get('EVOLUTION_API_KEY') ?? '';
      const autoReply = await loadOptOutAutoreply(supabase);
      if (evolutionUrl && autoReply) {
        const { data: tokenData } = await supabase.rpc('get_instance_token', { p_instance_id: instance });
        const instanceToken = typeof tokenData === 'string' && tokenData.length > 0 ? tokenData : null;
        if (!instanceToken) {
          console.warn('[OPT-OUT] Token da instancia ausente — confirmacao nao enviada (' + instance + ')');
        } else {
          const resp = await evoFetch(evolutionUrl, evolutionKey, '/message/sendText/' + instance, {
            number: resolvedPhone,
            text: autoReply,
            delay: 500,
          }, undefined, undefined, AbortSignal.timeout(15000), instanceToken);
          if (resp.ok) {
            console.warn(
              '[OPT-OUT] Confirmacao enviada (accepted, status ' + resp.status + ') para ' + resolvedPhone,
            );
          } else {
            const detalhe = (await resp.text().catch(() => '')).slice(0, 200);
            console.warn(
              '[OPT-OUT] Confirmacao RECUSADA pelo provedor (rejected, status ' + resp.status + ') para ' +
                resolvedPhone + (detalhe ? ' — ' + detalhe : ''),
            );
          }
        }
      }
    } catch (notifErr) {
      // R2-API-008: sem resposta HTTP (timeout, DNS, rede) o desfecho é `unknown`
      // — não dá para afirmar que a confirmação saiu.
      console.warn(
        '[OPT-OUT] Confirmacao sem resposta do provedor (unknown):',
        notifErr instanceof Error ? notifErr.message : String(notifErr),
      );
    }
  } else if (optOutKeyword && drain?.optout_status === 'already_suppressed') {
    console.warn('[OPT-OUT] ' + phone + ' ja suprimido (idempotente): confirmacao nao reenviada');
  } else if (optOutKeyword && drain?.optout_status === 'no_recent_send') {
    console.warn('[OPT-OUT] Ignorado (sem campanha recente) para ', phone);
  }

  // E88/F62: resultados das atribuicoes aplicadas pela drenagem (observabilidade).
  if (drain?.talkx_reply?.attributed === true) {
    console.warn(`[E88] Resposta atribuida (${drain.talkx_reply.attribution}): recipient=${drain.talkx_reply.recipient_id} campaign=${drain.talkx_reply.campaign_id}`);
  }
  if (drain?.multiplix_reply?.attributed === true) {
    console.warn(`[F62] Resposta atribuida (${drain.multiplix_reply.attribution}): phone=***${(phone ?? '').slice(-4)} item=${drain.multiplix_reply.item_id}`);
  }'''
text = text[:start] + block + text[end:]
if '<<<<<<<' in text or '=======' in text or '>>>>>>>' in text:
    raise SystemExit('conflict markers remain')
path.write_text(text)
