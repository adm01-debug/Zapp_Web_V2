export const MAX_EMAIL_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_EMAIL_ATTACHMENT_COUNT = 10;

export interface EmailAttachmentPayload {
  filename: string;
  mimeType: string;
  content: string;
}

export interface EmailAttachmentDescriptor {
  name: string;
  size: number;
}

export function validateEmailAttachments(files: File[], additional: EmailAttachmentDescriptor[] = []): string | null {
  if (files.length + additional.length > MAX_EMAIL_ATTACHMENT_COUNT) return `Selecione no máximo ${MAX_EMAIL_ATTACHMENT_COUNT} anexos.`;
  const total = files.reduce((sum, file) => sum + file.size, 0) + additional.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_EMAIL_ATTACHMENT_BYTES) return 'Tamanho total dos anexos excede 25MB';
  if ([...files.map(file => file.name), ...additional.map(file => file.name)].some(name => /\r|\n|[\\/"]/.test(name))) return 'Um dos anexos possui nome inválido.';
  return null;
}

export function normalizeEmailBase64(content: string): string {
  const normalized = content.replace(/-/g, '+').replace(/_/g, '/');
  return normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
}

export function fileToEmailAttachment(file: File): Promise<EmailAttachmentPayload> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const encoded = typeof reader.result === 'string' ? reader.result.split(',', 2)[1] : undefined;
      if (!encoded) {
        reject(new Error(`Não foi possível preparar o anexo ${file.name}.`));
        return;
      }
      resolve({ filename: file.name, mimeType: file.type || 'application/octet-stream', content: encoded });
    };
    reader.onerror = () => reject(reader.error ?? new Error(`Falha ao ler ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

export function formatEmailFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
