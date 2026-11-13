/** Durações aceitas pelo WhatsApp para mensagens temporárias (segundos; 0 = desligado). */
export const EPHEMERAL_OPTIONS = [
  { value: '0', label: 'Desligado' },
  { value: '86400', label: '24 horas' },
  { value: '604800', label: '7 dias' },
  { value: '7776000', label: '90 dias' },
] as const;

/** Extrai o código de um link `chat.whatsapp.com/<código>` (ou devolve o próprio código). */
export function extrairCodigoConvite(entrada: string): string {
  const texto = entrada.trim();
  const m = texto.match(/chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9]+)/);
  return m ? m[1] : texto;
}
