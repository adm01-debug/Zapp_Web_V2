/**
 * Contratos de entrada versionados por endpoint (`nome@vN`).
 *
 * Cada Edge declara aqui o seu contrato e USA-o na validação do handler, em
 * vez de espalhar constantes mágicas pelo código da função. Endpoint de
 * `multipart/form-data` (upload de arquivo) não passa pelo validador JSON
 * compartilhado (`parseBody`/`parseOrReject`, que só entende corpo JSON
 * desserializado): o contrato registra os limites e o portão do upload os
 * aplica (no file-security-scanner, `validateScanUpload`).
 */

export const FILE_SECURITY_SCANNER_V1 = {
  /** Nome versionado do contrato, ecoado no envelope de erro (`contract`). */
  name: "file-security-scanner@v1",
  /** Teto de envio: a API `/api/v3/files` do VirusTotal recusa acima de 32 MiB. */
  maxBytes: 32 * 1024 * 1024,
  /** Upload exige arquivo presente e não vazio; ausente/vazio → 400 INVALID_INPUT. */
  fileRequired: true,
} as const;

export type FileSecurityScannerContractV1 = typeof FILE_SECURITY_SCANNER_V1;
