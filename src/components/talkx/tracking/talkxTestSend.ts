// talkxTestSend.ts — E47/X067: regra pura do envio de teste da campanha.
//
// O caminho `action: "test"` da edge `talkx-send` já existia (limite X067 de 5 testes
// por 10 minutos, mídia assinada, idempotência IA-047 via `talkx_test_send_claims` e
// auditoria em `talkx_test_sends`), mas nenhuma tela da CAMPANHA o chamava: o
// `sendTest` do `useTalkX` não tinha consumidor e o operador só descobria o texto
// errado depois do disparo para o público inteiro. Estas funções concentram a
// validação do número e a leitura da mensagem de erro da Edge, para o card
// `TalkXTestSendCard` ficar só com a apresentação.

/** Telefone normalizado (só dígitos) quando o número parece completo; `null` quando não. */
export function validTestPhone(raw: string): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

/**
 * Texto legível de um erro de `functions.invoke`. A Edge responde non-2xx com
 * `{ error }` no corpo (ex.: 429 "Limite de envios de teste atingido") e o
 * `FunctionsHttpError` do supabase-js esconde o corpo em `context` — sem lê-lo, o
 * operador só veria "Edge Function returned a non-2xx status code".
 */
export async function testSendErrorMessage(error: unknown): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context && typeof (context as Response).text === 'function') {
    try {
      const text = await (context as Response).text();
      const body = text ? (JSON.parse(text) as { error?: unknown; message?: unknown }) : null;
      const detail = typeof body?.error === 'string' ? body.error : typeof body?.message === 'string' ? body.message : null;
      if (detail) return detail;
    } catch {
      // corpo vazio ou não-JSON: cai na mensagem do próprio erro
    }
  }
  return error instanceof Error && error.message ? error.message : 'Erro desconhecido';
}