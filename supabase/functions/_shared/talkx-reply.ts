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
 * Não deve ser chamado para keywords de opt-out (verificar antes).
 */

// X028: a janela (talkx_settings.reply_window_hours) é lida DENTRO da RPC
// attribute_talkx_reply. O cálculo client-side que existia aqui e o cache de
// 5 min viraram código morto com a troca e foram removidos.

/**
 * Fonte unica das keywords de opt-out. Era duplicada verbatim entre o
 * handler de opt-out real (E57, que insere em talkx_blacklist) e o filtro
 * de atribuicao de resposta (E88) em evolution-webhook-messages.ts --
 * ambos precisam do MESMO criterio, senao uma mensagem podia contar como
 * "engajamento" (replied_count) sem entrar na blacklist, ou vice-versa.
 *
 * Limitacao conhecida (nao alterada aqui de proposito): so casa a mensagem
 * INTEIRA, nao uma frase que contenha a keyword -- "quero sair da lista,
 * por favor" nao e reconhecida. Ampliar o casamento e uma decisao de
 * produto/compliance (equilibrio entre falso negativo -- pessoa continua
 * recebendo -- e falso positivo -- "nao quero mais bolo" vira opt-out),
 * nao uma correcao tecnica de resposta unica.
 */
export const TALKX_OPT_OUT_RE =
  /^\s*(sair|stop|cancelar|descadastrar|remove|unsubscribe|parar|nao quero|n[ãa]o quero|optout|opt-out)\s*$/i;

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
