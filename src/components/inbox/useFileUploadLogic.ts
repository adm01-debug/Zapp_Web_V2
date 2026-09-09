import { useState, useRef, useCallback } from 'react';
import { log } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { useEvolutionApi } from '@/hooks/integrations/useEvolutionApi';
import { toast } from 'sonner';
import { validateFile, FileValidationResult } from '@/utils/whatsappFileTypes';
import { compressImage, formatCompressionInfo } from '@/utils/imageCompression';

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
  deliveryUrl: string;
  locatorUrl: string;
  storagePath: string;
}

export interface FileDeliveryOutcome {
  result: FileMessageData;
  mediaUrl: string;
  category: string | undefined;
  deliveryState: 'sent' | 'history_pending';
  historyPending: boolean;
}

interface QueuedFile extends FilePreview {
  id: string;
  status: 'pending' | 'uploading' | 'sending' | 'done' | 'error';
  progress: number;
  error?: string;
}

const categoryOrder: Record<string, number> = { image: 0, video: 1, audio: 2, document: 3, sticker: 4 };
const MAX_FILES = 10;

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

function asFileMessageData(result: unknown): FileMessageData {
  return result !== null && typeof result === 'object'
    ? { ...(result as Record<string, unknown>) }
    : {};
}

function getExternalMessageId(result: unknown): string | null {
  if (result === null || typeof result !== 'object') return null;
  const directKey = (result as { key?: unknown }).key;
  if (directKey !== null && typeof directKey === 'object') {
    const directId = (directKey as { id?: unknown }).id;
    if (typeof directId === 'string' && directId.trim()) return directId;
  }

  const nestedData = (result as { data?: unknown }).data;
  if (nestedData !== null && typeof nestedData === 'object') {
    const nestedKey = (nestedData as { key?: unknown }).key;
    if (nestedKey !== null && typeof nestedKey === 'object') {
      const nestedId = (nestedKey as { id?: unknown }).id;
      if (typeof nestedId === 'string' && nestedId.trim()) return nestedId;
    }
  }

  return null;
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
  const { instanceName, recipientNumber, contactId, connectionId, onFileSelect, onFileSent } = opts;

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

  const { sendMediaMessage, sendAudioMessage, isLoading: apiLoading } = useEvolutionApi();

  const removeStoredObjectBestEffort = useCallback(async (storagePath: string) => {
    try {
      const { error } = await supabase.storage.from('whatsapp-media').remove([storagePath]);
      if (error) log.warn('Não foi possível remover o upload órfão do storage');
    } catch {
      log.warn('Não foi possível remover o upload órfão do storage');
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
    if (!contactId || !/^[a-zA-Z0-9_-]+$/.test(contactId)) {
      throw new Error('Contato inválido para o upload do arquivo');
    }

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
    const filePath = `${contactId}/${createStorageObjectId()}-${safeFileName}`;

    const { error } = await supabase.storage.from('whatsapp-media').upload(filePath, fileToUpload, { cacheControl: '31536000', upsert: false });
    if (error) throw new Error(`Erro ao fazer upload: ${error.message}`);

    try {
      const { data: signedData, error: signError } = await supabase.storage.from('whatsapp-media').createSignedUrl(filePath, 3600);
      if (signError || !signedData?.signedUrl) {
        throw new Error('Erro ao gerar URL do arquivo');
      }
      const { data: locatorData } = supabase.storage.from('whatsapp-media').getPublicUrl(filePath);
      if (!locatorData?.publicUrl) {
        throw new Error('Erro ao gerar referência durável do arquivo');
      }
      return { deliveryUrl: signedData.signedUrl, locatorUrl: locatorData.publicUrl, storagePath: filePath };
    } catch (error) {
      await removeStoredObjectBestEffort(filePath);
      throw error;
    }
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

  const markMessageAsFailed = useCallback(async (messageId: string) => {
    try {
      const { error } = await supabase.from('messages').update({ status: 'failed' }).eq('id', messageId);
      if (error) log.warn('Falha ao registrar o status de erro da mensagem');
    } catch {
      log.warn('Falha ao registrar o status de erro da mensagem');
    }
  }, []);

  const sendFileViaApi = useCallback(async (file: File, category: string | undefined, cap?: string): Promise<FileDeliveryOutcome | null> => {
    if (!instanceName || !recipientNumber) return null;
    const { deliveryUrl, locatorUrl, storagePath } = await uploadFileToStorage(file);
    const messageContent = category === 'document' ? file.name : cap || `[${category === 'image' ? 'Imagem' : category === 'video' ? 'Vídeo' : category === 'audio' ? 'Áudio' : 'Arquivo'}]`;

    let dbResult;
    try {
      dbResult = await supabase
        .from('messages')
        .insert({ contact_id: contactId, whatsapp_connection_id: connectionId || null, content: messageContent, message_type: category || 'document', media_url: locatorUrl, sender: 'agent', status: 'sending' })
        .select('id')
        .single();
    } catch (error) {
      await removeStoredObjectBestEffort(storagePath);
      throw error;
    }

    if (dbResult.error || !dbResult.data?.id) {
      await removeStoredObjectBestEffort(storagePath);
      throw new Error('Não foi possível registrar o envio. O arquivo não foi enviado.');
    }

    const messageId = dbResult.data.id;
    let rawResult: unknown;
    try {
      rawResult = category === 'audio'
        ? await sendAudioMessage(instanceName, recipientNumber, deliveryUrl)
        : await sendMediaMessage({ instanceName, number: recipientNumber, mediaUrl: deliveryUrl, mediaType: category as 'image' | 'video' | 'audio' | 'document', caption: cap || undefined });
    } catch (error) {
      await markMessageAsFailed(messageId);
      throw error;
    }

    const externalId = getExternalMessageId(rawResult);
    if (!externalId) {
      await markMessageAsFailed(messageId);
      throw new Error('A API não confirmou o identificador externo do arquivo');
    }

    let updateError: unknown = null;
    try {
      const updateResult = await supabase
        .from('messages')
        .update({ external_id: externalId, status: 'sent' })
        .eq('id', messageId);
      updateError = updateResult.error;
    } catch (error) {
      updateError = error;
    }

    const result = asFileMessageData(rawResult);
    if (updateError) {
      log.warn('Arquivo entregue, mas a confirmação do histórico ficou pendente');
      return {
        result,
        mediaUrl: locatorUrl,
        category,
        deliveryState: 'history_pending',
        historyPending: true,
      };
    }

    return {
      result,
      mediaUrl: locatorUrl,
      category,
      deliveryState: 'sent',
      historyPending: false,
    };
  }, [instanceName, recipientNumber, contactId, connectionId, uploadFileToStorage, removeStoredObjectBestEffort, sendMediaMessage, sendAudioMessage, markMessageAsFailed]);

  const handleSendFile = useCallback(async (): Promise<FileDeliveryOutcome | null> => {
    if (!filePreview || !filePreview.validation.valid) return null;
    if (!instanceName || !recipientNumber || !contactId) {
      onFileSelect?.(filePreview.file, filePreview.validation.category || 'document');
      handleClose();
      return null;
    }
    const file = filePreview.file;
    const category = filePreview.validation.category;
    const currentCaption = caption;
    handleClose();
    toast.info('Enviando arquivo...', { id: 'file-upload', duration: 30000 });
    try {
      const sent = await sendFileViaApi(file, category, currentCaption);
      if (!sent) return null;
      try {
        onFileSent?.({
          ...sent.result,
          mediaUrl: sent.mediaUrl,
          messageType: sent.category,
          deliveryState: sent.deliveryState,
          historyPending: sent.historyPending,
        });
      } catch {
        log.warn('Falha ao notificar a interface sobre o arquivo entregue');
      }
      if (sent.historyPending) {
        toast.warning('Arquivo entregue ao WhatsApp, mas o histórico local ficou pendente. Não reenvie; atualize a conversa e confirme a entrega.', { id: 'file-upload', duration: 10000 });
      } else {
        toast.success('Arquivo enviado!', { id: 'file-upload' });
      }
      return sent;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      log.error('Error sending file:', error);
      toast.error(error.message || 'Erro ao enviar arquivo', { id: 'file-upload' });
      return null;
    }
  }, [filePreview, instanceName, recipientNumber, contactId, caption, handleClose, sendFileViaApi, onFileSelect, onFileSent]);

  const sendSingleQueueFile = useCallback(async (queuedFile: QueuedFile, index: number): Promise<'sent' | 'history_pending' | 'failed'> => {
    if (!queuedFile.validation.valid || !instanceName || !recipientNumber || !contactId) return 'failed';
    setFileQueue(prev => prev.map((f, i) => i === index ? { ...f, status: 'uploading', progress: 0 } : f));
    try {
      const sent = await sendFileViaApi(queuedFile.file, queuedFile.validation.category, undefined);
      if (!sent) return 'failed';
      setFileQueue(prev => prev.map((f, i) => i === index ? { ...f, status: 'done', progress: 100 } : f));
      try {
        onFileSent?.({
          ...sent.result,
          mediaUrl: sent.mediaUrl,
          messageType: sent.category,
          deliveryState: sent.deliveryState,
          historyPending: sent.historyPending,
        });
      } catch {
        log.warn('Falha ao notificar a interface sobre o arquivo entregue');
      }
      return sent.deliveryState;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      log.error('Error sending queued file:', error);
      setFileQueue(prev => prev.map((f, i) => i === index ? { ...f, status: 'error', error: error.message } : f));
      return 'failed';
    }
  }, [instanceName, recipientNumber, contactId, sendFileViaApi, onFileSent]);

  const handleSendAllFiles = useCallback(async () => {
    if (fileQueue.length === 0) return;
    setUploading(true);
    let successCount = 0, historyPendingCount = 0, errorCount = 0;
    for (let i = 0; i < fileQueue.length; i++) {
      setCurrentQueueIndex(i);
      if (fileQueue[i].validation.valid) {
        const outcome = await sendSingleQueueFile(fileQueue[i], i);
        if (outcome === 'sent') successCount++;
        else if (outcome === 'history_pending') historyPendingCount++;
        else errorCount++;
        if (i < fileQueue.length - 1) await new Promise(r => setTimeout(r, 500));
      } else { errorCount++; }
    }
    setUploading(false);
    if (successCount > 0) toast.success(`${successCount} arquivo(s) enviado(s) com sucesso!`);
    if (historyPendingCount > 0) toast.warning(`${historyPendingCount} arquivo(s) foram entregues ao WhatsApp, mas o histórico local ficou pendente. Não reenvie; confirme a entrega na conversa.`, { duration: 10000 });
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

  const canSend = !!(instanceName && recipientNumber && contactId);
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
