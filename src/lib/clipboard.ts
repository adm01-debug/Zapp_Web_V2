/**
 * Cópia para a área de transferência COM confirmação de sucesso.
 *
 * O padrão anterior (`void navigator.clipboard.writeText(x); toast.success('Copiado!')`)
 * anunciava "Copiado!" mesmo quando a escrita falhava — permissão negada,
 * contexto não seguro (iframe), `navigator.clipboard` ausente — e o usuário
 * colava um conteúdo velho achando que tinha copiado o novo.
 *
 * Aqui a cópia é aguardada: `copiarTexto` só resolve `true` quando a escrita
 * (Clipboard API ou o caminho antigo `document.execCommand('copy')`) é
 * confirmada, e `avisarCopia` só mostra "Copiado!" nesse caso. Na falha mostramos
 * um aviso, para o vendedor saber que precisa copiar à mão.
 */
import { toast } from 'sonner';

export const COPIADO = 'Copiado!';
export const FALHA_COPIA = 'Não foi possível copiar. Selecione o texto e copie manualmente.';

/** Caminho antigo: funciona onde a Clipboard API não existe ou foi recusada. */
function copiaViaExecCommand(texto: string): boolean {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false;
  try {
    const area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-9999px';
    document.body.appendChild(area);
    area.select();
    const confirmado = document.execCommand('copy');
    document.body.removeChild(area);
    return confirmado;
  } catch {
    return false;
  }
}

/**
 * Copia `texto` para a área de transferência.
 * Resolve `true` SOMENTE quando a cópia é confirmada; `false` em qualquer falha.
 */
export async function copiarTexto(texto: string): Promise<boolean> {
  const valor = typeof texto === 'string' ? texto : String(texto ?? '');

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(valor);
      return true;
    } catch {
      // permissão negada / contexto não seguro: ainda tenta o caminho antigo
    }
  }

  return copiaViaExecCommand(valor);
}

/**
 * Avisa o resultado da cópia: "Copiado!" só no sucesso, erro caso contrário.
 * Nunca promete cópia que não aconteceu.
 */
export function avisarCopia(ok: boolean): void {
  if (ok) toast.success(COPIADO);
  else toast.error(FALHA_COPIA);
}
