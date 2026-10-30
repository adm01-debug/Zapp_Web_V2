// WhatsApp supported file types and size limits
// Based on official WhatsApp Business API documentation

export interface FileTypeConfig {
  extensions: string[];
  mimeTypes: string[];
  maxSizeMB: number;
  category: 'image' | 'video' | 'audio' | 'document' | 'sticker';
  label: string;
}

export const WHATSAPP_FILE_TYPES: Record<string, FileTypeConfig> = {
  image: {
    extensions: ['.jpg', '.jpeg', '.png', '.webp'],
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeMB: 16,
    category: 'image',
    label: 'Imagem'
  },
  video: {
    extensions: ['.mp4', '.3gp'],
    mimeTypes: ['video/mp4', 'video/3gpp'],
    maxSizeMB: 16,
    category: 'video',
    label: 'Vídeo'
  },
  audio: {
    extensions: ['.aac', '.amr', '.mp3', '.ogg', '.opus', '.m4a'],
    mimeTypes: [
      'audio/aac',
      'audio/amr',
      'audio/mpeg',
      'audio/ogg',
      'audio/opus',
      'audio/mp4'
    ],
    maxSizeMB: 16,
    category: 'audio',
    label: 'Áudio'
  },
  document: {
    extensions: [
      '.pdf',
      '.doc',
      '.docx',
      '.xls',
      '.xlsx',
      '.ppt',
      '.pptx',
      '.txt',
      '.csv',
      '.zip',
      '.rar'
    ],
    mimeTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv',
      'application/zip',
      'application/x-rar-compressed',
      'application/vnd.rar'
    ],
    maxSizeMB: 100,
    category: 'document',
    label: 'Documento'
  },
  sticker: {
    extensions: ['.webp'],
    mimeTypes: ['image/webp'],
    maxSizeMB: 0.5, // 500KB
    category: 'sticker',
    label: 'Sticker'
  }
};

// Get all allowed file extensions
export const getAllowedExtensions = (): string[] => {
  return Object.values(WHATSAPP_FILE_TYPES).flatMap(config => config.extensions);
};

// Get all allowed MIME types
export const getAllowedMimeTypes = (): string[] => {
  return Object.values(WHATSAPP_FILE_TYPES).flatMap(config => config.mimeTypes);
};

// Get accept string for file input
export const getFileInputAccept = (): string => {
  return getAllowedMimeTypes().join(',');
};

// Validate file type and size
export interface FileValidationResult {
  valid: boolean;
  error?: string;
  category?: FileTypeConfig['category'];
  maxSizeMB?: number;
}

import { getFileExtensionWithDefault } from './fileExtensions';

export const validateFile = (file: File): FileValidationResult => {
  const mimeType = file.type.toLowerCase();
  const extension = '.' + getFileExtensionWithDefault(file.name, '');
  const fileSizeMB = file.size / (1024 * 1024);

  // Find matching file type config
  for (const [key, config] of Object.entries(WHATSAPP_FILE_TYPES)) {
    const matchesMime = config.mimeTypes.includes(mimeType);
    const matchesExt = config.extensions.includes(extension);

    if (matchesMime || matchesExt) {
      if (fileSizeMB > config.maxSizeMB) {
        return {
          valid: false,
          error: `Arquivo muito grande. O limite para ${config.label.toLowerCase()} é ${config.maxSizeMB}MB. Seu arquivo tem ${fileSizeMB.toFixed(2)}MB.`,
          category: config.category,
          maxSizeMB: config.maxSizeMB
        };
      }
      return {
        valid: true,
        category: config.category,
        maxSizeMB: config.maxSizeMB
      };
    }
  }

  return {
    valid: false,
    error: `Tipo de arquivo não suportado: ${mimeType || extension}. Formatos aceitos: imagens (JPG, PNG, WebP), vídeos (MP4, 3GP), áudios (AAC, MP3, OGG, OPUS, M4A), documentos (PDF, DOC, XLS, PPT, TXT, CSV, ZIP, RAR).`
  };
};

