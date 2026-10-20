/**
 * talkx-reply.ts — Atribuição de resposta do contato a uma campanha Talk X
 *
 * Quando um contato responde a uma mensagem recebida via campanha Talk X,
 * chama a RPC attribute_talkx_reply (X027/X028), que atualiza
 * talkx_recipients.replied_at (e reply_message_id) no destinatário mais recente
 * dentro da janela configurada em talkx_settings.reply_window_hours.
 * O trigger trg_talkx_replied_count cuida de incrementar
 * talkx_campaigns.replied_count automaticamente.
 *
 * Erros de atribuição não devem ser confundidos com opt-out: quem decide se a
 * mensagem é um pedido de saída é o webhook (X030), que casa as palavras de
 * `talkx_optout_keywords` e responde a botão/lista antes de chamar isto.
 */

// X028: a janela (talkx_settings.reply_window_hours) é lida DENTRO da RPC
// attribute_talkx_reply. O cálculo client-side que existia aqui e o cache de
// 5 min viraram código morto com a troca e foram removidos.

// X030: a lista fixa de palavras de opt-out que vivia aqui
// (`TALKX_OPT_OUT_RE`) foi removida. A fonte unica agora e a tabela
// `talkx_optout_keywords` (X029), lida pelo webhook com cache de 5 min e
// casada pela MESMA normalizacao da RPC `talkx_match_optout`.

// deno-lint-ignore no-explicit-any
export async function attributeMultiplixReply(
  supabase: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  phone: string,
  messageId: string,
  quotedExternalId: string | null = null,
): Promise<void> {
  try {
    const { data, error } = await supabase.rpc('attribute_multiplix_item_reply', {
      p_phone: phone,
      p_message_id: messageId,
      p_quoted_external_id: quotedExternalId,
    });
    if (error) {
      console.warn('[F62] Falha ao atribuir resposta ao item Multiplix:', error.message);
      return;
    }
    if (data?.attributed === true) {
      console.warn(
        `[F62] Resposta atribuida (${data.attribution}): phone=***${phone.slice(-4)} item=${data.item_id}`,
      );
    }
  } catch (err) {
    console.warn('[F62] Erro inesperado em attributeMultiplixReply:', err instanceof Error ? err.message : String(err));
  }
}

/**
 * Atribui a mensagem messageId como resposta do contato à campanha Talk X mais
 * recente que o atingiu dentro de `talkx_settings.reply_window_hours`.
 *
 * X028: a atribuição agora é feita pela RPC `attribute_talkx_reply`
 * (SECURITY DEFINER, service_role). Ela casa por contact_id OU pelo telefone
 * normalizado (sufixo de 8 dígitos, cobre contato LID/duplicado) e lê a janela
 * do banco — por isso o telefone resolvido entra como `p_phone`: sem ele uma
 * resposta de contato duplicado ficaria sem atribuição.
 *
 * Erros são logados mas NÃO propagados: a resposta do contato não pode falhar
 * porque a atribuição falhou. O chamador no webhook AGUARDA (await) esta função
 * para garantir o efeito no banco antes de encerrar o processamento.
 */
// deno-lint-ignore no-explicit-any
export async function attributeTalkXReply(
  supabase: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  contactId: string | null,
  phone: string | null,
  messageId: string,
): Promise<void> {
  try {
    const { data, error } = await supabase.rpc('attribute_talkx_reply', {
      p_contact_id: contactId,
      p_phone: phone,
      p_message_id: messageId,
    });

    if (error) {
      console.warn('[E88] Falha ao atribuir resposta TalkX:', error.message);
      return;
    }
    if (data?.attributed === true) {
      console.warn(
        `[E88] Resposta atribuida (${data.attribution}): recipient=${data.recipient_id} campaign=${data.campaign_id}`,
      );
    }
  } catch (err) {
    console.warn('[E88] Erro inesperado em attributeTalkXReply:', err instanceof Error ? err.message : String(err));
  }
}
