/**
 * CV-096 — Conteúdo de follow-up.
 *
 * Gera o conteúdo ideal para o follow-up baseado no histórico da conversa.
 */
import { useMemo } from 'react';

export interface FollowUpContent {
  subject: string;
  body: string;
  personalization: string[];
}

export interface UseFollowUpContentOptions {
  messages: Array<{ content: string; sender: string }>;
  contactName?: string;
  daysSinceContact: number;
}

const PRODUCT_KEYWORDS: Record<string, string> = {
  caneta: 'canetas personalizadas',
  camiseta: 'camisetas',
  ecobag: 'ecobags',
  squeeze: 'squeezes',
  kit: 'kit de brindes',
  boné: 'bonés',
  mochila: 'mochilas',
};

const EVENT_KEYWORDS = ['evento', 'formatura', 'feira', 'congresso', 'aniversário', 'inauguração'];

export function useFollowUpContent({
  messages,
  contactName,
  daysSinceContact,
}: UseFollowUpContentOptions): FollowUpContent {
  return useMemo(() => {
    const allText = messages.map((m) => m.content).join(' ').toLowerCase();
    const personalization: string[] = [];

    const product = Object.entries(PRODUCT_KEYWORDS).find(([k]) => allText.includes(k));
    if (product) personalization.push(product[1]);

    const event = EVENT_KEYWORDS.find((e) => allText.includes(e));
    if (event) personalization.push(event);

    const name = contactName ? `, ${contactName}` : '';
    const productRef = personalization[0] ?? 'brindes personalizados';

    const body = daysSinceContact <= 2
      ? `Oi${name}! Estava pensando aqui... sobre os ${productRef} que conversamos. Ficou com alguma dúvida ou posso ajudar a avançar no pedido? 😊`
      : daysSinceContact <= 7
      ? `Oi${name}! Passando para ver se você conseguiu pensar nos ${productRef}. Posso tirar qualquer dúvida e já te envio um orçamento atualizado! 😊`
      : `Oi${name}! Tudo bem? Vim aqui para dizer que ainda posso te ajudar com ${productRef}. Temos novidades no catálogo! 🎁`;

    return {
      subject: `Follow-up: ${productRef}`,
      body,
      personalization,
    };
  }, [messages, contactName, daysSinceContact]);
}
