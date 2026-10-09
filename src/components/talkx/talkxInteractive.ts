/**
 * X096 (V4) — regra da mensagem interativa do TEMPLATE, extraída para função pura.
 *
 * Espelha `talkx_validate_interactive(jsonb)` (X083 · CAP-060), que vira CHECK nas
 * tabelas de template, versão e variante: botões (até 3; resposta rápida ou link
 * `https`; rótulo até 20) e enquete (pergunta até 255; 2 a 12 opções).
 *
 * Por que a regra mora aqui: enquanto a coluna `interactive` não existe no banco
 * (X083) e o envio não tem fallback (X064), esta é a única implementação da regra.
 * O editor (X096), a prévia (X088) e o envio (X064) têm de usar ESTA função, para
 * que o que o editor aceita seja exatamente o que o banco e o provedor aceitam —
 * três cópias da mesma regra é como nasce o dado que o WhatsApp recusa.
 */

/** Botão de resposta rápida (o cliente responde com o texto do rótulo) ou link. */
export type TalkxInteractiveButtonType = 'reply' | 'link';

export interface TalkxInteractiveButton {
  type: TalkxInteractiveButtonType;
  /** Rótulo mostrado no botão — até `MAX_BUTTON_LABEL` caracteres. */
  label: string;
  /** Obrigatório (e só) no tipo `link`; precisa começar com `https://`. */
  url?: string;
}

export interface TalkxInteractivePoll {
  question: string;
  options: string[];
}

/** Forma gravada na coluna `interactive`: OU botões, OU enquete — nunca os dois. */
export interface TalkxInteractive {
  buttons?: TalkxInteractiveButton[];
  poll?: TalkxInteractivePoll;
}

/** Modo escolhido no editor: "Nenhum · Botões · Enquete". */
export type TalkxInteractiveMode = 'none' | 'buttons' | 'poll';

export const MAX_INTERACTIVE_BUTTONS = 3;
export const MAX_BUTTON_LABEL = 20;
export const MAX_POLL_QUESTION = 255;
export const MIN_POLL_OPTIONS = 2;
export const MAX_POLL_OPTIONS = 12;

/** Atalho "Satisfação (4 emojis)" do editor (X096). */
export const SATISFACTION_POLL: TalkxInteractivePoll = {
  question: 'Como você avalia o nosso atendimento?',
  options: ['😍 Excelente', '🙂 Bom', '😐 Regular', '😞 Ruim'],
};

export interface TalkxInteractiveValidation {
  ok: boolean;
  errors: string[];
}

/** Modo a partir do valor gravado (vazio/inválido cai em `none`). */
export function talkxInteractiveMode(value: TalkxInteractive | null | undefined): TalkxInteractiveMode {
  if (!value) return 'none';
  if (Array.isArray(value.buttons) && value.buttons.length > 0) return 'buttons';
  if (value.poll) return 'poll';
  return 'none';
}

function isHttps(url: string | undefined): boolean {
  return typeof url === 'string' && /^https:\/\/\S+$/i.test(url.trim());
}

/**
 * Mesma regra do CHECK do banco. `null`/`{}` é válido (template sem interativo);
 * qualquer desvio devolve `errors` em pt-BR, com uma mensagem por problema.
 */
export function validateTalkxInteractive(value: TalkxInteractive | null | undefined): TalkxInteractiveValidation {
  const errors: string[] = [];
  if (!value) return { ok: true, errors };

  const hasButtons = Array.isArray(value.buttons) && value.buttons.length > 0;
  const hasPoll = !!value.poll;

  if (hasButtons && hasPoll) {
    errors.push('Escolha botões ou enquete, não os dois.');
  }

  if (Array.isArray(value.buttons)) {
    if (value.buttons.length > MAX_INTERACTIVE_BUTTONS) {
      errors.push(`No máximo ${MAX_INTERACTIVE_BUTTONS} botões.`);
    }
    value.buttons.forEach((button, index) => {
      const label = (button?.label ?? '').trim();
      if (!label) errors.push(`Botão ${index + 1}: informe o rótulo.`);
      else if (label.length > MAX_BUTTON_LABEL) errors.push(`Botão ${index + 1}: rótulo com mais de ${MAX_BUTTON_LABEL} caracteres.`);
      if (button?.type === 'link') {
        if (!isHttps(button.url)) errors.push(`Botão ${index + 1}: o link precisa começar com https://.`);
      } else if (button?.type !== 'reply') {
        errors.push(`Botão ${index + 1}: tipo inválido.`);
      }
    });
  }

  if (value.poll) {
    const question = (value.poll.question ?? '').trim();
    if (!question) errors.push('Enquete: informe a pergunta.');
    else if (question.length > MAX_POLL_QUESTION) errors.push(`Enquete: pergunta com mais de ${MAX_POLL_QUESTION} caracteres.`);
    const options = value.poll.options ?? [];
    if (options.length < MIN_POLL_OPTIONS) errors.push(`Enquete: mínimo de ${MIN_POLL_OPTIONS} opções.`);
    if (options.length > MAX_POLL_OPTIONS) errors.push(`Enquete: máximo de ${MAX_POLL_OPTIONS} opções.`);
    if (options.some((option) => !option.trim())) errors.push('Enquete: nenhuma opção pode ficar vazia.');
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Texto reserva: o que o cliente recebe quando o aparelho não exibe botão nem
 * enquete (X064 manda este texto na nova tentativa). Formato:
 *   <corpo da mensagem>
 *   1. <rótulo do botão de link>: <url>
 *   Enquete: <pergunta>
 *   1. <opção>
 * Botão de resposta rápida não entra na lista: o cliente responde com o próprio
 * rótulo, sem link para clicar.
 */
export function talkxInteractiveReserveText(value: TalkxInteractive | null | undefined, body = ''): string {
  const lines: string[] = [];
  const trimmedBody = body.trim();
  if (trimmedBody) lines.push(trimmedBody);

  const mode = talkxInteractiveMode(value);

  if (mode === 'buttons') {
    (value?.buttons ?? []).forEach((button, index) => {
      const url = button?.type === 'link' ? button.url?.trim() : '';
      if (url) lines.push(`${index + 1}. ${button.label.trim()}: ${url}`);
    });
  } else if (mode === 'poll' && value?.poll) {
    lines.push(`Enquete: ${value.poll.question.trim()}`);
    value.poll.options.forEach((option, index) => {
      const trimmed = option.trim();
      if (trimmed) lines.push(`${index + 1}. ${trimmed}`);
    });
  }

  return lines.join('\n');
}
