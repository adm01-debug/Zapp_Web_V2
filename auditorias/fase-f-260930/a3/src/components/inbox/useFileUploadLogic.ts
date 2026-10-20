import { useState, useRef, useCallback } from 'react';
import { log } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { validateFile, FileValidationResult } from '@/utils/whatsappFileTypes';
import { compressImage, formatCompressionInfo } from '@/utils/imageCompression';
import { sendOutboundMessage, type OutboundMessageType } from '@/services/outbound-message.service';

interface FileMessageData {
  mediaUrl?: string;
  messageType?: string;
  [key: string]: unknown;
}

interface FilePreview {
  file: File;
  validation: FileValidationResult;
  preview?: string;
}

interface UploadedPrivateObject {
  locatorUrl: string;
  storagePath: string;
}

interface QueuedFile extends FilePreview {
  id: string;
  status: 'pending' | 'uploading' | 'sending' | 'done' | 'error';
  progress: number;
  error?: string;
}

const categoryOrder: Record<string, number> = { image: 0, video: 1, audio: 2, document: 3, sticker: 4 };
const MAX_FILES = 10;

// Storage isolation hardening: nomes de arquivo enviados pelo usuário viram
// parte do caminho no bucket público whatsapp-media. Sem isso, caracteres
// fora de [a-zA-Z0-9._-] (acentos, espaços, símbolos) chegam intactos ao
// Storage API.
function sanitizeStorageFileName(fileName: string): string {
  const normalized = fileName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/-+\./g, '.')
    .replace(/\.-+/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 120);

  return normalized || 'arquivo';
}

function createStorageObjectId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  if (typeof globalThis.crypto?.getRandomValues !== 'function') {
    throw new Error('Não foi possível gerar um identificador seguro para o arquivo');
  }

  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

export type { FileMessageData, FilePreview, QueuedFile };

