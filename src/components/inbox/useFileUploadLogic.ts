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

interface QueuedFile extends FilePreview {
  id: string;
  status: 'pending' | 'uploading' | 'sending' | 'done' | 'error';
  progress: number;
  error?: string;
}

const categoryOrder: Record<string, number> = { image: 0, video: 1, audio: 2, document: 3, sticker: 4 };
const MAX_FILES = 10;

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

  const uploadFileToStorage = useCallback(async (file: File): Promise<string> => {
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
    const fileExt = fileToUpload.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `uploads/${fileName}`;

    const { error } = await supabase.storage.from('whatsapp-media').upload(filePath, fileToUpload, { cacheControl: '31536000', upsert: false });
    if (error) throw new Error(`Erro ao fazer upload: ${error.message}`);

    const { data: signedData, error: signError } = await supabase.storage.from('whatsapp-media').createSignedUrl(filePath, 3600);
    if (signError || !signedData?.signedUrl) throw new Error('Erro ao gerar URL do arquivo');
    return signedData.signedUrl;
  }, []);

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
    if (!instanceName || !recipientNumber) return null;
    const mediaUrl = await uploadFileToStorage(file);
    const messageContent = category === 'document' ? file.name : cap || `[${category === 'image' ? 'Imagem' : category === 'video' ? 'Vídeo' : category === 'audio' ? 'Áudio' : 'Arquivo'}]`;

    const apiPromise = category === 'audio'
      ? sendAudioMessage(instanceName, recipientNumber, mediaUrl)
      : sendMediaMessage({ instanceName, number: recipientNumber, mediaUrl, mediaType: category as 'image' | 'video' | 'audio' | 'document', caption: cap || undefined });

    const dbPromise = contactId
      ? supabase.from('messages').insert({ contact_id: contactId, whatsapp_connection_id: connectionId || null, content: messageContent, message_type: category || 'document', media_url: mediaUrl, sender: 'agent', status: 'sending' }).select('id').single()
      : Promise.resolve(null);

    const [result, dbResult] = await Promise.all([apiPromise, dbPromise]);
    const externalId = result?.key?.id || null;
    if (dbResult?.data?.id && externalId) {
      supabase.from('messages').update({ external_id: externalId, status: 'sent' }).eq('id', dbResult.data.id).then(() => {});
    }
    return { result, mediaUrl, category };
  }, [instanceName, recipientNumber, contactId, connectionId, uploadFileToStorage, sendMediaMessage, sendAudioMessage]);

  const handleSendFile = useCallback(async () => {
    if (!filePreview || !filePreview.validation.valid) return;
    if (!instanceName || !recipientNumber) {
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
  }, [filePreview, instanceName, recipientNumber, caption, handleClose, sendFileViaApi, onFileSelect, onFileSent]);

  const sendSingleQueueFile = useCallback(async (queuedFile: QueuedFile, index: number): Promise<boolean> => {
    if (!queuedFile.validation.valid || !instanceName || !recipientNumber) return false;
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
  }, [instanceName, recipientNumber, sendFileViaApi, onFileSent]);

  const handleSendAllFiles = useCallback(async () => {
    if (fileQueue.length === 0) return;
    setUploading(true);
    let successCount = 0, errorCount = 0;
    for (let i = 0; i < fileQueue.length; i++) {
      setCurrentQueueIndex(i);
      if (fileQueue[i].validation.valid) {
        const success = await sendSingleQueueFile(fileQueue[i], i);
        success ? successCount++ : errorCount++;
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

  const canSend = !!(instanceName && recipientNumber);
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
