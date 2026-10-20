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
  { value: 'colaborador', label: 'Colaborador', color: 'bg-green-500' },
  { value: 'prestador_servico', label: 'Prestador de Serviço', color: 'bg-warning' },
  { value: 'lead', label: 'Lead', color: 'bg-yellow-500' },
  { value: 'parceiro', label: 'Parceiro', color: 'bg-destructive' },
  { value: 'sicoob_gifts', label: 'Sicoob Gifts', color: 'bg-info' },
  { value: 'transportadora', label: 'Transportadora', color: 'bg-info' },
  { value: 'outros', label: 'Outros', color: 'bg-gray-500' },
] as const;

export type ContactType = typeof CONTACT_TYPES[number]['value'];

export const getContactTypeInfo = (type: string) => {
  return CONTACT_TYPES.find(t => t.value === type) || CONTACT_TYPES[0];
};
