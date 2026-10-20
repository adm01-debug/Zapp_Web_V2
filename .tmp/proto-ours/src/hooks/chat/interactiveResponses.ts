/**
 * Resposta do cliente a botão/lista: o id selecionado volta no `content` da mensagem
 * (`interactiveResponseId`), sem o texto que o cliente tocou. O título vive no payload
 * IMUTÁVEL da mensagem interativa enviada — `media_meta->outbound_delivery_payload`
 * (contrato da edge `message-delivery`: `buttons[].id`/`displayText`,
 * `sections[].rows[].id`/`title`). Este módulo casa o id devolvido com o payload da
 * conversa e devolve `buttonResponse`/`listResponse`, que é o que o balão já sabe
 * desenhar (ButtonResponseBadge / ListResponseBadge).
 *
 * Sem essa resolução o balão mostra o id cru ("b1", "r1") no lugar da escolha do cliente.
 */
import type { Message } from '@/types/chat';

type ResponseTarget =
  | { kind: 'button'; buttonId: string; buttonTitle: string }
  | { kind: 'list'; sectionTitle: string; itemTitle: string };

const OUTBOUND_PAYLOAD_KEY = 'outbound_delivery_payload';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Texto útil (não vazio). `null` para qualquer outra coisa, inclusive string em branco. */
function readText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/**
 * Indexa os alvos (botão/linha de lista) do payload imutável de uma mensagem
 * interativa ENVIADA. O id é a chave com que o cliente responde.
 */
function indexOutboundPayload(message: Message, index: Map<string, ResponseTarget>) {
  const meta = message.media_meta;
  if (!isRecord(meta)) return;
  const payload = meta[OUTBOUND_PAYLOAD_KEY];
  if (!isRecord(payload)) return;

  if (Array.isArray(payload.buttons)) {
    for (const raw of payload.buttons) {
      if (!isRecord(raw)) continue;
      const id = readText(raw.id);
      // `displayText` é o contrato da edge `message-delivery`; `title` é o rótulo que o
      // builder do inbox usa no botão (`InteractiveMessageBuilder`).
      const buttonTitle = readText(raw.displayText) ?? readText(raw.title);
      if (!id || !buttonTitle) continue;
      index.set(id, { kind: 'button', buttonId: id, buttonTitle });
    }
  }

  if (Array.isArray(payload.sections)) {
    for (const rawSection of payload.sections) {
      if (!isRecord(rawSection)) continue;
      const sectionTitle = readText(rawSection.title) ?? '';
      if (!Array.isArray(rawSection.rows)) continue;
      for (const rawRow of rawSection.rows) {
        if (!isRecord(rawRow)) continue;
        const id = readText(rawRow.id);
        const itemTitle = readText(rawRow.title);
        if (!id || !itemTitle) continue;
        index.set(id, { kind: 'list', sectionTitle, itemTitle });
      }
    }
  }
}

/**
 * Devolve as mesmas mensagens com `buttonResponse`/`listResponse` preenchidos nas
 * respostas do cliente. Espera a lista em ORDEM CRONOLÓGICA (é o contrato da lista que
 * `useMessages` entrega): o payload só vale para respostas que vieram depois dele.
 * A identidade da lista é preservada quando nada muda (evita render extra).
 */
export function resolveInteractiveResponses(messages: Message[]): Message[] {
  if (messages.length === 0) return messages;

  const index = new Map<string, ResponseTarget>();
  let mudou = false;

  const resolved = messages.map((message) => {
    indexOutboundPayload(message, index);

    if (message.sender !== 'contact' || message.buttonResponse || message.listResponse) return message;
    const selectedId = readText(message.content);
    if (!selectedId) return message;
    const target = index.get(selectedId);
    if (!target) return message;

    mudou = true;
    return target.kind === 'button'
      ? {
          ...message,
          buttonResponse: { buttonId: target.buttonId, buttonTitle: target.buttonTitle },
        }
      : {
          ...message,
          listResponse: { sectionTitle: target.sectionTitle, itemTitle: target.itemTitle },
        };
  });

  return mudou ? resolved : messages;
}