export function useFileUploadLogic(opts: {
  instanceName?: string;
  recipientNumber?: string;
  contactId?: string;
  connectionId?: string;
  onFileSelect?: (file: File, category: string) => void;
  onFileSent?: (messageData: FileMessageData) => void;
}) {
  const { contactId, connectionId, onFileSelect, onFileSent } = opts;

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [fileQueue, setFileQueue] = useState<QueuedFile[]>([]);
  const [isMultiMode, setIsMultiMode] = useState(false);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<'uploading' | 'sending' | null>(null);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const apiLoading = false;

  // Best-effort: um objeto que ficou órfão no bucket (upload ok, envio
  // seguinte falhou) não trava o fluxo do usuário nem vira erro fatal.
  const removeStoredObjectBestEffort = useCallback(async (storagePath: string) => {
    try {
      const { error } = await supabase.storage.from('whatsapp-media').remove([storagePath]);
      if (error) log.warn('Não foi possível remover o upload órfão do storage:', error);
    } catch (err) {
      log.warn('Não foi possível remover o upload órfão do storage:', err);
    }
  }, []);

  const processFilesToQueue = useCallback((files: File[]): QueuedFile[] => {
    const processed = files.slice(0, MAX_FILES).map((file, index) => {
      const validation = validateFile(file);
      let preview: string | undefined;
      if (validation.valid && (validation.category === 'image' || file.type === 'application/pdf')) {
        preview = URL.createObjectURL(file);
      }
      return { id: `${Date.now()}-${index}`, file, validation, preview, status: 'pending' as const, progress: 0 };
    });
    return processed.sort((a, b) => (categoryOrder[a.validation.category || 'document'] ?? 99) - (categoryOrder[b.validation.category || 'document'] ?? 99));
  }, []);

  const uploadFileToStorage = useCallback(async (file: File): Promise<UploadedPrivateObject> => {
    if (!contactId) throw new Error('Selecione uma conversa antes de enviar um arquivo.');

    let fileToUpload = file;
    if (file.type.startsWith('image/') && file.type !== 'image/gif') {
      try {
        const result = await compressImage(file);
        if (result.wasCompressed) {
          log.debug('Image compressed:', formatCompressionInfo(result.originalSize, result.compressedSize));
          fileToUpload = result.file;
        }
      } catch (err) { log.warn('Image compression failed:', err); }
    }
    const safeFileName = sanitizeStorageFileName(fileToUpload.name);
    // Escopado por contato: isola os arquivos de cada conversa no bucket
    // (antes era uma única pasta uploads/ compartilhada por todo mundo) e
    // torna qualquer limpeza/auditoria rastreável até o contato de origem.
    const filePath = `${contactId}/${createStorageObjectId()}-${safeFileName}`;

    const { error } = await supabase.storage.from('whatsapp-media').upload(filePath, fileToUpload, { cacheControl: '31536000', upsert: false });
    if (error) throw new Error(`Erro ao fazer upload: ${error.message}`);

    const { data: locatorData } = supabase.storage.from('whatsapp-media').getPublicUrl(filePath);
    if (!locatorData?.publicUrl) {
      await removeStoredObjectBestEffort(filePath);
      throw new Error('Erro ao gerar referência durável do arquivo');
    }
    return { locatorUrl: locatorData.publicUrl, storagePath: filePath };
  }, [contactId, removeStoredObjectBestEffort]);

  const handleClose = useCallback(() => {
    if (filePreview?.preview) URL.revokeObjectURL(filePreview.preview);
    fileQueue.forEach(f => { if (f.preview) URL.revokeObjectURL(f.preview); });
    setFilePreview(null);
    setFileQueue([]);
    setIsMultiMode(false);
    setCaption('');
    setCurrentQueueIndex(0);
    setIsDialogOpen(false);
  }, [filePreview, fileQueue]);

  const sendFileViaApi = useCallback(async (file: File, category: string | undefined, cap?: string) => {
    if (!contactId) throw new Error('Selecione uma conversa antes de enviar um arquivo.');
    const { locatorUrl, storagePath } = await uploadFileToStorage(file);
    const messageContent = category === 'document' ? file.name : `[${category === 'image' ? 'Imagem' : category === 'video' ? 'Vídeo' : category === 'audio' ? 'Áudio' : category === 'sticker' ? 'Sticker' : 'Arquivo'}]`;
    const messageType: OutboundMessageType = category === 'image' || category === 'video' || category === 'audio' || category === 'sticker'
      ? category
      : 'document';
    try {
      const result = await sendOutboundMessage({
        contactId, content: messageContent, messageType, mediaUrl: locatorUrl,
        caption: cap?.trim() || null, whatsappConnectionId: connectionId ?? null,
      });
      return { result, mediaUrl: locatorUrl, category: messageType };
    } catch (error) {
      await removeStoredObjectBestEffort(storagePath);
      throw error;
    }
  }, [contactId, connectionId, uploadFileToStorage, removeStoredObjectBestEffort]);

  const handleSendFile = useCallback(async () => {
    if (!filePreview || !filePreview.validation.valid) return;
    if (!contactId) {
      onFileSelect?.(filePreview.file, filePreview.validation.category || 'document');
      handleClose();
      return;
    }
    const file = filePreview.file;
    const category = filePreview.validation.category;
    const currentCaption = caption;
    handleClose();
    toast.info('Enviando arquivo...', { id: 'file-upload', duration: 30000 });
    try {
      const sent = await sendFileViaApi(file, category, currentCaption);
      toast.success('Arquivo enviado!', { id: 'file-upload' });
      if (sent) onFileSent?.({ ...sent.result, mediaUrl: sent.mediaUrl, messageType: sent.category });
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      log.error('Error sending file:', error);
      toast.error(error.message || 'Erro ao enviar arquivo', { id: 'file-upload' });
    }
  }, [filePreview, contactId, caption, handleClose, sendFileViaApi, onFileSelect, onFileSent]);

  const sendSingleQueueFile = useCallback(async (queuedFile: QueuedFile, index: number): Promise<boolean> => {
    if (!queuedFile.validation.valid || !contactId) return false;
    setFileQueue(prev => prev.map((f, i) => i === index ? { ...f, status: 'uploading', progress: 0 } : f));
    try {
      const sent = await sendFileViaApi(queuedFile.file, queuedFile.validation.category, undefined);
      setFileQueue(prev => prev.map((f, i) => i === index ? { ...f, status: 'done', progress: 100 } : f));
      if (sent) onFileSent?.({ ...sent.result, mediaUrl: sent.mediaUrl, messageType: sent.category });
      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      log.error('Error sending queued file:', error);
      setFileQueue(prev => prev.map((f, i) => i === index ? { ...f, status: 'error', error: error.message } : f));
      return false;
    }
  }, [contactId, sendFileViaApi, onFileSent]);

  const handleSendAllFiles = useCallback(async () => {
    if (fileQueue.length === 0) return;
    setUploading(true);
    let successCount = 0, errorCount = 0;
    for (let i = 0; i < fileQueue.length; i++) {
      setCurrentQueueIndex(i);
      if (fileQueue[i].validation.valid) {
        const success = await sendSingleQueueFile(fileQueue[i], i);
        if (success) successCount++;
        else errorCount++;
        if (i < fileQueue.length - 1) await new Promise(r => setTimeout(r, 500));
      } else { errorCount++; }
    }
    setUploading(false);
    if (successCount > 0) toast.success(`${successCount} arquivo(s) enviado(s) com sucesso!`);
    if (errorCount > 0) toast.error(`${errorCount} arquivo(s) falharam ao enviar`);
    setTimeout(handleClose, 1000);
  }, [fileQueue, sendSingleQueueFile, handleClose]);

  const handleExternalFile = useCallback((file: File) => {
    const validation = validateFile(file);
    let preview: string | undefined;
    if (validation.valid && (validation.category === 'image' || file.type === 'application/pdf')) preview = URL.createObjectURL(file);
    setFilePreview({ file, validation, preview });
    setIsMultiMode(false);
    setFileQueue([]);
    setCaption('');
    setIsDialogOpen(true);
  }, []);

  const handleExternalFiles = useCallback((files: File[]) => {
    if (files.length > MAX_FILES) toast.warning(`Limite de ${MAX_FILES} arquivos por vez.`);
    if (files.length === 1) {
      handleExternalFile(files[0]);
    } else {
      setFileQueue(processFilesToQueue(files));
      setIsMultiMode(true);
      setFilePreview(null);
    }
    setCaption('');
    setCurrentQueueIndex(0);
    setIsDialogOpen(true);
  }, [handleExternalFile, processFilesToQueue]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validation = validateFile(file);
    let preview: string | undefined;
    if (validation.valid && (validation.category === 'image' || file.type === 'application/pdf')) preview = URL.createObjectURL(file);
    setFilePreview({ file, validation, preview });
    setCaption('');
    setIsDialogOpen(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const removeFromQueue = useCallback((id: string) => {
    setFileQueue(prev => {
      const file = prev.find(f => f.id === id);
      if (file?.preview) URL.revokeObjectURL(file.preview);
      return prev.filter(f => f.id !== id);
    });
  }, []);

  const canSend = !!contactId;
  const validFilesCount = fileQueue.filter(f => f.validation.valid).length;
  const totalQueueProgress = fileQueue.length > 0 ? Math.round(fileQueue.reduce((acc, f) => acc + f.progress, 0) / fileQueue.length) : 0;

  return {
    isDialogOpen, filePreview, fileQueue, isMultiMode, caption, setCaption,
    uploading, uploadProgress, uploadStage, currentQueueIndex, fileInputRef,
    apiLoading, canSend, validFilesCount, totalQueueProgress,
    handleClose, handleSendFile, handleSendAllFiles, handleFileChange,
    handleExternalFile, handleExternalFiles, removeFromQueue,
  };
}