// ── Verificação de conteúdo (assinatura/magic bytes) — U8 (doc 11) ──────────────
// `validateFile` confere só o tipo e o tamanho DECLARADOS (MIME/extensão), que vêm do
// cliente: um `.exe` renomeado `.pdf` passa. Aqui leem-se os primeiros 16 bytes do
// arquivo e recusa-se quando uma assinatura CONHECIDA contradiz a categoria declarada.
// A proteção é parcial por desenho: tipo sem assinatura confiável (texto, csv) ou
// conteúdo não reconhecido segue pela regra declarada — só "detectado e diferente" barra.

export interface FileSignature {
  family: string;
  categories: FileTypeConfig['category'][];
}

const startsWithBytes = (head: Uint8Array, bytes: number[]): boolean =>
  bytes.every((b, i) => (head[i] ?? -1) === b);

const bytes4 = (head: Uint8Array, offset: number): string =>
  String.fromCharCode(head[offset] ?? 0, head[offset + 1] ?? 0, head[offset + 2] ?? 0, head[offset + 3] ?? 0);

/** Detecção de assinatura a partir dos primeiros 16 bytes. `null` = desconhecida. */
export const detectFileSignature = (head: Uint8Array): FileSignature | null => {
  if (head.length < 4) return null;
  // Executáveis nunca são anexo válido do WhatsApp.
  if (startsWithBytes(head, [0x4d, 0x5a])) return { family: 'executável', categories: [] }; // MZ (PE/EXE/DLL)
  if (startsWithBytes(head, [0x7f, 0x45, 0x4c, 0x46])) return { family: 'executável', categories: [] }; // ELF
  if (startsWithBytes(head, [0x25, 0x50, 0x44, 0x46])) return { family: 'pdf', categories: ['document'] };
  if (startsWithBytes(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { family: 'png', categories: ['image'] };
  if (startsWithBytes(head, [0xff, 0xd8, 0xff])) return { family: 'jpeg', categories: ['image'] };
  const head6 = [0, 1, 2, 3, 4, 5].map(i => head[i] ?? 0);
  if (String.fromCharCode(...head6) === 'GIF87a' || String.fromCharCode(...head6) === 'GIF89a') {
    return { family: 'gif', categories: [] }; // WhatsApp não aceita GIF
  }
  if (bytes4(head, 0) === 'RIFF' && bytes4(head, 8) === 'WEBP') return { family: 'webp', categories: ['image'] };
  if (bytes4(head, 0) === 'OggS') return { family: 'ogg', categories: ['audio'] };
  if (
    bytes4(head, 0) === 'ID3' ||
    startsWithBytes(head, [0xff, 0xfb]) || startsWithBytes(head, [0xff, 0xf3]) ||
    startsWithBytes(head, [0xff, 0xf2]) || startsWithBytes(head, [0xff, 0xfa])
  ) return { family: 'mp3', categories: ['audio'] };
  if (bytes4(head, 0) === '#!AM') return { family: 'amr', categories: ['audio'] }; // #!AMR
  // EBML vale tanto para vídeo quanto para áudio (voz gravada no navegador): não fixar vídeo.
  if (startsWithBytes(head, [0x1a, 0x45, 0xdf, 0xa3])) return { family: 'webm', categories: ['video', 'audio'] };
  // ISO BMFF: `ftyp` no offset 4 é genérico — a marca (offset 8) diz se é m4a (áudio) ou 3gp (vídeo).
  if (bytes4(head, 4) === 'ftyp') {
    const brand = bytes4(head, 8);
    if (brand.startsWith('M4A') || brand.startsWith('M4B')) return { family: 'm4a', categories: ['audio'] };
    if (brand.startsWith('3gp') || brand.startsWith('3g2')) return { family: '3gp', categories: ['video'] };
    return { family: 'mp4', categories: ['video', 'audio'] }; // isom/mp42/avc1 também carregam m4a
  }
  if (startsWithBytes(head, [0x50, 0x4b, 0x03, 0x04])) return { family: 'zip', categories: ['document'] }; // docx/xlsx/pptx/zip
  if (startsWithBytes(head, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07])) return { family: 'rar', categories: ['document'] };
  if (startsWithBytes(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return { family: 'ole', categories: ['document'] }; // doc/xls/ppt
  return null;
};

const categoryFromFileName = (name: string): FileTypeConfig['category'] | null => {
  const extension = '.' + getFileExtensionWithDefault(name, '');
  for (const config of Object.values(WHATSAPP_FILE_TYPES)) {
    if (config.extensions.includes(extension)) return config.category;
  }
  return null;
};

const readFileHead = async (file: File, length = 16): Promise<Uint8Array> => {
  try {
    const buffer = await file.slice(0, length).arrayBuffer();
    return new Uint8Array(buffer);
  } catch {
    return new Uint8Array(0); // Sem leitura não bloqueia: segue a regra declarada.
  }
};

/**
 * Confere o CONTEÚDO (primeiros 16 bytes) contra a categoria declarada pelo arquivo.
 * Só recusa quando uma assinatura conhecida contradiz o tipo informado — tipo sem
 * assinatura confiável ou conteúdo desconhecido passa (a regra declarada decide).
 */
export const validateFileContent = async (file: File): Promise<FileValidationResult> => {
  const head = await readFileHead(file, 16);
  const signature = detectFileSignature(head);
  if (!signature) return { valid: true };

  const declared = getFileCategory(file.type) ?? categoryFromFileName(file.name);
  if (!declared || signature.categories.includes(declared)) {
    return { valid: true, category: declared ?? undefined };
  }

  const declaredLabel = file.type || ('.' + getFileExtensionWithDefault(file.name, ''));
  return {
    valid: false,
    category: declared,
    error: `Arquivo recusado: o conteúdo não corresponde ao tipo informado (${declaredLabel}). O arquivo pode ter sido renomeado.`
  };
};

// Format file size for display
export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

// Get file category from MIME type
export const getFileCategory = (mimeType: string): FileTypeConfig['category'] | null => {
  const mime = mimeType.toLowerCase();
  
  for (const config of Object.values(WHATSAPP_FILE_TYPES)) {
    if (config.mimeTypes.includes(mime)) {
      return config.category;
    }
  }
  
  // Fallback based on MIME prefix
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('application/') || mime.startsWith('text/')) return 'document';
  
  return null;
};

// Get max file size for category
export const getMaxSizeForCategory = (category: FileTypeConfig['category']): number => {
  const config = Object.values(WHATSAPP_FILE_TYPES).find(c => c.category === category);
  return config?.maxSizeMB || 16;
};

// Get file extension from filename
export const getFileExtension = (fileName: string): string => {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts.pop() || '' : '';
};

// Get filename from URL
export const getFileNameFromUrl = (url: string): string => {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const segments = pathname.split('/');
    return segments[segments.length - 1] || 'file';
  } catch {
    return 'file';
  }
};

// Contact types for categorization
export const CONTACT_TYPES = [
  { value: 'cliente', label: 'Cliente', color: 'bg-blue-500' },
  { value: 'fornecedor', label: 'Fornecedor', color: 'bg-purple-500' },
  { value: 'transportadora', label: 'Transportadora', color: 'bg-info' },
  { value: 'colaborador', label: 'Colaborador', color: 'bg-green-500' },
  { value: 'prestador_servico', label: 'Prestador de Serviço', color: 'bg-warning' },
  { value: 'parceiro', label: 'Parceiro', color: 'bg-destructive' },
] as const;

export type ContactType = typeof CONTACT_TYPES[number]['value'];

export const getContactTypeInfo = (type: string) => {
  return CONTACT_TYPES.find(t => t.value === type) || CONTACT_TYPES[0];
};
