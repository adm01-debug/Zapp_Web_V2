/**
 * Y29 / SEC-SAIDAS_DE_INFORMACAO-01 — a ÚNICA porta de gravação de arquivo do
 * app (Blob + `<a download>`) e o gate de permissão que a protege.
 *
 * Antes: `URL.createObjectURL` + `anchor.click()` apareciam em 8 pontos do
 * repositório (CSV do catálogo, CSV de envios, foto de produto, anexo de
 * e-mail, relatório de diagnóstico, JSON de performance, códigos de backup
 * MFA) e só 2 deles consultavam `profiles.can_download` (MediaPreview /
 * ImagePreview). Agora cada ponto monta o Blob e entrega AQUI; este é o único
 * lugar do repositório que chama `createObjectURL` e `anchor.click`.
 *
 * A permissão vem de `useDownloadPermission()` (hook que lê
 * `profiles.can_download`, fail-closed: erro/ausência de perfil = sem
 * permissão). Quem chama passa o valor lido:
 *
 *   const { canDownload } = useDownloadPermission();
 *   downloadFileWithPermission(blob, 'arquivo.csv', { canDownload });
 *
 * Sem permissão NADA é gravado e o usuário recebe o mesmo aviso já usado nas
 * telas que respeitavam o gate — o retorno `false` deixa o chamador não
 * anunciar um download que não aconteceu.
 */
import { toast } from 'sonner';

export interface DownloadFileOptions {
  /** `profiles.can_download`, lido por `useDownloadPermission()`. */
  canDownload: boolean;
  /**
   * Exceção DECLARADA: o arquivo é do próprio usuário autenticado, não dado de
   * terceiro (hoje: códigos de backup MFA, `MFABackupCodes.tsx`). Exige
   * `reason`.
   */
  allowWithoutPermission?: boolean;
  /** Motivo da exceção — obrigatório quando `allowWithoutPermission` é true. */
  reason?: string;
}

/** Aviso padrão de download bloqueado (mesmo texto de MediaPreview/ImagePreview). */
export function notifyDownloadBlocked(): false {
  toast.error('🔒 Download bloqueado por política de segurança', {
    description:
      'O download de arquivos está desabilitado para proteção de dados. Solicite permissão ao administrador.',
  });
  return false;
}

/**
 * Grava o arquivo no disco do usuário — e só aqui. A permissão é conferida
 * ANTES de criar a object URL: sem `canDownload` (e sem exceção declarada) não
 * há `createObjectURL`, nem anchor, nem clique.
 *
 * @returns `true` quando o arquivo foi entregue; `false` quando bloqueado.
 */
export function downloadFileWithPermission(
  blob: Blob,
  filename: string,
  options: DownloadFileOptions,
): boolean {
  const { canDownload, allowWithoutPermission = false } = options;

  if (!canDownload && !allowWithoutPermission) {
    return notifyDownloadBlocked();
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return true;
}
