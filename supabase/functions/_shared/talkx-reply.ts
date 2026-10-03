/**
 * talkx-reply.ts — Atribuição de resposta do contato a uma campanha Talk X
 *
 * Quando um contato responde a uma mensagem recebida via campanha Talk X,
 * atualiza talkx_recipients.replied_at (e reply_message_id) no
 * destinatário mais recente dentro da janela de 72 h.
 * O trigger trg_talkx_replied_count cuida de incrementar
 * talkx_campaigns.replied_count automaticamente.
 *
 * Não deve ser chamado para keywords de opt-out (verificar antes).
 */

// V18: janela de atribuição configurável via talkx_settings.reply_window_hours
// (cache de 5 min). O default é 72 h — mesmo comportamento de antes.
const DEFAULT_REPLY_WINDOW_HOURS = 72;
let cachedReplyWindowHours: number | null = null;
let cachedReplyWindowAt = 0;

// deno-lint-ignore no-explicit-any
async function getReplyWindowHours(supabase: any): Promise<number> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const now = Date.now();
  if (cachedReplyWindowHours !== null && now - cachedReplyWindowAt < 5 * 60 * 1000) {
    return cachedReplyWindowHours;
  }
  try {
    const { data } = await supabase
      .from('talkx_settings')
      .select('value')
      .eq('key', 'reply_window_hours')
      .maybeSingle();
    const parsed = Number(data?.value);
    if (Number.isFinite(parsed) && parsed > 0) {
      cachedReplyWindowHours = parsed;
      cachedReplyWindowAt = now;
      return parsed;
    }
  } catch {
    // cai no default
  }
  cachedReplyWindowHours = DEFAULT_REPLY_WINDOW_HOURS;
  cachedReplyWindowAt = now;
  return DEFAULT_REPLY_WINDOW_HOURS;
}

// Só para teste: reseta o cache de 5 min (o teste prova que a janela muda).
export function __resetReplyWindowCache(): void {
  cachedReplyWindowHours = null;
  cachedReplyWindowAt = 0;
}

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
 * Atribui a mensagem messageId como resposta de contactId à
 * campanha mais recente que o atingiu nos últimos 72 h.
 * Fire-and-forget: erros são logados mas não propagados.
 */
// deno-lint-ignore no-explicit-any
export async function attributeTalkXReply(
  supabase: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  contactId: string,
  messageId: string,
): Promise<void> {
  try {
    const windowHours = await getReplyWindowHours(supabase);
    const cutoff = new Date(
      Date.now() - windowHours * 60 * 60 * 1000,
    ).toISOString();

    const { data: candidate } = await supabase
      .from('talkx_recipients')
      .select('id, campaign_id')
      .eq('contact_id', contactId)
      .gte('sent_at', cutoff)
      .is('replied_at', null)
      .not('sent_at', 'is', null)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!candidate?.id) return;

    const { error } = await supabase
      .from('talkx_recipients')
      .update({
        replied_at: new Date().toISOString(),
        reply_message_id: messageId,
      })
      .eq('id', candidate.id)
      .is('replied_at', null);

    if (error) {
      console.warn('[E88] Falha ao atribuir resposta TalkX:', error.message);
    } else {
      console.warn('[E88] Resposta atribuida: contact=' + contactId + ' recipient=' + candidate.id + ' campaign=' + candidate.campaign_id);
    }
  } catch (err) {
    console.warn('[E88] Erro inesperado em attributeTalkXReply:', err instanceof Error ? err.message : String(err));
  }
}
